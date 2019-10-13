/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getThemedIconPath, IconPath } from "../IconPath";
import { imageProperties, ImageProperty } from "../images/ImageProperties";
import { ITreePropertyInfo } from "../settings/ITreeSettingInfo";

export type ContainerProperty = ImageProperty | 'ContainerId' | 'ContainerName' | 'Networks' | 'Ports' | 'State' | 'Status';

export const containerProperties: ITreePropertyInfo<ContainerProperty>[] = [
    ...imageProperties,
    { property: 'ContainerId', exampleValue: 'fdeab20e859d' },
    { property: 'ContainerName', exampleValue: 'amazing_hoover' },
    { property: 'Networks', exampleValue: 'mybridge_network' },
    { property: 'Ports', exampleValue: '8080' },
    { property: 'State', exampleValue: 'exited' },
    { property: 'Status', exampleValue: 'Exited (0) 2 hours ago' }
];

export function getContainerStateIcon(state: string): IconPath {
    let icon: string;
    switch (state) {
        case 'created':
        case 'dead':
        case 'exited':
        case 'removing':
            icon = 'statusStop';
            break;
        case 'paused':
            icon = 'statusPause';
            break;
        case 'restarting':
            icon = 'restart';
            break;
        case 'running':
        default:
            icon = 'statusRun';
    }
    return getThemedIconPath(icon);
}
