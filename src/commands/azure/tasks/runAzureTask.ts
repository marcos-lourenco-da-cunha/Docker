/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerRegistryManagementModels as AcrModels } from "azure-arm-containerregistry";
import { window } from "vscode";
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { AzureTaskTreeItem } from "../../../tree/azure/AzureTaskTreeItem";

export async function runAzureTask(context: IActionContext, node?: AzureTaskTreeItem): Promise<void> {
    if (!node) {
        node = await ext.registriesTree.showTreeItemPicker<AzureTaskTreeItem>(AzureTaskTreeItem.contextValue, context);
    }

    const registryTI = node.parent.parent;
    let runRequest: AcrModels.TaskRunRequest = { type: 'TaskRunRequest', taskName: node.taskName };
    let run = await registryTI.client.registries.scheduleRun(registryTI.resourceGroup, registryTI.registryName, runRequest);
    // don't wait
    window.showInformationMessage(`Successfully scheduled run "${run.runId}" for task "${node.taskName}".`);
}
