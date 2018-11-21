/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationContext } from 'adal-node';
import ContainerRegistryManagementClient from 'azure-arm-containerregistry';
import { Registry, Run, RunGetLogResult } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import { ResourceGroup } from "azure-arm-resource/lib/resource/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import { BlobService, createBlobServiceWithSas } from "azure-storage";
import { ServiceClientCredentials } from 'ms-rest';
import { TokenResponse } from 'ms-rest-azure';
import { isNull } from 'util';
import { parseError } from 'vscode-azureextensionui';
import { NULL_GUID } from "../../constants";
import { Manifest } from '../../explorer/utils/dockerHubUtils';
import { ext } from '../../extensionVariables';
import { AzureSession } from "../../typings/azure-account.api";
import { AzureUtilityManager } from '../azureUtilityManager';
import { getId, getLoginServer } from '../nonNull';
import { AzureImage } from "./models/image";
import { Repository } from "./models/repository";

//General helpers
/** Gets the subscription for a given registry
 * @param registry gets the subscription for a given regsitry
 * @returns a subscription object
 */
export async function getSubscriptionFromRegistry(registry: Registry): Promise<SubscriptionModels.Subscription> {
    let id = getId(registry);
    let subscriptionId = id.slice('/subscriptions/'.length, id.search('/resourceGroups/'));
    const subs = await AzureUtilityManager.getInstance().getFilteredSubscriptionList();
    let subscription = subs.find((sub): boolean => {
        return sub.subscriptionId === subscriptionId;
    });

    if (!subscription) {
        throw new Error(`Could not find subscription with id "${subscriptionId}"`);
    }

    return subscription;
}

export function getResourceGroupName(registry: Registry): string {
    let id = getId(registry);
    return id.slice(id.search('resourceGroups/') + 'resourceGroups/'.length, id.search('/providers/'));
}

//Gets resource group object from registry and subscription
export async function getResourceGroup(registry: Registry, subscription: Subscription): Promise<ResourceGroup | undefined> {
    let resourceGroups: ResourceGroup[] = await AzureUtilityManager.getInstance().getResourceGroups(subscription);
    const resourceGroupName = getResourceGroupName(registry);
    return resourceGroups.find((res) => { return res.name === resourceGroupName });
}

//Registry item management
/** List images under a specific Repository */
export async function getImagesByRepository(repo: Repository): Promise<AzureImage[]> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(repo.registry, 'repository:' + repo.name + ':pull');
    let response = await sendRequest<{ tags: { name: string, lastUpdateTime: string }[] }>(
        'get',
        getLoginServer(repo.registry),
        `acr/v1/${repo.name}/_tags?orderby=timedesc`,
        acrAccessToken);

    let tags = response.tags;
    let images: AzureImage[] = [];
    if (!isNull(tags)) {
        //Acquires each image's manifest (in parallel) to acquire build time
        for (let tag of tags) {
            let img = new AzureImage(repo, tag.name, new Date(tag.lastUpdateTime));
            images.push(img);
        }
    }

    return images;
}

/** List images under a specific digest */
export async function getImagesByDigest(repo: Repository, digest: string): Promise<AzureImage[]> {
    let allImages: AzureImage[] = [];
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(repo.registry, 'repository:' + repo.name + ':pull');
    let response = await sendRequest<{ manifest: ACRManifest }>('get', getLoginServer(repo.registry), `acr/v1/${repo.name}/_manifests/${digest}`, acrAccessToken);
    const tags: string[] = response.manifest.tags;
    for (let tag of tags) {
        allImages.push(new AzureImage(repo, tag));
    }
    return allImages;
}

/** List repositories on a given Registry. */
export async function getRepositoriesByRegistry(registry: Registry): Promise<Repository[]> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(registry, "registry:catalog:*");
    let response = await sendRequest<{ repositories: string[] }>('get', getLoginServer(registry), 'acr/v1/_catalog', acrAccessToken);

    let allRepos: Repository[] = [];
    if (!isNull(response.repositories)) {
        for (let tempRepo of response.repositories) {
            allRepos.push(await Repository.Create(registry, tempRepo));
        }
    }

    //Note these are ordered by default in alphabetical order
    return allRepos;
}

export async function deleteRepository(repo: Repository): Promise<void> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(repo.registry, `repository:${repo.name}:*`);
    await sendRequest('delete', getLoginServer(repo.registry), `v2/_acr/${repo.name}/repository`, acrAccessToken);
}

export async function deleteImage(repo: Repository, imageDigest: string): Promise<void> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(repo.registry, `repository:${repo.name}:*`);
    await sendRequest('delete', getLoginServer(repo.registry), `v2/${repo.name}/manifests/${imageDigest}`, acrAccessToken);
}

