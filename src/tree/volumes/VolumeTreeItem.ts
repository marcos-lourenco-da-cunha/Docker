/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, ThemeIcon } from "vscode";
import { AzExtParentTreeItem, IActionContext } from "vscode-azureextensionui";
import { DockerVolume } from "../../docker/Volumes";
import { ext } from "../../extensionVariables";
import { AzExtTreeItemIntermediate } from "../AzExtTreeItemIntermediate";
import { getTreeId } from "../LocalRootTreeItemBase";
import { resolveTooltipMarkdown } from "../resolveTooltipMarkdown";

export class VolumeTreeItem extends AzExtTreeItemIntermediate {
    public static contextValue: string = 'volume';
    public contextValue: string = VolumeTreeItem.contextValue;
    private readonly _item: DockerVolume;

    public constructor(parent: AzExtParentTreeItem, itemInfo: DockerVolume) {
        super(parent);
        this._item = itemInfo;
    }

    public get id(): string {
        return getTreeId(this._item);
    }

    public get createdTime(): number {
        return this._item.CreatedTime;
    }

    public get volumeName(): string {
        return this._item.Name;
    }

    public get label(): string {
        return ext.volumesRoot.getTreeItemLabel(this._item);
    }

    public get description(): string | undefined {
        return ext.volumesRoot.getTreeItemDescription(this._item);
    }

    public get iconPath(): ThemeIcon {
        return new ThemeIcon('file-symlink-directory');
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        return ext.dockerClient.removeVolume(context, this.volumeName);
    }

    public async resolveTooltipInternal(actionContext: IActionContext): Promise<MarkdownString> {
        return resolveTooltipMarkdown(volumeTooltipTemplate, await ext.dockerClient.inspectVolume(actionContext, this.volumeName));
    }
}

const volumeTooltipTemplate = `
### {{ Name }}

---

#### Associated Containers
{{#if (nonEmptyObj Containers)}}
{{#each Containers}}
  - {{ this.Name }} ({{ substr @key 0 12 }})
{{/each}}
{{else}}
_None_
{{/if}}
`;
