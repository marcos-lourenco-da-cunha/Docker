/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDotNetSdkBuild } from "./netSdk/netSdkDebugUtils";

export type DockerPlatform = 'netCore' | 'node' | 'python' | 'netSdk';

interface DockerPlatformConfiguration {
    platform?: DockerPlatform;
    netCore?: unknown;
    node?: unknown;
    python?: unknown;
}

export function getPlatform<T extends DockerPlatformConfiguration>(configuration: T): DockerPlatform | undefined {
    if (isDotNetSdkBuild(configuration)) {
        return 'netSdk';
    } else if (configuration.platform === 'netCore' || configuration.netCore !== undefined) {
        return 'netCore';
    } else if (configuration.platform === 'node' || configuration.node !== undefined) {
        return 'node';
    } else if (configuration.platform === 'python' || configuration.python !== undefined) {
        return 'python';
    } else {
        return undefined;
    }
}
