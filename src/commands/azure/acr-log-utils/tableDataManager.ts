import ContainerRegistryManagementClient from "azure-arm-containerregistry";
import { Registry, Run, RunGetLogResult, RunListResult } from "azure-arm-containerregistry/lib/models";
import vscode = require('vscode');
import { parseError } from "vscode-azureextensionui";
import { getImageDigest } from "../../../utils/Azure/acrTools";
import { AzureImage } from "../../../utils/Azure/models/image";
import { Repository } from "../../../utils/Azure/models/repository";

/** Class to manage data and data acquisition for logs */
export class LogData {
    public registry: Registry;
    public resourceGroup: string;
    public links: { requesting: boolean, url?: string }[];
    public logs: Run[];
    public client: ContainerRegistryManagementClient;
    private nextLink: string;

    constructor(client: ContainerRegistryManagementClient, registry: Registry, resourceGroup: string) {
        this.registry = registry;
        this.resourceGroup = resourceGroup;
        this.client = client;
        this.logs = [];
        this.links = [];
    }
    /** Acquires Links from an item number corresponding to the index of the corresponding log, caches
     * logs in order to avoid unecessary requests if opened multiple times.
     */
    public async getLink(itemNumber: number): Promise<string> {
        if (itemNumber >= this.links.length) {
            throw new Error('Log for which the link was requested has not been added');
        }

        if (this.links[itemNumber].url) {
            return this.links[itemNumber].url;
        }

        //If user is simply clicking many times impatiently it makes sense to only have one request at once
        if (this.links[itemNumber].requesting) { return 'requesting' }

        this.links[itemNumber].requesting = true;
        const temp: RunGetLogResult = await this.client.runs.getLogSasUrl(this.resourceGroup, this.registry.name, this.logs[itemNumber].runId);
        this.links[itemNumber].url = temp.logLink;
        this.links[itemNumber].requesting = false;
        return this.links[itemNumber].url
    }

    //contains(TaskName, 'testTask')
    //`TaskName eq 'testTask'
    //
    /** Loads logs from azure
     * @param loadNext Determines if the next page of logs should be loaded, will throw an error if there are no more logs to load
     * @param removeOld Cleans preexisting information on links and logs imediately before new requests, if loadNext is specified
     * the next page of logs will be saved and all preexisting data will be deleted.
     * @param filter Specifies a filter for log items, if run Id is specified this will take precedence
     */
    public async loadLogs(options: { webViewEvent: boolean, loadNext: boolean, removeOld?: boolean, filter?: Filter }): Promise<void> {
        let runListResult: RunListResult;

        if (options.filter && Object.keys(options.filter).length) {
            if (!options.filter.runId) {
                let runOptions: {
                    filter?: string,
                    top?: number,
                    customHeaders?: {
                        [headerName: string]: string;
                    };
                } = {};
                runOptions.filter = await this.parseFilter(options.filter);
                if (options.filter.image) { runOptions.top = 1; }
                runListResult = await this.client.runs.list(this.resourceGroup, this.registry.name, runOptions);
            } else {
                runListResult = [];
                try {
                    runListResult.push(await this.client.runs.get(this.resourceGroup, this.registry.name, options.filter.runId));
                } catch (err) {
                    const error = parseError(err);
                    if (!options.webViewEvent) {
                        throw err;
                    } else if (error.errorType !== "EntityNotFound") {
                        vscode.window.showErrorMessage(`Error '${error.errorType}': ${error.message}`);
                    }
                }
            }
        } else {
            if (options.loadNext) {
                if (this.nextLink) {
                    runListResult = await this.client.runs.listNext(this.nextLink);
                } else if (options.webViewEvent) {
                    vscode.window.showErrorMessage("No more logs to show.");
                } else {
                    throw new Error('No more logs to show');
                }
            } else {
                runListResult = await this.client.runs.list(this.resourceGroup, this.registry.name);
            }
        }
        if (options.removeOld) {
            //Clear Log Items
            this.logs = [];
            this.links = [];
            this.nextLink = '';
        }
        this.nextLink = runListResult.nextLink;
        this.logs = this.logs.concat(runListResult);

        const itemCount = runListResult.length;
        for (let i = 0; i < itemCount; i++) {
            this.links.push({ 'requesting': false });
        }
    }

    public hasNextPage(): boolean {
        return this.nextLink !== undefined;
    }

    public isEmpty(): boolean {
        return this.logs.length === 0;
    }

    private async parseFilter(filter: Filter): Promise<string> {
        let parsedFilter = "";
        if (filter.task) { //Task id
            parsedFilter = `TaskName eq '${filter.task}'`;
        } else if (filter.image) { //Image
            let items: string[] = filter.image.split(':')
            if (items.length !== 2) {
                throw new Error('Wrong format: It should be <image>:<tag>');
            }
            const image = new AzureImage(await Repository.Create(this.registry, items[0]), items[1]);
            const imageDigest: string = await getImageDigest(image);

            if (parsedFilter.length > 0) { parsedFilter += ' and '; }
            parsedFilter += `contains(OutputImageManifests, '${image.repository.name}@${imageDigest}')`;
        }
        return parsedFilter;
    }
}

export interface Filter {
    image?: string;
    runId?: string;
    task?: string;
}
