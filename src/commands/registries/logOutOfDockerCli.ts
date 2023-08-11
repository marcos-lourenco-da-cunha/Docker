/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, contextValueExperience } from '@microsoft/vscode-azext-utils';
import { CommonRegistry } from '@microsoft/vscode-docker-registries';
import { ext } from '../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../runtimes/runners/TaskCommandRunnerFactory';
import { UnifiedRegistryItem } from '../../tree/registries/UnifiedRegistryTreeDataProvider';

export async function logOutOfDockerCli(context: IActionContext, node?: UnifiedRegistryItem<CommonRegistry>): Promise<void> {
    if (!node) {
        node = await contextValueExperience(context, ext.registriesTree, { include: 'commonregistry' });
    }

    const client = await ext.runtimeManager.getClient();
    const taskCRF = new TaskCommandRunnerFactory(
        {
            taskName: 'Docker'
        }
    );

    await taskCRF.getCommandRunner()(
        client.logout({ registry: node.wrappedItem.baseUrl?.toString() || '' }),
    );
}
