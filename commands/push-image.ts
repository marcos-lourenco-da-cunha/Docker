/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import vscode = require('vscode');
import { IActionContext } from 'vscode-azureextensionui';
import { configurationKeys } from '../constants';
import { ImageNode } from '../explorer/models/imageNode';
import { ext } from '../extensionVariables';
import { reporter } from '../telemetry/telemetry';
import { askToSavePrefix } from './registrySettings';
import { addImageTaggingTelemetry, getOrAskForImageAndTag, IHasImageDescriptorAndLabel, tagImage } from './tag-image';
const teleCmdId: string = 'vscode-docker.image.push';
const teleAzureId: string = 'vscode-docker.image.push.azureContainerRegistry';

export async function pushImage(actionContext: IActionContext, context?: ImageNode): Promise<void> {

    let [imageToPush, imageName] = await getOrAskForImageAndTag(context);

    if (imageName.includes('/')) {
        await askToSavePrefix(imageName);
    } else {
        //let addPrefixImagePush = "addPrefixImagePush";
        let askToPushPrefix: boolean = true; // ext.context.workspaceState.get(addPrefixImagePush, true);
        let defaultRegistryPath = vscode.workspace.getConfiguration('docker').get(configurationKeys.defaultRegistryPath);
        if (askToPushPrefix && defaultRegistryPath) {
            // let alwaysPush: vscode.MessageItem = { title: "Always push" };
            let tagFirst: vscode.MessageItem = { title: "Tag first" };
            let pushAnyway: vscode.MessageItem = { title: "Push anyway" }
            let options: vscode.MessageItem[] = [tagFirst, pushAnyway];
            let response: vscode.MessageItem = await ext.ui.showWarningMessage(`This will attempt to push the image to the official public Docker Hub library (docker.io/library), which you may not have permissions for. If you want to push to one of your own repositories, you must push an image that has been tagged with your username or a registry server name.`, ...options);
            // if (response === alwaysPush) {
            //     ext.context.workspaceState.update(addPrefixImagePush, false);
            // }
            if (response === tagFirst) {
                imageName = await tagImage(actionContext, <IHasImageDescriptorAndLabel>{ imageDesc: imageToPush, label: imageName }); //not passing this would ask the user a second time to pick an image
            }
        }
    }

    if (imageToPush) {
        addImageTaggingTelemetry(actionContext, imageName, '');

        const terminal = ext.terminalProvider.createTerminal(imageName);
        terminal.sendText(`docker push ${imageName}`);
        terminal.show();
        if (reporter) {
            /* __GDPR__
               "command" : {
                  "command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
               }
             */
            reporter.sendTelemetryEvent('command', {
                command: teleCmdId
            });

            if (imageName.toLowerCase().includes('azurecr.io')) {
                /* __GDPR__
                   "command" : {
                      "command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                   }
                 */
                reporter.sendTelemetryEvent('command', {
                    command: teleAzureId
                });

            }
        }
    }
}
