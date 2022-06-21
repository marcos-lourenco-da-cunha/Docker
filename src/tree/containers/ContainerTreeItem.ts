/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { MultiSelectNode } from '../../utils/multiSelectNodes';
import { getTreeId } from "../LocalRootTreeItemBase";
import { resolveTooltipMarkdown } from '../resolveTooltipMarkdown';
import { ToolTipParentTreeItem } from '../ToolTipTreeItem';
import { getContainerStateIcon } from "./ContainerProperties";
import { DockerContainerInfo } from './ContainersTreeItem';
import { FilesTreeItem } from "./files/FilesTreeItem";
import { ContainerOS, ListContainersItem, PortBinding } from '@microsoft/container-runtimes';
import { getDockerOSType } from '../../utils/osUtils';

/**
 * This interface defines properties used by the Remote Containers extension. These properties must not be removed from this class.
 */
interface ContainerTreeItemUsedByRemoteContainers {
    readonly containerDesc: {
        readonly Id: string;
    };
}

export class ContainerTreeItem extends ToolTipParentTreeItem implements MultiSelectNode, ContainerTreeItemUsedByRemoteContainers {
    public static allContextRegExp: RegExp = /Container$/;
    public static runningContainerRegExp: RegExp = /^runningContainer$/i;
    private readonly _item: DockerContainerInfo;
    private children: AzExtTreeItem[] | undefined;
    private containerOS: ContainerOS;

    public constructor(parent: AzExtParentTreeItem, itemInfo: DockerContainerInfo) {
        super(parent);
        this._item = itemInfo;
    }

    public readonly canMultiSelect: boolean = true;

    public get id(): string {
        return getTreeId(this._item);
    }

    public get createdTime(): number {
        return this._item.createdAt.valueOf();
    }

    public get containerId(): string {
        return this._item.id;
    }

    public get containerName(): string {
        return this._item.name;
    }

    public get imageName(): string {
        return this._item.image;
    }

    public get labels(): { [key: string]: string } {
        return this._item.labels;
    }

    public get label(): string {
        return ext.containersRoot.getTreeItemLabel(this._item);
    }

    public get description(): string | undefined {
        return ext.containersRoot.getTreeItemDescription(this._item);
    }

    public get contextValue(): string {
        return this._item.state + 'Container';
    }

    public get ports(): PortBinding[] {
        return this._item.ports;
    }

    public get containerItem(): ListContainersItem {
        return this._item;
    }

    /**
     * @deprecated This is only kept for backwards compatability with the "Remote Containers" extension
     */
    public get containerDesc(): { Id: string } {
        return {
            Id: this._item.id,
        };
    }

    public get iconPath(): vscode.ThemeIcon {
        if (this._item.status?.includes('(unhealthy)')) {
            return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        } else {
            return getContainerStateIcon(this._item.state);
        }
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        await ext.defaultShellCR()(
            ext.containerClient.removeContainers({ containers: [this.containerId], force: true })
        );
    }

    public hasMoreChildrenImpl(): boolean {
        return this._item.showFiles && this.isRunning && this.children === undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this.children = undefined;
        }

        if (this._item.showFiles && this.isRunning) {
            this.children = [
                new FilesTreeItem(
                    this,
                    vscode.workspace.fs,
                    this.containerId,
                    async c => {
                        if (this.containerOS === undefined) {
                            this.containerOS = await getDockerOSType();
                        }

                        return this.containerOS;
                    })
            ];
        }

        return this.children ?? [];
    }

    public isAncestorOfImpl(expectedContextValue: string | RegExp): boolean {
        // If we're looking for something matching `Container$` in the expectedContextValue, it will not be a child of this item (which is the container)
        // The only children of this item have `containerFile` and `containerDirectory` as context values
        if (/Container\$?$/i.test(typeof expectedContextValue === 'string' ? expectedContextValue : expectedContextValue.source)) {
            return false;
        }

        return true;
    }

    public async resolveTooltipInternal(actionContext: IActionContext): Promise<vscode.MarkdownString> {
        actionContext.telemetry.properties.tooltipType = 'container';
        return resolveTooltipMarkdown(containerTooltipTemplate, { NormalizedName: this.containerName, ...await ext.dockerClient.inspectContainer(actionContext, this.containerId) });
    }

    private get isRunning(): boolean {
        return this._item.state.toLowerCase() === 'running';
    }
}

const containerTooltipTemplate = `
### {{ NormalizedName }} ({{ substr Id 0 12 }})

---

#### Image
{{ Config.Image }} ({{ substr Image 7 12 }})

---

#### Ports
{{#if (nonEmptyObj NetworkSettings.Ports)}}
{{#each NetworkSettings.Ports}}
  - [{{ this.[0].HostPort }}](http://localhost:{{ this.[0].HostPort }}) ➔ {{ @key }}
{{/each}}
{{else}}
_None_
{{/if}}

---

#### Volumes
{{#if Mounts}}
{{#each Mounts}}
{{#if (eq this.Type 'bind')}}
  - {{ friendlyBindHost this.Source }} ➔ {{ this.Destination }} (Bind mount, {{#if this.RW}}RW{{else}}RO{{/if}})
{{/if}}
{{#if (eq this.Type 'volume')}}
  - {{ this.Name }} ➔ {{ this.Destination }} (Named volume, {{#if this.RW}}RW{{else}}RO{{/if}})
{{/if}}
{{/each}}
{{else}}
_None_
{{/if}}

---

#### Networks
{{#if (nonEmptyObj NetworkSettings.Networks)}}
{{#each NetworkSettings.Networks}}
  - {{ @key }}
{{/each}}
{{else}}
_None_
{{/if}}
`;
