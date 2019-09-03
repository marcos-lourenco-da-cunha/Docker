/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { quickPickOS, quickPickPlatform } from '../../configureWorkspace/configUtils';
import { DockerPlatform } from '../../debugging/DockerPlatformHelper';
import { ext } from '../../extensionVariables';
import { Platform, PlatformOS } from '../../utils/platform';
import { quickPickWorkspaceFolder } from '../../utils/quickPickWorkspaceFolder';

// TODO: Call this from scaffolding as well
export async function initializeForDebugging(folder?: WorkspaceFolder, platform?: Platform, platformOS?: PlatformOS, options?: { [key: string]: string }): Promise<void> {
    folder = folder || await quickPickWorkspaceFolder('To configure Docker debugging you must first open a folder or workspace in VS Code.');
    platform = platform || await quickPickPlatform();
    platformOS = platformOS || await quickPickOS();
    options = options || {};

    let debugPlatform: DockerPlatform;
    switch (platform) {
        case '.NET Core Console':
        case 'ASP.NET Core':
            debugPlatform = 'netCore';
            break;
        case 'Node.js':
            debugPlatform = 'node';
            break;
        default:
    }

    return await callWithTelemetryAndErrorHandling(
        `docker-debug-initialize/${debugPlatform || 'unknown'}`,
        async (actionContext: IActionContext) => await ext.debugConfigProvider.initializeForDebugging(
            {
                folder: folder,
                platform: debugPlatform,
                platformOS: platformOS,
                actionContext: actionContext,
            },
            options)
    );
}
