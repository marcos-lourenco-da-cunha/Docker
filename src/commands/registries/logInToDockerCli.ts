/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { IActionContext } from 'vscode-azureextensionui';
import { NULL_GUID } from '../../constants';
import { ext } from '../../extensionVariables';
import { AzureRegistryTreeItem } from '../../tree/registries/azure/AzureRegistryTreeItem';
import { DockerHubAccountTreeItem } from '../../tree/registries/dockerHub/DockerHubAccountTreeItem';
import { DockerHubNamespaceTreeItem } from '../../tree/registries/dockerHub/DockerHubNamespaceTreeItem';
import { PrivateRegistryTreeItem } from '../../tree/registries/private/PrivateRegistryTreeItem';
import { RegistryTreeItemBase } from '../../tree/registries/RegistryTreeItemBase';
import { acquireAcrRefreshToken } from '../../utils/azureUtils';

export async function logInToDockerCli(context: IActionContext, node?: RegistryTreeItemBase | DockerHubAccountTreeItem): Promise<void> {
    if (!node) {
        node = await ext.registriesTree.showTreeItemPicker<RegistryTreeItemBase>([DockerHubAccountTreeItem.contextValue, /^(azure|private)Registry$/i], context);
    }

    let username: string | undefined;
    let password: string | undefined;
    let url: string;

    if (node instanceof DockerHubNamespaceTreeItem) {
        node = node.parent;
    }

    if (node instanceof DockerHubAccountTreeItem) {
        url = '';
        username = node.username;
        password = node.password;

        if (!username || !password) {
            throw new Error("Failed to get credentials for Docker Hub.");
        }
    } else {
        url = node.baseUrl;
        if (node instanceof AzureRegistryTreeItem) {
            username = NULL_GUID;
            password = await acquireAcrRefreshToken(node.host, node.parent.root);
        } else if (node instanceof PrivateRegistryTreeItem) {
            const auth = await node.getAuth();
            username = auth.username;
            password = auth.password;
        } else {
            throw new RangeError(`Unrecognized node type "${node.constructor.name}"`);
        }

        if (!username || !password) {
            throw new Error(`Failed to get credentials for registry "${node.host}".`);
        }
    }

    await new Promise((resolve, reject) => {
        const dockerLoginCmd = `docker login ${url} --username ${username} --password-stdin`;
        let childProcess = exec(dockerLoginCmd, (err, stdout, stderr) => {
            ext.outputChannel.appendLine(dockerLoginCmd);
            ext.outputChannel.append(stdout);
            ext.outputChannel.append(stderr);
            if (err && err.message.match(/error storing credentials.*The stub received bad data/)) {
                // Temporary work-around for this error- same as Azure CLI
                // See https://github.com/Azure/azure-cli/issues/4843
                reject(new Error(`In order to log in to the Docker CLI using tokens, you currently need to go to \nOpen your Docker config file and remove "credsStore": "wincred" from the config.json file, then try again. \nDoing this will disable wincred and cause Docker to store credentials directly in the .docker/config.json file. All registries that are currently logged in will be effectly logged out.`));
            } else if (err) {
                reject(err);
            } else if (stderr) {
                reject(stderr);
            } else {
                resolve();
            }
        });

        childProcess.stdin.write(password); // Prevents insecure password error
        childProcess.stdin.end();
    });

    ext.outputChannel.show();
}
