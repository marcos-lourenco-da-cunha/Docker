/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandResponse, CommonOrchestratorCommandOptions, LogsCommandOptions } from '@microsoft/container-runtimes';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { TaskCommandRunnerFactory } from '../../runtimes/runners/TaskCommandRunnerFactory';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

export async function composeGroupLogs(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup<LogsCommandOptions>(context, ext.orchestratorClient.logs, node, { follow: true, tail: 1000 });
}

export async function composeGroupStart(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, ext.orchestratorClient.start, node);
}

export async function composeGroupStop(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, ext.orchestratorClient.stop, node);
}

export async function composeGroupRestart(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, ext.orchestratorClient.restart, node);
}

export async function composeGroupDown(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, ext.orchestratorClient.down, node);
}

type AdditionalOptions<TOptions extends CommonOrchestratorCommandOptions> = Omit<TOptions, keyof CommonOrchestratorCommandOptions>;

async function composeGroup<TOptions extends CommonOrchestratorCommandOptions>(context: IActionContext, composeCommand: (options: TOptions) => Promise<CommandResponse<unknown>>, node: ContainerGroupTreeItem, additionalOptions?: AdditionalOptions<TOptions>): Promise<void> {
    if (!node) {
        await ext.containersTree.refresh(context);
        node = await ext.containersTree.showTreeItemPicker<ContainerGroupTreeItem>(/composeGroup$/i, {
            ...context,
            noItemFoundErrorMessage: localize('vscode-docker.commands.containers.composeGroup.noComposeProjects', 'No Docker Compose projects are running.'),
        });
    }

    const workingDirectory = getComposeWorkingDirectory(node);
    const orchestratorFiles = getComposeFiles(node);
    const projectName = getComposeProjectName(node);
    const envFile = getComposeEnvFile(node);

    if (!workingDirectory || !orchestratorFiles || !projectName) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('vscode-docker.commands.containers.composeGroup.noCompose', 'Unable to determine compose project info for container group \'{0}\'.', node.label));
    }

    const options: TOptions = {
        files: orchestratorFiles,
        projectName: projectName,
        environmentFile: envFile,
        ...additionalOptions,
    } as TOptions;

    const taskCRF = new TaskCommandRunnerFactory({
        taskName: ext.orchestratorClient.displayName,
        cwd: workingDirectory,
    });

    await taskCRF.getCommandRunner()(composeCommand(options));
}

function getComposeWorkingDirectory(node: ContainerGroupTreeItem): string | undefined {
    // Find a container with the `com.docker.compose.project.working_dir` label, which gives the working directory in which to execute the compose command
    const container = (node.ChildTreeItems as ContainerTreeItem[]).find(c => c.labels?.['com.docker.compose.project.working_dir']);
    return container?.labels?.['com.docker.compose.project.working_dir'];
}

function getComposeFiles(node: ContainerGroupTreeItem): string[] | undefined {
    // Find a container with the `com.docker.compose.project.config_files` label, which gives all the compose files (within the working directory) used to up this container
    const container = (node.ChildTreeItems as ContainerTreeItem[]).find(c => c.labels?.['com.docker.compose.project.config_files']);

    // Paths may be subpaths, but working dir generally always directly contains the config files, so unless the file is already absolute, let's cut off the subfolder and get just the file name
    // (In short, the working dir may not be the same as the cwd when the docker-compose up command was called, BUT the files are relative to that cwd)
    // Note, it appears compose v2 *always* uses absolute paths, both for this and `working_dir`
    return container?.labels?.['com.docker.compose.project.config_files']
        ?.split(',')
        ?.map(f => path.isAbsolute(f) ? f : path.parse(f).base);
}

function getComposeProjectName(node: ContainerGroupTreeItem): string | undefined {
    // Find a container with the `com.docker.compose.project` label, which gives the project name
    const container = (node.ChildTreeItems as ContainerTreeItem[]).find(c => c.labels?.['com.docker.compose.project']);
    return container?.labels?.['com.docker.compose.project'];
}

function getComposeEnvFile(node: ContainerGroupTreeItem): string | undefined {
    // Find a container with the `com.docker.compose.project.environment_file` label, which gives the environment file absolute path
    const container = (node.ChildTreeItems as ContainerTreeItem[]).find(c => c.labels?.['com.docker.compose.project.environment_file']);
    return container?.labels?.['com.docker.compose.project.environment_file'];
}
