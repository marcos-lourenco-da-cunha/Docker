/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestPromiseOptions } from "request-promise-native";
import { RegistryType } from "../RegistryType";
import { RemoteRepositoryTreeItemBase } from "../RemoteRepositoryTreeItemBase";
import { PrivateRegistryTreeItem } from "./PrivateRegistryTreeItem";
import { PrivateTagTreeItem } from "./PrivateTagTreeItem";

export class PrivateRepositoryTreeItem extends RemoteRepositoryTreeItemBase {
    public static contextValue: string = RegistryType.private + RemoteRepositoryTreeItemBase.contextValueSuffix;
    public contextValue: string = PrivateRepositoryTreeItem.contextValue;
    public parent: PrivateRegistryTreeItem;

    public constructor(parent: PrivateRegistryTreeItem, name: string) {
        super(parent, name);
    }

    public createTagTreeItem(tag: string, time: string): PrivateTagTreeItem {
        return new PrivateTagTreeItem(this, tag, time);
    }

    public async addAuth(options: RequestPromiseOptions): Promise<void> {
        await this.parent.addAuth(options);
    }
}
