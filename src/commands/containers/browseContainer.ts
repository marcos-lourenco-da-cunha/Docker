/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";
import { ContainerTreeItem } from "../../tree/containers/ContainerTreeItem";

function parsePortAndProtocol(portAndProtocol: string): { port: number, protocol: string | undefined } | undefined {
    const splitPortAndProtocol = portAndProtocol.split('/');

    if (splitPortAndProtocol.length > 0) {
        const port = Number.parseInt(splitPortAndProtocol[0], 10);

        if (!Number.isNaN(port)) {
            return {
                port,
                protocol: splitPortAndProtocol.length > 1 ? splitPortAndProtocol[1].toLowerCase() : undefined
            };
        }
    }

    return undefined;
}

export async function browseContainer(context: IActionContext, node?: ContainerTreeItem): Promise<void> {
    if (!node) {
        node = await ext.containersTree.showTreeItemPicker<ContainerTreeItem>(ContainerTreeItem.allContextRegExp, context);
    }

    const inspectInfo = await node.getContainer().inspect();

    // Find exposed ports
    const ports = inspectInfo.NetworkSettings && inspectInfo.NetworkSettings.Ports || {};
    const possiblePorts =
        Object.keys(ports)
              .map(portAndProtocol => ({ mappings: ports[portAndProtocol], containerPort: parsePortAndProtocol(portAndProtocol) }))
              // Exclude port designations we cannot recognized...
              .filter(port => port.containerPort !== undefined)
              // Exclude ports that are non-TCP-based (which should be the default)...
              .filter(port => port.containerPort.protocol === undefined || port.containerPort.protocol === 'tcp')
              // Exclude ports not mapped to the host...
              .filter(port => port.mappings && port.mappings.length > 0);

    if (possiblePorts.length === 0) {
        await ext.ui.showWarningMessage('No valid ports were mapped from the container to the host.');

        return;
    }

    // Prefer exposed port 443 (SSL) followed by port 80 (HTTP)...
    let webPort = possiblePorts.find(port => port.containerPort.port === 443 || port.containerPort.port === 80);

    // Otherwise, if there's just a single port, assume that one...
    if (webPort === undefined && possiblePorts.length === 1) {
        webPort = possiblePorts[0];
    }

    // Otherwise, ask the user which port to use?
    if (webPort === undefined) {
        const items = possiblePorts.map(port => ({ label: port.containerPort.port.toString(), port }));
        const item  = await ext.ui.showQuickPick(items, { placeHolder: 'Select the container port to browse to:' });

        webPort = item.port;
    }

    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${webPort.mappings[0].HostPort}`));
}
