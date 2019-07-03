/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryApi } from "../all/RegistryApi";
import { IRegistryProvider } from "../IRegistryProvider";
import { GitLabAccountTreeItem } from "./GitLabAccountTreeItem";

export const gitLabRegistryProvider: IRegistryProvider = {
    label: "GitLab",
    id: 'gitLab',
    api: RegistryApi.GitLabV4,
    logInOptions: {
        wizardTitle: 'Log In to GitLab',
        passwordPrompt: 'Enter your personal access token',
        includePassword: true,
    },
    onlyOneAllowed: true,
    treeItemType: GitLabAccountTreeItem
}
