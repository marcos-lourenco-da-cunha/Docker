/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext, IAzureQuickPickOptions } from 'vscode-azureextensionui';

import { extensionId } from '../constants';
import { ext } from '../extensionVariables';
import { openExternal } from '../utils/openExternal';

interface HelpMenuItem extends vscode.QuickPickItem {
    handler(): Promise<void>,
    telemetryID: string
}

export async function help(context: IActionContext): Promise<void> {
    let items: HelpMenuItem[] = [
        { label: 'Get started with Docker...', handler: getStarted, telemetryID: 'getStarted' },
        { label: 'Review Docker extension issues...', handler: reviewIssues, telemetryID: 'reviewIssues' },
        { label: 'Report Docker extension issue...', handler: reportIssue, telemetryID: 'reportIssue' },
        { label: 'Edit settings...', handler: editSettings, telemetryID: 'editSettings' }
    ];

    const options: IAzureQuickPickOptions = { canPickMany: false, suppressPersistence: true }
    let selectedItem: HelpMenuItem = await ext.ui.showQuickPick(items, options);
    context.telemetry.properties.helpItem = selectedItem.telemetryID;
    await selectedItem.handler();
}

async function getStarted(): Promise<void> {
    /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
    openExternal("https://code.visualstudio.com/docs/containers/overview");
}

async function reviewIssues(): Promise<void> {
    /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
    openExternal("https://github.com/microsoft/vscode-docker/issues");
}

async function reportIssue(): Promise<void> {
    return vscode.commands.executeCommand('vscode.openIssueReporter', `${extensionId}`);
}

async function editSettings(): Promise<void> {
    return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId}`);
}
