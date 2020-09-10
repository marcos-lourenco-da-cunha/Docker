/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem, window } from 'vscode';
import { DialogResponses } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { DockerBuildTaskDefinition } from '../tasks/DockerBuildTaskProvider';
import { DockerRunTaskDefinition } from '../tasks/DockerRunTaskProvider';
import { netCoreTaskHelper, NetCoreTaskScaffoldingOptions } from '../tasks/netcore/NetCoreTaskHelper';
import { nodeTaskHelper } from '../tasks/node/NodeTaskHelper';
import { pythonTaskHelper } from '../tasks/python/PythonTaskHelper';
import { addTask } from '../tasks/TaskHelper';
import { PythonProjectType, PythonTarget } from '../utils/pythonUtils';
import { addDebugConfiguration, DockerDebugScaffoldContext } from './DebugHelper';
import { DockerDebugConfiguration } from './DockerDebugConfigurationProvider';
import { netCoreDebugHelper, NetCoreDebugScaffoldingOptions } from './netcore/NetCoreDebugHelper';
import { nodeDebugHelper } from './node/NodeDebugHelper';
import { pythonDebugHelper } from './python/PythonDebugHelper';

export type NetCoreScaffoldingOptions = NetCoreDebugScaffoldingOptions | NetCoreTaskScaffoldingOptions;
export interface PythonScaffoldingOptions {
    projectType?: PythonProjectType;
    target?: PythonTarget;
}

export interface IDockerDebugScaffoldingProvider {
    initializeNetCoreForDebugging(context: DockerDebugScaffoldContext, options?: NetCoreScaffoldingOptions): Promise<void>;
    initializeNodeForDebugging(context: DockerDebugScaffoldContext): Promise<void>;
    initializePythonForDebugging(context: DockerDebugScaffoldContext, options: PythonScaffoldingOptions): Promise<void>;
}

export class DockerDebugScaffoldingProvider implements IDockerDebugScaffoldingProvider {
    public async initializeNetCoreForDebugging(context: DockerDebugScaffoldContext, options?: NetCoreScaffoldingOptions): Promise<void> {
        await this.initializeForDebugging(
            context,
            /* eslint-disable @typescript-eslint/promise-function-async */
            () => netCoreDebugHelper.provideDebugConfigurations(context, options),
            () => netCoreTaskHelper.provideDockerBuildTasks(context, options),
            () => netCoreTaskHelper.provideDockerRunTasks(context, options));
        /* eslint-enable @typescript-eslint/promise-function-async */
    }

    public async initializeNodeForDebugging(context: DockerDebugScaffoldContext): Promise<void> {
        await this.initializeForDebugging(
            context,
            /* eslint-disable @typescript-eslint/promise-function-async */
            () => nodeDebugHelper.provideDebugConfigurations(context),
            () => nodeTaskHelper.provideDockerBuildTasks(context),
            () => nodeTaskHelper.provideDockerRunTasks(context));
        /* eslint-enable @typescript-eslint/promise-function-async */
    }

    public async initializePythonForDebugging(context: DockerDebugScaffoldContext, options?: PythonScaffoldingOptions): Promise<void> {
        await this.initializeForDebugging(
            context,
            /* eslint-disable @typescript-eslint/promise-function-async */
            () => pythonDebugHelper.provideDebugConfigurations(context, options),
            () => pythonTaskHelper.provideDockerBuildTasks(context),
            () => pythonTaskHelper.provideDockerRunTasks(context, options)
            /* eslint-enable @typescript-eslint/promise-function-async */
        );
    }

    private async initializeForDebugging(
        context: DockerDebugScaffoldContext,
        provideDebugConfigurations: () => Promise<DockerDebugConfiguration[]>,
        provideDockerBuildTasks: () => Promise<DockerBuildTaskDefinition[]>,
        provideDockerRunTasks: () => Promise<DockerRunTaskDefinition[]>): Promise<void> {
        let overwrite: boolean | undefined;

        const buildTasks = await provideDockerBuildTasks();
        const runTasks = await provideDockerRunTasks();
        const debugConfigurations = await provideDebugConfigurations();

        for (const buildTask of buildTasks) {
            /* eslint-disable-next-line @typescript-eslint/promise-function-async */
            overwrite = await DockerDebugScaffoldingProvider.addObjectWithOverwritePrompt((_overwrite?: boolean) => addTask(buildTask, context.folder, _overwrite), overwrite);
        }

        for (const runTask of runTasks) {
            /* eslint-disable-next-line @typescript-eslint/promise-function-async */
            overwrite = await DockerDebugScaffoldingProvider.addObjectWithOverwritePrompt((_overwrite?: boolean) => addTask(runTask, context.folder, _overwrite), overwrite);
        }

        for (const debugConfiguration of debugConfigurations) {
            /* eslint-disable-next-line @typescript-eslint/promise-function-async */
            overwrite = await DockerDebugScaffoldingProvider.addObjectWithOverwritePrompt((_overwrite?: boolean) => addDebugConfiguration(debugConfiguration, context.folder, _overwrite), overwrite);
        }
    }

    private static async addObjectWithOverwritePrompt(addMethod: (_overwrite?: boolean) => Promise<boolean>, overwrite?: boolean): Promise<boolean | undefined> {
        const added = await addMethod(overwrite);

        if (!added && overwrite === undefined) {
            // If it did not get added due to duplicate, and we haven't prompted yet, prompt now
            const overwriteMessageItem: MessageItem = {
                title: 'Overwrite'
            };

            overwrite = (overwriteMessageItem === await window.showWarningMessage(localize('vscode-docker.debug.scaffoldProvider.confirm', 'Docker launch configurations and/or tasks already exist. Do you want to overwrite them?'), ...[overwriteMessageItem, DialogResponses.no]));

            if (overwrite) {
                // Try again if needed
                await addMethod(overwrite);
            }
        }

        return overwrite;
    }
}

export const dockerDebugScaffoldingProvider: IDockerDebugScaffoldingProvider = new DockerDebugScaffoldingProvider();
