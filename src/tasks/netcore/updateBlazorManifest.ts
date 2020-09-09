/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as xml2js from 'xml2js';
import { DockerContainerVolume } from '../../debugging/coreclr/CliDockerClient';
import { localize } from '../../localize';
import { getNetCoreProjectInfo } from '../../utils/netCoreUtils';
import { pathNormalize } from '../../utils/pathNormalize';
import { PlatformOS } from '../../utils/platform';
import { DockerRunTaskDefinition } from "../DockerRunTaskProvider";
import { DockerRunTaskContext } from "../TaskHelper";

interface ContentRootAttributes {
    BasePath: string;
    Path: string;
}

interface ContentRoot {
    $: ContentRootAttributes;
}

interface StaticWebAssets {
    ContentRoot: ContentRoot[];
}

interface Manifest {
    StaticWebAssets: StaticWebAssets;
}

export async function updateBlazorManifest(context: DockerRunTaskContext, runDefinition: DockerRunTaskDefinition): Promise<void> {
    const contents = await getNetCoreProjectInfo('GetBlazorManifestLocations', runDefinition.netCore.appProject);

    if (contents.length < 2) {
        throw new Error(localize('vscode-docker.tasks.netCore.noBlazorManifest1', 'Unable to determine Blazor manifest locations from output file.'));
    }

    await transformBlazorManifest(context, contents[0].trim(), contents[1].trim(), runDefinition.dockerRun.volumes, runDefinition.dockerRun.os);
}

async function transformBlazorManifest(context: DockerRunTaskContext, inputManifest: string, outputManifest: string, volumes: DockerContainerVolume[], os: PlatformOS): Promise<void> {
    if (!inputManifest || // Input manifest can't be empty/undefined
        !outputManifest || // Output manifest can't be empty/undefined
        !(await fse.pathExists(inputManifest)) || // Input manifest must exist
        !(await fse.stat(inputManifest)).isFile() || // Input manifest must be a file
        !volumes || // Volumes can't be undefined
        volumes.length === 0) { // Volumes can't be empty
        // This isn't considered an error case, we'll just return without doing anything
        return;
    }

    os = os || 'Linux';

    context.terminal.writeOutputLine(localize('vscode-docker.tasks.netCore.attemptingBlazorContainerize', 'Attempting to containerize Blazor static web assets manifest...'));

    const contents = (await fse.readFile(inputManifest)).toString();
    const manifest: Manifest = <Manifest>await xml2js.parseStringPromise(contents);

    if (!manifest || !manifest.StaticWebAssets) {
        throw new Error(localize('vscode-docker.tasks.netCore.failedBlazorManifest', 'Failed to parse Blazor static web assets manifest.'));
    }

    if (!Array.isArray(manifest.StaticWebAssets.ContentRoot)) {
        return;
    }

    for (const contentRoot of manifest.StaticWebAssets.ContentRoot) {
        if (contentRoot && contentRoot.$) {
            contentRoot.$.Path = containerizePath(contentRoot.$.Path, volumes, os);
        }
    }

    const outputContents = (new xml2js.Builder()).buildObject(manifest);

    await fse.writeFile(outputManifest, outputContents)
}

function containerizePath(oldPath: string, volumes: DockerContainerVolume[], os: PlatformOS): string {
    const matchingVolume: DockerContainerVolume = volumes.find(v => oldPath.startsWith(v.localPath));

    return matchingVolume ?
        pathNormalize(oldPath.replace(matchingVolume.localPath, matchingVolume.containerPath), os) :
        oldPath;
}
