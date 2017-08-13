import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { docker } from '../commands/utils/docker-endpoint';

export class DockerExplorerProvider implements vscode.TreeDataProvider<DockerNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<DockerNode | undefined> = new vscode.EventEmitter<DockerNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<DockerNode | undefined> = this._onDidChangeTreeData.event;
    private _imagesNode: DockerNode;
    private _containersNode: DockerNode;
    // private _registriesNode: DockerNode;
    private _debounceTimer: NodeJS.Timer;
    
     refresh(): void {
        this.refreshImages()
        this.refreshContainers()
        //this.refreshRegistries()
    }

    refreshImages(): void {
        this._onDidChangeTreeData.fire(this._imagesNode);
    }
    
    refreshContainers(): void {
        this._onDidChangeTreeData.fire(this._containersNode);
    }

    refreshRegistries(): void {
        //     this._onDidChangeTreeData.fire(this._registriesNode);
    }

    private setAutoRefresh(): void {
        // from https://github.com/formulahendry/vscode-docker-explorer/blob/master/src/dockerTreeBase.ts  
        const configOptions: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('docker');
        const interval = configOptions.get('explorerRefreshInterval', 1000);

        if (interval > 0) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => {
                this.refresh();
            }, interval);
        }
    }

    getTreeItem(element: DockerNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DockerNode): Promise<DockerNode[]> {
        return this.getDockerNodes(element);
    }

    private async getDockerNodes(element?: DockerNode): Promise<DockerNode[]> {

        let opts = {};
        let iconPath: any = {};
        let contextValue: string = "";
        let node: DockerNode;
        const nodes: DockerNode[] = [];

        if (!element) {
            this._imagesNode = new DockerNode("Images", vscode.TreeItemCollapsibleState.Collapsed, "dockerImagesLabel", null, null);
            this._containersNode = new DockerNode("Containers", vscode.TreeItemCollapsibleState.Collapsed, "dockerContainersLabel", null, null);
            // this._registriesNode = new DockerNode("Registries", vscode.TreeItemCollapsibleState.Collapsed, "dockerLabelRegistries", null, null);
            nodes.push(this._imagesNode);
            nodes.push(this._containersNode);
            // nodes.push(this._registriesNode);
        } else {

            if (element.label === 'Images') {
                const images: Docker.ImageDesc[] = await docker.getImageDescriptors();
                if (!images || images.length == 0) {
                    return [];
                } else {
                    for (let i = 0; i < images.length; i++) {
                        contextValue = "dockerImage";
                        if (!images[i].RepoTags) {
                            let node = new DockerNode("<none>:<none>", vscode.TreeItemCollapsibleState.None, contextValue);
                            node.imageDesc = images[i];
                            nodes.push(node);
                        } else {
                            for (let j = 0; j < images[i].RepoTags.length; j++) {
                                let node = new DockerNode(images[i].RepoTags[j], vscode.TreeItemCollapsibleState.None, contextValue);
                                node.imageDesc = images[i];
                                nodes.push(node);
                            }
                        }
                    }
                }
            }

            if (element.label === 'Containers') {

                opts = {
                    "filters": {
                        "status": ["created", "restarting", "running", "paused", "exited", "dead"]
                    }
                };

                const containers: Docker.ContainerDesc[] = await docker.getContainerDescriptors(opts);
                if (!containers || containers.length == 0) {
                    return [];
                } else {
                    for (let i = 0; i < containers.length; i++) {
                        if (['exited', 'dead'].includes(containers[i].State)) {
                            contextValue = "dockerContainerStopped";
                            iconPath = {
                                light: path.join(__filename, '..', '..', '..', 'images', 'light', 'mono_moby_small.png'),
                                dark: path.join(__filename, '..', '..', '..', 'images', 'dark', 'mono_moby_small.png')
                            };
                        } else {
                            contextValue = "dockerContainerRunning";
                            iconPath = {
                                light: path.join(__filename, '..', '..', '..', 'images', 'light', 'moby_small.png'),
                                dark: path.join(__filename, '..', '..', '..', 'images', 'dark', 'moby_small.png')
                            };
                        }

                        const containerName = containers[i].Names[0].substring(1);
                        let node = new DockerNode(`${containers[i].Image} (${containerName}) [${containers[i].Status}]`, vscode.TreeItemCollapsibleState.None, contextValue, null, iconPath);
                        node.containerDesc = containers[i];
                        nodes.push(node);

                    }
                }
            }

            if (element.label === 'Registries') {
                contextValue = "dockerLabel";
                nodes.push(new DockerNode("DockerHub", vscode.TreeItemCollapsibleState.Collapsed, contextValue, null, null));
                nodes.push(new DockerNode("Azure", vscode.TreeItemCollapsibleState.Collapsed, contextValue, null, null));
            }

        }

        this.setAutoRefresh();
        return nodes;
    }
}

export class DockerNode extends vscode.TreeItem {

    constructor(public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command,
        public iconPath: any = {
            light: path.join(__filename, '..', '..', '..', 'images', 'light', 'mono_moby_small.png'),
            dark: path.join(__filename, '..', '..', '..', 'images', 'dark', 'mono_moby_small.png')
        }) {

        super(label, collapsibleState);
    }

    public containerDesc: Docker.ContainerDesc;
    public imageDesc: Docker.ImageDesc;
    public registry: string;

}