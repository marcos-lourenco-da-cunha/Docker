/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as vscode from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';

export async function systemPrune(_context: IActionContext): Promise<void> {
    const configOptions: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('docker');
    const terminal = ext.terminalProvider.createTerminal("docker system prune");

    if (configOptions.get('promptOnSystemPrune', true)) {
        let res = await vscode.window.showWarningMessage<vscode.MessageItem>(
            'Remove all unused containers, volumes, networks and images (both dangling and unreferenced)?',
            { title: 'Yes' },
            { title: 'Cancel', isCloseAffordance: true }
        );

        if (!res || res.isCloseAffordance) {
            return;
        }
    }

    const info = <{ ServerVersion: string }>await ext.dockerode.info();
    // in docker 17.06.1 and higher you must specify the --volumes flag
    if (semver.gte(info.ServerVersion, '17.6.1', true)) {
        terminal.sendText(`docker system prune --volumes -f`);
    } else {
        terminal.sendText(`docker system prune -f`);
    }

    terminal.show();
}