export async function untagImage(img: AzureImage): Promise<void> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(img.registry, `repository:${img.repository.name}:*`);
    await sendRequest('delete', getLoginServer(img.registry), `v2/_acr/${img.repository.name}/tags/${img.tag}`, acrAccessToken);
}

/** Sends a custom html request to a registry
 * @param http_method : the http method
 * @param login_server: the login server of the registry
 * @param path : the URL path
 * @param accessToken : Bearer access token.
 */
export async function sendRequest<T>(http_method: string, login_server: string, path: string, accessToken: string): Promise<T> {
    let url: string = `https://${login_server}/${path}`;

    if (http_method === 'delete') {
        return <T>await ext.request.delete(
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                url: url
            }
        );
    } else if (http_method === 'get') {
        return <T>await ext.request.get(
            url,
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                json: true,
                resolveWithFullResponse: false,
            }
        );
    }

    throw new Error('sendRequestToRegistry: Unexpected http method');
}

/** Sends a custom html request to a registry, and retrieves the image's digest.
 * @param image : The targeted image.
 */
export async function getImageDigest(image: AzureImage): Promise<string> {
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(image.registry, `repository:${image.repository.name}:pull`);

    return new Promise<string>((resolve, reject) => ext.request.get('https://' + image.registry.loginServer + `/v2/${image.repository.name}/manifests/${image.tag}`, {
        auth: {
            bearer: acrAccessToken
        },
        headers: {
            accept: 'application/vnd.docker.distribution.manifest.v2+json; 0.5, application/vnd.docker.distribution.manifest.list.v2+json; 0.6'
        }
    }, (_err, _httpResponse, _body) => {
        if (_err) {
            reject(_err);
        } else {
            const imageDigest = _httpResponse.headers['docker-content-digest'];
            if (imageDigest instanceof Array) {
                reject(new Error('docker-content-digest should be a string not an array.'))
            } else {
                resolve(imageDigest);
            }
        }
    }));
}

//Credential management
/** Obtains registry username and password compatible with docker login */
export async function getLoginCredentials(registry: Registry): Promise<{ password: string, username: string }> {
    const subscription: Subscription = await getSubscriptionFromRegistry(registry);
    const session: AzureSession = await AzureUtilityManager.getInstance().getSession(subscription)
    const { aadAccessToken, aadRefreshToken } = await acquireAADTokens(session);
    const acrRefreshToken = await acquireACRRefreshToken(getLoginServer(registry), session.tenantId, aadRefreshToken, aadAccessToken);
    return { 'password': acrRefreshToken, 'username': NULL_GUID };
}

/** Obtains tokens for using the Docker Registry v2 Api
 * @param registry The targeted Azure Container Registry
 * @param scope String determining the scope of the access token
 * @returns acrRefreshToken: For use as a Password for docker registry access , acrAccessToken: For use with docker API
 */
export async function acquireACRAccessTokenFromRegistry(registry: Registry, scope: string): Promise<{ acrRefreshToken: string, acrAccessToken: string }> {
    const subscription: Subscription = await getSubscriptionFromRegistry(registry);
    const session: AzureSession = await AzureUtilityManager.getInstance().getSession(subscription);
    const { aadAccessToken, aadRefreshToken } = await acquireAADTokens(session);
    let loginServer = getLoginServer(registry);
    const acrRefreshToken = await acquireACRRefreshToken(loginServer, session.tenantId, aadRefreshToken, aadAccessToken);
    const acrAccessToken = await acquireACRAccessToken(loginServer, scope, acrRefreshToken)
    return { acrRefreshToken, acrAccessToken };
}

/** Obtains refresh and access tokens for Azure Active Directory. */
export async function acquireAADTokens(session: AzureSession): Promise<{ aadAccessToken: string, aadRefreshToken?: string }> {
    return new Promise<{ aadAccessToken: string, aadRefreshToken?: string }>((resolve, reject) => {
        const credentials = <{ context: AuthenticationContext, username: string, clientId: string } & ServiceClientCredentials>session.credentials;
        const environment = session.environment;
        credentials.context.acquireToken(
            environment.activeDirectoryResourceId,
            credentials.username,
            credentials.clientId,
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    let tokenResponse = <TokenResponse>result;
                    resolve({
                        aadAccessToken: tokenResponse.accessToken,
                        aadRefreshToken: tokenResponse.refreshToken,
                    });
                }
            });
    });
}

