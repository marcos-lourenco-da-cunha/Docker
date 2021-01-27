/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from "vscode";
import { DockerVolume } from "../../docker/Volumes";
import { LocalGroupTreeItemBase } from "../LocalGroupTreeItemBase";
import { getCommonGroupIcon } from "../settings/CommonProperties";
import { VolumeProperty } from "./VolumeProperties";

export class VolumeGroupTreeItem extends LocalGroupTreeItemBase<DockerVolume, VolumeProperty> {
    public static readonly contextValue: string = 'volumeGroup';
    public readonly contextValue: string = VolumeGroupTreeItem.contextValue;
    public childTypeLabel: string = 'volume';

    public get iconPath(): ThemeIcon {
        switch (this.parent.groupBySetting) {
            case 'VolumeName':
                return new ThemeIcon('file-symlink-directory');
            default:
                return getCommonGroupIcon(this.parent.groupBySetting);
        }
    }
}
