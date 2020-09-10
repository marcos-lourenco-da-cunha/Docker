/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { ContainerRegistryManagementClient, ContainerRegistryManagementModels as AcrModels } from '@azure/arm-containerregistry';
import { Progress } from "vscode";
import * as vscode from "vscode";
import { IAppServiceWizardContext, SiteClient } from "vscode-azureappservice";
import { AzureWizardExecuteStep, createAzureClient } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { AzureRegistryTreeItem } from '../../../tree/registries/azure/AzureRegistryTreeItem';
import { AzureRepositoryTreeItem } from '../../../tree/registries/azure/AzureRepositoryTreeItem';
import { DockerHubRepositoryTreeItem } from '../../../tree/registries/dockerHub/DockerHubRepositoryTreeItem';
import { RemoteTagTreeItem } from '../../../tree/registries/RemoteTagTreeItem';
import { cryptoUtils } from '../../../utils/cryptoUtils';
import { nonNullProp } from "../../../utils/nonNull";
import { openExternal } from '../../../utils/openExternal';

export class DockerWebhookCreateStep extends AzureWizardExecuteStep<IAppServiceWizardContext> {
    public priority: number = 141; // execute after DockerSiteCreate
    private _treeItem: RemoteTagTreeItem;
    public constructor(treeItem: RemoteTagTreeItem) {
        super();
        this._treeItem = treeItem;
    }

    public async execute(context: IAppServiceWizardContext, progress: Progress<{
        message?: string;
        increment?: number;
    }>): Promise<void> {
        const site: WebSiteManagementModels.Site = nonNullProp(context, 'site');
        let siteClient = new SiteClient(site, context);
        let appUri: string = (await siteClient.getWebAppPublishCredential()).scmUri;
        if (this._treeItem.parent instanceof AzureRepositoryTreeItem) {
            const creatingNewWebhook: string = localize('vscode-docker.commands.registries.azure.dockerWebhook.creatingWebhook', 'Creating webhook for web app "{0}"...', context.newSiteName);
            ext.outputChannel.appendLine(creatingNewWebhook);
            progress.report({ message: creatingNewWebhook });
            const webhook = await this.createWebhookForApp(this._treeItem, context.site, appUri);
            ext.outputChannel.appendLine(localize('vscode-docker.commands.registries.azure.dockerWebhook.createdWebhook', 'Created webhook "{0}" with scope "{1}", id: "{2}" and location: "{3}"', webhook.name, webhook.scope, webhook.id, webhook.location));
        } else if (this._treeItem.parent instanceof DockerHubRepositoryTreeItem) {
            // point to dockerhub to create a webhook
            // http://cloud.docker.com/repository/docker/<registryName>/<repoName>/webHooks
            const dockerhubPrompt: string = localize('vscode-docker.commands.registries.azure.dockerWebhook.copyAndOpen', 'Copy & Open');
            const dockerhubUri: string = `https://cloud.docker.com/repository/docker/${this._treeItem.parent.parent.namespace}/${this._treeItem.parent.repoName}/webHooks`;

            // NOTE: The response to the information message is not awaited but handled independently of the wizard steps.
            //       VS Code will hide such messages in the notifications pane after a period of time; awaiting them risks
            //       the user never noticing them in the first place, which means the wizard would never complete, and the
            //       user left with the impression that the action is hung.

            /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
            vscode.window
                .showInformationMessage(localize('vscode-docker.commands.registries.azure.dockerWebhook.cicd', 'To set up a CI/CD webhook, open the page "{0}" and enter the URI to the created web app in your dockerhub account', dockerhubUri), dockerhubPrompt)
                .then(response => {
                    if (response) {
                        /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
                        vscode.env.clipboard.writeText(appUri);

                        /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
                        openExternal(dockerhubUri);
                    }
                });
        }
    }

    public shouldExecute(context: IAppServiceWizardContext): boolean {
        return !!context.site && (this._treeItem.parent instanceof AzureRepositoryTreeItem || this._treeItem.parent instanceof DockerHubRepositoryTreeItem);
    }

    private async createWebhookForApp(node: RemoteTagTreeItem, site: WebSiteManagementModels.Site, appUri: string): Promise<AcrModels.Webhook | undefined> {
        const maxLength: number = 50;
        const numRandomChars: number = 6;

        let webhookName: string = site.name;
        // remove disallowed characters
        webhookName = webhookName.replace(/[^a-zA-Z0-9]/g, '');
        // trim to max length
        webhookName = webhookName.substr(0, maxLength - numRandomChars);
        // add random chars for uniqueness and to ensure min length is met
        webhookName += cryptoUtils.getRandomHexString(numRandomChars);

        // variables derived from the container registry
        const registryTreeItem: AzureRegistryTreeItem = (<AzureRepositoryTreeItem>node.parent).parent;
        const crmClient = createAzureClient(registryTreeItem.parent.root, ContainerRegistryManagementClient);
        let webhookCreateParameters: AcrModels.WebhookCreateParameters = {
            location: registryTreeItem.registryLocation,
            serviceUri: appUri,
            scope: `${node.parent.repoName}:${node.tag}`,
            actions: ["push"],
            status: 'enabled'
        };
        return await crmClient.webhooks.create(registryTreeItem.resourceGroup, registryTreeItem.registryName, webhookName, webhookCreateParameters);
    }
}
