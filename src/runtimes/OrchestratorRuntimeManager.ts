/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerComposeClient, IContainerOrchestratorClient } from '@microsoft/vscode-container-client';
import { RuntimeManager } from './RuntimeManager';
import { isAutoConfigurableDockerComposeClient } from './clients/AutoConfigurableDockerComposeClient';

export class OrchestratorRuntimeManager extends RuntimeManager<IContainerOrchestratorClient> {
    public readonly onOrchestratorRuntimeClientRegistered = this.runtimeClientRegisteredEmitter.event;

    public constructor() {
        super('orchestratorClient');
    }

    public async getClient(): Promise<IContainerOrchestratorClient> {
        // TODO: runtimes: alt: temporarily just return the Docker Compose client, always
        const composeClient = this.runtimeClients.find(isDockerComposeClient);

        if (isAutoConfigurableDockerComposeClient(composeClient)) {
            await composeClient.slowConfigure();
        }

        return composeClient;
    }
}

export function isDockerComposeClient(maybeComposeClient: IContainerOrchestratorClient): maybeComposeClient is DockerComposeClient {
    return maybeComposeClient.id === DockerComposeClient.ClientId;
}
