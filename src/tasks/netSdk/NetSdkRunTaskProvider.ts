/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CustomExecution, Task, TaskDefinition, TaskScope } from "vscode";
import { DockerPseudoterminal } from "../DockerPseudoterminal";
import { DockerTaskProvider } from '../DockerTaskProvider';
import { DockerTaskExecutionContext } from '../TaskHelper';
import { NetSdkRunTaskType, getNetSdkBuildCommand, getNetSdkRunCommand } from './netSdkTaskUtils';

const NetSdkDebugTaskName = 'debug';
export class NetSdkRunTaskProvider extends DockerTaskProvider {

    public constructor() { super(NetSdkRunTaskType, undefined); }

    public provideTasks(token: CancellationToken): Task[] {

        // we need to initialize a task first so we can pass it into `DockerPseudoterminal`
        const task = new Task(
            { type: NetSdkRunTaskType },
            TaskScope.Workspace,
            NetSdkDebugTaskName,
            NetSdkRunTaskType
        );

        task.execution = new CustomExecution(async (resolvedDefinition: TaskDefinition) =>
            Promise.resolve(new DockerPseudoterminal(this, task, resolvedDefinition))
        );

        return [task];
    }

    protected async executeTaskInternal(context: DockerTaskExecutionContext, task: Task): Promise<void> {

        // use dotnet to build the image
        const buildCommand = await getNetSdkBuildCommand(context);
        await context.terminal.execAsyncInTerminal(
            buildCommand,
            {
                folder: context.folder,
                token: context.cancellationToken,
            }
        );

        // use docker run to run the image
        const runCommand = await getNetSdkRunCommand(context);
        await context.terminal.execAsyncInTerminal(
            runCommand,
            {
                folder: context.folder,
                token: context.cancellationToken,
            }
        );

        return Promise.resolve();
    }
}
