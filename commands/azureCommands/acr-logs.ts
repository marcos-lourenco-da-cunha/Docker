"use strict";

import { Registry } from "azure-arm-containerregistry/lib/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import * as vscode from "vscode";
import { AzureImageTagNode, AzureRegistryNode } from '../../explorer/models/azureRegistryNodes';
import { TaskNode } from "../../explorer/models/taskNode";
import { getResourceGroupName, getSubscriptionFromRegistry } from '../../utils/Azure/acrTools';
import { AzureUtilityManager } from '../../utils/azureUtilityManager';
import { quickPickACRRegistry } from '../utils/quick-pick-azure'
import { accessLog } from "./acr-logs-utils/logFileManager";
import { LogData } from "./acr-logs-utils/tableDataManager";
import { LogTableWebview } from "./acr-logs-utils/tableViewManager";

/**  This command is used through a right click on an azure registry, repository or image in the Docker Explorer. It is used to view ACR logs for a given item. */
export async function viewACRLogs(context: AzureRegistryNode | AzureImageTagNode | TaskNode): Promise<void> {
    let registry: Registry;
    let subscription: Subscription;
    if (!context) {
        registry = await quickPickACRRegistry();
        subscription = await getSubscriptionFromRegistry(registry);
    } else {
        registry = context.registry;
        subscription = context.subscription;
    }
    let resourceGroup: string = getResourceGroupName(registry);
    const client = await AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
    let logData: LogData = new LogData(client, registry, resourceGroup);

    // Filtering provided
    if (context && context instanceof AzureImageTagNode) {
        //ACR Image Logs
        await logData.loadLogs({
            webViewEvent: false,
            loadNext: false,
            removeOld: false,
            filter: { image: context.label }
        });
        if (!hasValidLogContent(context, logData)) { return; }
        const url = await logData.getLink(0);
        await accessLog(url, logData.logs[0].runId, false);
    } else {
        if (context && context instanceof TaskNode) {
            //ACR Task Logs
            await logData.loadLogs({
                webViewEvent: false,
                loadNext: false,
                removeOld: false,
                filter: { task: context.label }
            });
        } else {
            //ACR Registry Logs
            await logData.loadLogs({
                webViewEvent: false,
                loadNext: false
            });
        }
        if (!hasValidLogContent(context, logData)) { return; }
        let webViewTitle = registry.name;
        if (context instanceof TaskNode) {
            webViewTitle += '/' + context.label;
        }
        const webview = new LogTableWebview(webViewTitle, logData);
    }
}

function hasValidLogContent(context: AzureRegistryNode | AzureImageTagNode | TaskNode, logData: LogData): boolean {
    if (logData.logs.length === 0) {
        let itemType: string;
        if (context && context instanceof TaskNode) {
            itemType = 'task';
        } else if (context && context instanceof AzureImageTagNode) {
            itemType = 'image';
        } else {
            itemType = 'registry';
        }
        vscode.window.showInformationMessage(`This ${itemType} has no associated logs`);
        return false;
    }
    return true;
}
