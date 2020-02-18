/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { COMPOSE_FILE_GLOB_PATTERN } from '../constants';
import { ext } from '../extensionVariables';
import { quickPickWorkspaceFolder } from '../utils/quickPickWorkspaceFolder';

async function getDockerComposeFileUris(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles(new vscode.RelativePattern(folder, COMPOSE_FILE_GLOB_PATTERN), null, 9999, undefined);
}

interface Item extends vscode.QuickPickItem {
    path: string,
    file: string
}

function createItem(folder: vscode.WorkspaceFolder, uri: vscode.Uri): Item {
    const filePath = folder ? path.join('.', uri.fsPath.substr(folder.uri.fsPath.length)) : uri.fsPath;

    return <Item>{
        description: undefined,
        file: filePath,
        label: filePath,
        path: path.dirname(filePath)
    };
}

function computeItems(folder: vscode.WorkspaceFolder, uris: vscode.Uri[]): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = [];
    /* eslint-disable-next-line @typescript-eslint/prefer-for-of */ // Grandfathered in
    for (let i = 0; i < uris.length; i++) {
        items.push(createItem(folder, uris[i]));
    }
    return items;
}

async function compose(commands: ('up' | 'down')[], message: string, dockerComposeFileUri?: vscode.Uri, selectedComposeFileUris?: vscode.Uri[]): Promise<void> {
    let folder: vscode.WorkspaceFolder = await quickPickWorkspaceFolder('To run Docker compose you must first open a folder or workspace in VS Code.');

    let commandParameterFileUris: vscode.Uri[];
    if (selectedComposeFileUris && selectedComposeFileUris.length) {
        commandParameterFileUris = selectedComposeFileUris;
    } else if (dockerComposeFileUri) {
        commandParameterFileUris = [dockerComposeFileUri];
    } else {
        commandParameterFileUris = [];
    }
    let selectedItems: Item[] = commandParameterFileUris.map(uri => createItem(folder, uri));
    if (!selectedItems.length) {
        // prompt for compose file
        const uris: vscode.Uri[] = await getDockerComposeFileUris(folder);
        if (!uris || uris.length === 0) {
            /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
            vscode.window.showInformationMessage('Couldn\'t find any docker-compose files in your workspace.');
            return;
        }

        const items: vscode.QuickPickItem[] = computeItems(folder, uris);

        if ((items.length === 1 && isDefaultDockerComposeFile(items[0].label))
            || (items.length === 2 && items.some(i => isDefaultDockerComposeFile(i.label)) && items.some(i => isDefaultDockerComposeOverrideFile(i.label)))) {
            // if the current set of docker files contain only docker-compose.yml or docker-compose.yml with override file,
            // don't ask user for a docker file and let docker-compose automatically pick these files.
        } else {
            selectedItems = [<Item>await ext.ui.showQuickPick(items, { placeHolder: `Choose Docker Compose file ${message}` })];
        }
    }

    const terminal: vscode.Terminal = ext.terminalProvider.createTerminal('Docker Compose');
    const configOptions: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('docker');
    const build: string = configOptions.get('dockerComposeBuild', true) ? '--build' : '';
    const detached: string = configOptions.get('dockerComposeDetached', true) ? '-d' : '';

    terminal.sendText(`cd "${folder.uri.fsPath}"`);
    for (let command of commands) {
        if (selectedItems.length === 0) {
            terminal.sendText(command.toLowerCase() === 'up' ? `docker-compose ${command} ${detached} ${build}` : `docker-compose ${command}`);
        } else {
            selectedItems.forEach((item: Item) => {
                terminal.sendText(command.toLowerCase() === 'up' ? `docker-compose -f "${item.file}" ${command} ${detached} ${build}` : `docker-compose -f "${item.file}" ${command}`);
            });
        }
        terminal.show();
    }
}

function isDefaultDockerComposeFile(fileName: string): boolean {
    if (fileName) {
        const lowerCasefileName: string = fileName.toLowerCase();
        return lowerCasefileName === 'docker-compose.yml' || lowerCasefileName === 'docker-compose.yaml'
    }

    return false;
}

function isDefaultDockerComposeOverrideFile(fileName: string): boolean {
    if (fileName) {
        const lowerCasefileName: string = fileName.toLowerCase();
        return lowerCasefileName === 'docker-compose.override.yml' || lowerCasefileName === 'docker-compose.override.yaml'
    }

    return false;
}

export async function composeUp(_context: IActionContext, dockerComposeFileUri?: vscode.Uri, selectedComposeFileUris?: vscode.Uri[]): Promise<void> {
    return await compose(['up'], 'to bring up', dockerComposeFileUri, selectedComposeFileUris);
}

export async function composeDown(_context: IActionContext, dockerComposeFileUri?: vscode.Uri, selectedComposeFileUris?: vscode.Uri[]): Promise<void> {
    return await compose(['down'], 'to take down', dockerComposeFileUri, selectedComposeFileUris);
}

export async function composeRestart(_context: IActionContext, dockerComposeFileUri?: vscode.Uri, selectedComposeFileUris?: vscode.Uri[]): Promise<void> {
    return await compose(['down', 'up'], 'to restart', dockerComposeFileUri, selectedComposeFileUris);
}
