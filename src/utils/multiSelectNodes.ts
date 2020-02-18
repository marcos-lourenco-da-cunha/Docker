/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeDataProvider, AzExtTreeItem, ITreeItemPickerContext, UserCancelledError } from "vscode-azureextensionui";

/**
 * Helps determine the full list of eligible selected tree item nodes for context menu and commands
 * @param context Tree item context
 * @param tree The tree for which to show an item picker (if no nodes were selected, i.e. it was run as a command, not context menu action)
 * @param expectedContextValue Filters to allow an action only for specific context values
 * @param node The primary selected node (if any)
 * @param nodes All selected nodes. VSCode includes the primary by default, only if multiple were selected.
 */
export async function multiSelectNodes<T extends AzExtTreeItem>(
    context: ITreeItemPickerContext,
    tree: AzExtTreeDataProvider,
    expectedContextValue?: RegExp,
    node?: T,
    nodes?: T[]): Promise<T[]> {

    // Ensure it's not undefined
    nodes = nodes || [];

    if (nodes.length === 0 && node) {
        // If there's no multi-selected nodes but primary node is defined, use it as the only element
        nodes = [node];
    }

    if (nodes.length === 0) {
        // If still no selected nodes, need to prompt
        nodes = await tree.showTreeItemPicker<T>(expectedContextValue, { ...context, canPickMany: true });
    } else if (expectedContextValue) {
        // Otherwise if there's a filter, need to filter our selection to exclude ineligible nodes
        nodes = nodes.filter(n => expectedContextValue.test(n.contextValue));
    }

    // Filter off parent items (i.e. group items), as it doesn't make sense to perform actions on them, when we don't allow actions to be performed on *only* them
    nodes = nodes.filter(n => !(n instanceof AzExtParentTreeItem));

    // If we end with no nodes, cancel
    if (nodes.length === 0) {
        throw new UserCancelledError();
    }

    return nodes;
}