/** Obtains refresh tokens for Azure Container Registry. */
export async function acquireACRRefreshToken(registryUrl: string, tenantId: string, aadRefreshToken: string | undefined, aadAccessToken: string): Promise<string> {
    const acrRefreshTokenResponse = <{ refresh_token: string }>await ext.request.post(`https://${registryUrl}/oauth2/exchange`, {
        form: {
            grant_type: "refresh_token",
            service: registryUrl,
            tenant: tenantId,
            refresh_token: aadRefreshToken,
            access_token: aadAccessToken,
        },
        json: true
    });

    return acrRefreshTokenResponse.refresh_token;
}

/** Gets an ACR accessToken by using an acrRefreshToken */
export async function acquireACRAccessToken(registryUrl: string, scope: string, acrRefreshToken: string): Promise<string> {
    const acrAccessTokenResponse = <{ access_token: string }>await ext.request.post(`https://${registryUrl}/oauth2/token`, {
        form: {
            grant_type: "refresh_token",
            service: registryUrl,
            scope,
            refresh_token: acrRefreshToken,
        },
        json: true
    });
    return acrAccessTokenResponse.access_token;
}

export interface IBlobInfo {
    accountName: string;
    endpointSuffix: string;
    containerName: string;
    blobName: string;
    sasToken: string;
    host: string;
}

/** Parses information into a readable format from a blob url */
export function getBlobInfo(blobUrl: string): IBlobInfo {
    let items: string[] = blobUrl.slice(blobUrl.search('https://') + 'https://'.length).split('/');
    const accountName = blobUrl.slice(blobUrl.search('https://') + 'https://'.length, blobUrl.search('.blob'));
    const endpointSuffix = items[0].slice(items[0].search('.blob.') + '.blob.'.length);
    const containerName = items[1];
    const blobName = items[2] + '/' + items[3] + '/' + items[4].slice(0, items[4].search('[?]'));
    const sasToken = items[4].slice(items[4].search('[?]') + 1);
    const host = accountName + '.blob.' + endpointSuffix;
    return {
        accountName: accountName,
        endpointSuffix: endpointSuffix,
        containerName: containerName,
        blobName: blobName,
        sasToken: sasToken,
        host: host
    };
}

/** Stream logs from a blob into output channel.
 * Note, since output streams don't actually deal with streams directly, text is not actually
 * streamed in which prevents updating of already appended lines. Usure if this can be fixed. Nonetheless
 * logs do load in chunks every 1 second.
 */
export async function streamLogs(registry: Registry, run: Run, providedClient?: ContainerRegistryManagementClient): Promise<void> {
    //Prefer passed in client to avoid initialization but if not added obtains own
    const subscription = await getSubscriptionFromRegistry(registry);
    let client = providedClient ? providedClient : await AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
    let temp: RunGetLogResult = await client.runs.getLogSasUrl(getResourceGroupName(registry), registry.name, run.runId);
    const link = temp.logLink;
    let blobInfo: IBlobInfo = getBlobInfo(link);
    let blob: BlobService = createBlobServiceWithSas(blobInfo.host, blobInfo.sasToken);
    let available = 0;
    let start = 0;

    let obtainLogs = setInterval(async () => {
        let props: BlobService.BlobResult;
        let metadata: { [key: string]: string; };
        try {
            props = await getBlobProperties(blobInfo, blob);
            metadata = props.metadata;
        } catch (err) {
            const error = parseError(err);
            //Not found happens when the properties havent yet been set, blob is not ready. Wait 1 second and try again
            if (error.errorType === "NotFound") { return; } else { throw error; }
        }
        available = +props.contentLength;
        let text: string;
        //Makes sure that if item fails it does so due to network/azure errors not lack of new content
        if (available > start) {
            text = await getBlobToText(blobInfo, blob, start);
            let utf8encoded = (new Buffer(text, 'ascii')).toString('utf8');
            start += text.length;
            ext.outputChannel.append(utf8encoded);
        }
        if (metadata.Complete) {
            clearInterval(obtainLogs);
        }
    }, 1000);
}

// Promisify getBlobToText for readability and error handling purposes
export async function getBlobToText(blobInfo: IBlobInfo, blob: BlobService, rangeStart: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        blob.getBlobToText(blobInfo.containerName, blobInfo.blobName, { rangeStart: rangeStart },
            (error, result) => {
                if (error) { reject(error) } else { resolve(result); }
            });
    });
}

// Promisify getBlobProperties for readability and error handling purposes
async function getBlobProperties(blobInfo: IBlobInfo, blob: BlobService): Promise<BlobService.BlobResult> {
    return new Promise<BlobService.BlobResult>((resolve, reject) => {
        blob.getBlobProperties(blobInfo.containerName, blobInfo.blobName, (error, result) => {
            if (error) { reject(error) } else { resolve(result); }
        });
    });
}

interface ACRManifest extends Manifest {
    tags: string[];
}
