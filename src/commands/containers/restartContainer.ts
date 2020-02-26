/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Container } from 'dockerode';
import vscode = require('vscode');
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';
import { callDockerodeWithErrorHandling } from '../../utils/callDockerodeWithErrorHandling';
import { multiSelectNodes } from '../../utils/multiSelectNodes';

export async function restartContainer(context: IActionContext, node?: ContainerTreeItem, nodes?: ContainerTreeItem[]): Promise<void> {
    nodes = await multiSelectNodes(
        { ...context, noItemFoundErrorMessage: 'No containers are available to restart' },
        ext.containersTree,
        /^(created|dead|exited|paused|running)Container$/i,
        node,
        nodes
    );

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Restarting Container(s)..." }, async () => {
        await Promise.all(nodes.map(async n => {
            const container: Container = n.getContainer();
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            await callDockerodeWithErrorHandling(() => container.restart(), context);
        }));
    });
}
