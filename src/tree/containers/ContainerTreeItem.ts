/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerInfo } from "dockerode";
import { AzExtParentTreeItem, AzExtTreeItem } from "vscode-azureextensionui";
import { ext } from "../../extensionVariables";
import { getThemedIconPath, IconPath } from '../IconPath';

export class ContainerTreeItem extends AzExtTreeItem {
    public static allContextRegExp: RegExp = /Container$/;
    public container: ContainerInfo;

    public constructor(parent: AzExtParentTreeItem, container: ContainerInfo) {
        super(parent);
        this.container = container;
    }

    public get label(): string {
        return this.container.Image;
    }

    public get description(): string {
        let name = this.container.Names[0].substr(1); // Remove start '/'
        let status = this.container.Status;
        return [name, status].join(' - ');
    }

    public get id(): string {
        return this.container.Id;
    }

    public get contextValue(): string {
        return this.container.State + 'Container';
    }

    public get iconPath(): IconPath {
        let icon: string;
        if (this.isUnhealthy) {
            icon = 'statusWarning';
        } else {
            switch (this.container.State) {
                case "created":
                case "dead":
                case "exited":
                    icon = 'statusStop';
                    break;
                case "paused":
                    icon = 'statusPause';
                    break;
                case "restarting":
                    icon = 'restart';
                    break;
                case "running":
                default:
                    icon = 'statusRun';
            }
        }

        return getThemedIconPath(icon);
    }

    private get isUnhealthy(): boolean {
        return this.container.Status.includes('(unhealthy)');
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await ext.dockerode.getContainer(this.container.Id).remove({ force: true });
    }
}
