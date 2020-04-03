/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerRegistryManagementModels as AcrModels } from "azure-arm-containerregistry";
import { BlobService, createBlobServiceWithSas } from "azure-storage";
import { parseError } from "vscode-azureextensionui";
import { ext } from '../extensionVariables';
import { AzureRegistryTreeItem } from '../tree/registries/azure/AzureRegistryTreeItem';

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
export async function streamLogs(node: AzureRegistryTreeItem, run: AcrModels.Run): Promise<void> {
    let temp: AcrModels.RunGetLogResult = await node.client.runs.getLogSasUrl(node.resourceGroup, node.registryName, run.runId);
    const link = temp.logLink;
    let blobInfo: IBlobInfo = getBlobInfo(link);
    let blob: BlobService = createBlobServiceWithSas(blobInfo.host, blobInfo.sasToken);
    let available = 0;
    let start = 0;

    let obtainLogs = setInterval(
        async () => {
            let props: BlobService.BlobResult;
            let metadata: { [key: string]: string; };
            try {
                props = await getBlobProperties(blobInfo, blob);
                metadata = props.metadata;
            } catch (err) {
                const error = parseError(err);
                // Not found happens when the properties havent yet been set, blob is not ready. Wait 1 second and try again
                if (error.errorType === 'NotFound') { return; } else { throw error; }
            }
            available = +props.contentLength;
            let text: string;
            // Makes sure that if item fails it does so due to network/azure errors not lack of new content
            if (available > start) {
                text = await getBlobToText(blobInfo, blob, start);
                let utf8encoded = (Buffer.from(text, 'ascii')).toString('utf8');
                utf8encoded = removeAnsiEscapeSequences(utf8encoded);
                start += text.length;
                ext.outputChannel.append(utf8encoded);
            }
            if (metadata.Complete) {
                clearInterval(obtainLogs);
            }
        },
        1000
    );
}

function removeAnsiEscapeSequences(text: string): string {
    // (^.*\x1B\[\d*;?\d*H)     - Esc[Line;ColumnH represents the cursor position. Remove any string before setting the cursore position.
    // (\x1B\[[^A-Za-z]*[A-Za-z]) - Remove any control sequence for example "Esc[40m". This is the only regex required for linux container, the others are used by windows container log.
    // (\x1B=)                    - "Esc=" enters the alternate keypad mode. So remove this, such sequences are present in windows container.
    // (\x1B]0;.*\x07)            - "Esc]0;string/x07" operating system command.
    // (\xEF\xBB\xBF)           - Removes the Byte Order Mark (BOM) of UTF-8.
    // eslint-disable-next-line no-control-regex
    const removeAnsiEscapeSequenceRegExp = new RegExp(/^.*\x1b\[\d*;?\d*H|\x1b\[[^A-Za-z]*[A-Za-z]|\x1b=|\x1b]0;.*\x07|\xEF\xBB\xBF/g);
    return text.replace(removeAnsiEscapeSequenceRegExp, '');
}

// Promisify getBlobToText for readability and error handling purposes
export async function getBlobToText(blobInfo: IBlobInfo, blob: BlobService, rangeStart: number): Promise<string> {
    return new Promise<string>(
        (resolve, reject) => {
            blob.getBlobToText(
                blobInfo.containerName,
                blobInfo.blobName,
                { rangeStart: rangeStart },
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
