/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerRegistryManagementClient, ContainerRegistryManagementModels as AcrModels } from "azure-arm-containerregistry";
import { BlobService, createBlobServiceWithSas } from "azure-storage";
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import * as vscode from 'vscode';
import { IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../../../../extensionVariables';
import { localize } from "../../../../localize";
import { AzureRegistryTreeItem } from '../../../../tree/registries/azure/AzureRegistryTreeItem';
import { registryExpectedContextValues } from "../../../../tree/registries/registryContextValues";
import { getBlobInfo, streamLogs } from "../../../../utils/azureUtils";
import { delay } from '../../../../utils/delay';
import { Item, quickPickDockerFileItem, quickPickYamlFileItem } from '../../../../utils/quickPickFile';
import { quickPickWorkspaceFolder } from '../../../../utils/quickPickWorkspaceFolder';
import { addImageTaggingTelemetry, getTagFromUserInput } from '../../../images/tagImage';

const idPrecision = 6;
const vcsIgnoreList = ['.git', '.gitignore', '.bzr', 'bzrignore', '.hg', '.hgignore', '.svn']

export async function scheduleRunRequest(context: IActionContext, requestType: 'DockerBuildRequest' | 'FileTaskRunRequest', uri: vscode.Uri | undefined): Promise<void> {
    // Acquire information.
    let rootFolder: vscode.WorkspaceFolder;
    let fileItem: Item;
    let imageName: string;
    if (requestType === 'DockerBuildRequest') {
        rootFolder = await quickPickWorkspaceFolder(localize('vscode-docker.commands.registries.azure.tasks.buildFolder', 'To quick build Docker files you must first open a folder or workspace in VS Code.'));
        fileItem = await quickPickDockerFileItem(context, uri, rootFolder);
        imageName = await quickPickImageName(context, rootFolder, fileItem);
    } else if (requestType === 'FileTaskRunRequest') {
        rootFolder = await quickPickWorkspaceFolder(localize('vscode-docker.commands.registries.azure.tasks.yamlFolder', 'To run a task from a .yaml file you must first open a folder or workspace in VS Code.'));
        fileItem = await quickPickYamlFileItem(uri, rootFolder, localize('vscode-docker.commands.registries.azure.tasks.yamlYaml', 'To run a task from a .yaml file you must have yaml file in your VS Code workspace.'));
    } else {
        throw new Error(localize('vscode-docker.commands.registries.azure.tasks.runTypeUnsupported', 'Run Request Type Currently not supported.'));
    }

    const node = await ext.registriesTree.showTreeItemPicker<AzureRegistryTreeItem>(registryExpectedContextValues.azure.registry, context);

    const osPick = ['Linux', 'Windows'].map(item => <IAzureQuickPickItem<string>>{ label: item, data: item });
    const osType: string = (await ext.ui.showQuickPick(osPick, { placeHolder: localize('vscode-docker.commands.registries.azure.tasks.selectOs', 'Select image base OS') })).data;

    const tarFilePath: string = getTempSourceArchivePath();

    // Prepare to run.
    ext.outputChannel.show();

    const uploadedSourceLocation: string = await uploadSourceCode(node.client, node.registryName, node.resourceGroup, rootFolder, tarFilePath);
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.uploaded', 'Uploaded source code to {0}', tarFilePath));

    let runRequest: AcrModels.DockerBuildRequest | AcrModels.FileTaskRunRequest;
    if (requestType === 'DockerBuildRequest') {
        runRequest = {
            type: requestType,
            imageNames: [imageName],
            isPushEnabled: true,
            sourceLocation: uploadedSourceLocation,
            platform: { os: osType },
            dockerFilePath: fileItem.relativeFilePath
        };
    } else {
        runRequest = {
            type: 'FileTaskRunRequest',
            taskFilePath: fileItem.relativeFilePath,
            sourceLocation: uploadedSourceLocation,
            platform: { os: osType }
        }
    }

    // Schedule the run and Clean up.
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.setUp', 'Set up run request'));

    const run = await node.client.registries.scheduleRun(node.resourceGroup, node.registryName, runRequest);
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.scheduledRun', 'Scheduled run {0}', run.runId));

    await streamLogs(node, run);
    await fse.unlink(tarFilePath);
}

async function quickPickImageName(context: IActionContext, rootFolder: vscode.WorkspaceFolder, dockerFileItem: Item | undefined): Promise<string> {
    let absFilePath: string = path.join(rootFolder.uri.fsPath, dockerFileItem.relativeFilePath);
    let dockerFileKey = `ACR_buildTag_${absFilePath}`;
    let prevImageName: string | undefined = ext.context.globalState.get(dockerFileKey);
    let suggestedImageName: string;

    if (!prevImageName) {
        // Get imageName based on name of subfolder containing the Dockerfile, or else workspacefolder
        suggestedImageName = path.basename(dockerFileItem.relativeFolderPath).toLowerCase();
        if (suggestedImageName === '.') {
            suggestedImageName = path.basename(rootFolder.uri.fsPath).toLowerCase().replace(/\s/g, '');
        }

        suggestedImageName += ":{{.Run.ID}}"
    } else {
        suggestedImageName = prevImageName;
    }

    // Temporary work-around for vscode bug where valueSelection can be messed up if a quick pick is followed by a showInputBox
    await delay(500);

    addImageTaggingTelemetry(context, suggestedImageName, '.before');
    const imageName: string = await getTagFromUserInput(suggestedImageName, false);
    addImageTaggingTelemetry(context, imageName, '.after');

    await ext.context.globalState.update(dockerFileKey, imageName);
    return imageName;
}

async function uploadSourceCode(client: ContainerRegistryManagementClient, registryName: string, resourceGroupName: string, rootFolder: vscode.WorkspaceFolder, tarFilePath: string): Promise<string> {
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.sendingSource', '   Sending source code to temp file'));
    let source: string = rootFolder.uri.fsPath;
    let items = await fse.readdir(source);
    items = items.filter(i => !(i in vcsIgnoreList));
    // tslint:disable-next-line:no-unsafe-any
    tar.c({ cwd: source }, items).pipe(fse.createWriteStream(tarFilePath));

    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.gettingBuildSourceUploadUrl', '   Getting build source upload URL'));
    let sourceUploadLocation = await client.registries.getBuildSourceUploadUrl(resourceGroupName, registryName);
    let uploadUrl: string = sourceUploadLocation.uploadUrl;
    let relativePath: string = sourceUploadLocation.relativePath;

    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.gettingBlobInfo', '   Getting blob info from upload URL'));
    // Right now, accountName and endpointSuffix are unused, but will be used for streaming logs later.
    let blobInfo = getBlobInfo(uploadUrl);
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.creatingBlobService', '   Creating blob service'));
    let blob: BlobService = createBlobServiceWithSas(blobInfo.host, blobInfo.sasToken);
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.creatingBlockBlob', '   Creating block blob'));
    await new Promise((resolve, reject) => {
        blob.createBlockBlobFromLocalFile(blobInfo.containerName, blobInfo.blobName, tarFilePath, (error, result, response): void => {
            if (error) {
                reject(error);
            } else {
                resolve({ result, response });
            }
        });
    });
    return relativePath;
}

function getTempSourceArchivePath(): string {
    /* tslint:disable-next-line:insecure-random */
    const id: number = Math.floor(Math.random() * Math.pow(10, idPrecision));
    const archive = `sourceArchive${id}.tar.gz`;
    ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.tasks.settingUpTempFile', 'Setting up temp file with \'{0}\'', archive));
    const tarFilePath: string = path.join(os.tmpdir(), archive);
    return tarFilePath;
}
