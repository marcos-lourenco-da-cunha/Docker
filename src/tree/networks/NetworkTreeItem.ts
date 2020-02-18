/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Network } from "dockerode";
import { builtInNetworks } from "../../constants";
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from "vscode-azureextensionui";
import { builtInNetworks } from "../../constants";
import { ext } from "../../extensionVariables";
import { callDockerodeWithErrorHandling } from "../../utils/callDockerodeWithErrorHandling";
import { getThemedIconPath, IconPath } from '../IconPath';
import { LocalNetworkInfo } from "./LocalNetworkInfo";

export class NetworkTreeItem extends AzExtTreeItem {
    public static allContextRegExp: RegExp = /Network$/;
    public static customNetworkRegExp: RegExp = /^customNetwork$/i;

    private readonly _item: LocalNetworkInfo;

    public constructor(parent: AzExtParentTreeItem, itemInfo: LocalNetworkInfo) {
        super(parent);
        this._item = itemInfo;
    }

    public get contextValue(): string {
        const prefix = builtInNetworks.includes(this._item.networkName) ? 'default' : 'custom';
        return prefix + 'Network';
    }

    public get id(): string {
        return this._item.treeId;
    }

    public get networkId(): string {
        return this._item.networkId;
    }

    public get createdTime(): number {
        return this._item.createdTime;
    }

    public get networkName(): string {
        return this._item.networkName;
    }

    public get label(): string {
        return ext.networksRoot.getTreeItemLabel(this._item);
    }

    public get description(): string | undefined {
        return ext.networksRoot.getTreeItemDescription(this._item);
    }

    public get iconPath(): IconPath {
        return getThemedIconPath('network');
    }

    public getNetwork(): Network {
        return ext.dockerode.getNetwork(this.networkId);
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const network: Network = this.getNetwork();
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        await callDockerodeWithErrorHandling(() => network.remove({ force: true }), context);
    }
}
