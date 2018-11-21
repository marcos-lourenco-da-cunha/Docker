/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from "azure-arm-containerregistry/lib/models";
import * as vscode from "vscode";
import { dockerExplorerProvider } from '../../dockerExtension';
import { AzureRepositoryNode } from '../../explorer/models/azureRegistryNodes';
import * as acrTools from '../../utils/Azure/acrTools';
import { Repository } from "../../utils/Azure/models/repository";
import { confirmUserIntent, quickPickACRRegistry, quickPickACRRepository } from '../utils/quick-pick-azure';

/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteRepository(context?: AzureRepositoryNode): Promise<void> {
    let registry: Registry;
    let repo: Repository;

    if (context) {
        registry = context.registry;
        repo = await Repository.Create(registry, context.label);
    } else {
        registry = await quickPickACRRegistry();
        repo = await quickPickACRRepository(registry, 'Select the repository you want to delete');
    }
    const shouldDelete = await confirmUserIntent(`Are you sure you want to delete ${repo.name} and its associated images?`);
    if (shouldDelete) {
        await acrTools.deleteRepository(repo);
        vscode.window.showInformationMessage(`Successfully deleted repository ${repo.name}`);
        if (context) {
            dockerExplorerProvider.refreshNode(context.parent);
        } else {
            dockerExplorerProvider.refreshRegistries();
        }
    }
}
