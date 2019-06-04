/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, window } from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { TagTreeItemBase } from '../tree/TagTreeItemBase';

export async function deleteImage(context: IActionContext, node?: TagTreeItemBase): Promise<void> {
    if (!node) {
        node = await ext.registriesTree.showTreeItemPicker<TagTreeItemBase>(/^(azure|private)Tag$/i, { ...context, suppressCreatePick: true });
    }

    const confirmDelete = `Are you sure you want to delete image "${node.fullTag}"? This will delete all images that have the same digest.`;
    // no need to check result - cancel will throw a UserCancelledError
    await ext.ui.showWarningMessage(confirmDelete, { modal: true }, DialogResponses.deleteResponse);

    const deleting = `Deleting image "${node.fullTag}"...`;
    await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async () => {
        await node.deleteTreeItem(context);
    });

    const message = `Successfully deleted image "${node.fullTag}".`;
    // don't wait
    window.showInformationMessage(message);
}
