/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IconPath } from "../IconPath";
import { LocalGroupTreeItemBase } from "../LocalGroupTreeItemBase";
import { getTreeSetting } from "../settings/commonTreeSettings";
import { getImageGroupIcon, ImagesGroupBy } from "./imagesTreeSettings";
import { ILocalImageInfo } from "./LocalImageInfo";

export class ImageGroupTreeItem extends LocalGroupTreeItemBase<ILocalImageInfo> {
    public static readonly contextValue: string = 'imageGroup';
    public readonly contextValue: string = ImageGroupTreeItem.contextValue;
    public childTypeLabel: string = 'image';

    public get iconPath(): IconPath {
        let groupBy = getTreeSetting(ImagesGroupBy);
        return getImageGroupIcon(groupBy);
    }
}
