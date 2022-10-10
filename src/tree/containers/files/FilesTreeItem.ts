/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerOS } from '../../../runtimes/docker';
import { AzExtParentTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from '../../../localize';
import { DockerUri } from '../../../runtimes/files/DockerUri';
import { DirectoryTreeItem } from "./DirectoryTreeItem";

export class FilesTreeItem extends DirectoryTreeItem {
    public constructor(parent: AzExtParentTreeItem, fs: vscode.FileSystem, containerId: string, containerOSProvider: (context: IActionContext) => Promise<ContainerOS>) {
        super(
            parent,
            fs,
            localize('vscode-docker.tree.containers.files.filesTitle', 'Files'),
            DockerUri.create(containerId, '/', { fileType: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            containerOSProvider);
    }

    public get iconPath(): vscode.ThemeIcon {
        return new vscode.ThemeIcon('files');
    }
}
