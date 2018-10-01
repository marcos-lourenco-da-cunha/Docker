/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import * as path from 'path';
import * as request from 'request-promise-native';
import * as vscode from 'vscode';
import { AzureUserInput, createTelemetryReporter, IActionContext, parseError, registerCommand as uiRegisterCommand, registerUIExtensionVariables, TelemetryProperties, UserCancelledError } from 'vscode-azureextensionui';
import { ConfigurationParams, DidChangeConfigurationNotification, DocumentSelector, LanguageClient, LanguageClientOptions, Middleware, ServerOptions, TransportKind } from 'vscode-languageclient/lib/main';
import { createRegistry } from './commands/azureCommands/create-registry';
import { deleteAzureImage } from './commands/azureCommands/delete-image';
import { deleteAzureRegistry } from './commands/azureCommands/delete-registry';
import { deleteRepository } from './commands/azureCommands/delete-repository';
import { buildImage } from './commands/build-image';
import { composeDown, composeRestart, composeUp } from './commands/docker-compose';
import inspectImage from './commands/inspect-image';
import { openShellContainer } from './commands/open-shell-container';
import { pushImage } from './commands/push-image';
import { consolidateDefaultRegistrySettings, setRegistryAsDefault } from './commands/registrySettings';
import { removeContainer } from './commands/remove-container';
import { removeImage } from './commands/remove-image';
import { restartContainer } from './commands/restart-container';
import { showLogsContainer } from './commands/showlogs-container';
import { startAzureCLI, startContainer, startContainerInteractive } from './commands/start-container';
import { stopContainer } from './commands/stop-container';
import { systemPrune } from './commands/system-prune';
import { IHasImageDescriptorAndLabel, tagImage } from './commands/tag-image';
import { docker } from './commands/utils/docker-endpoint';
import { DefaultTerminalProvider } from './commands/utils/TerminalProvider';
import { DockerDebugConfigProvider } from './configureWorkspace/configDebugProvider';
import { configure, configureApi, ConfigureApiOptions } from './configureWorkspace/configure';
import { DefaultAppStorageProvider } from './debugging/netcoreapp/appStorage';
import { BrowserClient, OpnBrowserClient } from './debugging/netcoreapp/browserClient';
import { DefaultDebuggerClient } from './debugging/netcoreapp/debuggerClient';
import { DockerDebugSessionManager } from './debugging/netcoreapp/debugSessionManager';
import CliDockerClient from './debugging/netcoreapp/dockerClient';
import DockerDebugConfigurationProvider from './debugging/netcoreapp/dockerDebugConfigurationProvider';
import { DefaultDockerManager } from './debugging/netcoreapp/dockerManager';
import { LocalFileSystemProvider } from './debugging/netcoreapp/fsProvider';
import { CommandLineMSBuildClient } from './debugging/netcoreapp/msBuildClient';
import { MsBuildNetCoreProjectProvider } from './debugging/netcoreapp/netCoreProjectProvider';
import LocalOSProvider from './debugging/netcoreapp/osProvider';
import { DefaultOutputManager } from './debugging/netcoreapp/outputManager';
import { AggregatePrerequisite, DotNetExtensionInstalledPrerequisite, MacNuGetFallbackFolderSharedPrerequisite } from './debugging/netcoreapp/prereqManager';
import ChildProcessProvider from './debugging/netcoreapp/processProvider';
import { OSTempFileProvider } from './debugging/netcoreapp/tempFileProvider';
import { RemoteVsDbgClient } from './debugging/netcoreapp/vsdbgClient';
import { DockerComposeCompletionItemProvider } from './dockerCompose/dockerComposeCompletionItemProvider';
import { DockerComposeHoverProvider } from './dockerCompose/dockerComposeHoverProvider';
import composeVersionKeys from './dockerCompose/dockerComposeKeyInfo';
import { DockerComposeParser } from './dockerCompose/dockerComposeParser';
import { DockerfileCompletionItemProvider } from './dockerfile/dockerfileCompletionItemProvider';
import DockerInspectDocumentContentProvider, { SCHEME as DOCKER_INSPECT_SCHEME } from './documentContentProviders/dockerInspect';
import { AzureAccountWrapper } from './explorer/deploy/azureAccountWrapper';
import * as util from "./explorer/deploy/util";
import { WebAppCreator } from './explorer/deploy/webAppCreator';
import { DockerExplorerProvider } from './explorer/dockerExplorer';
import { AzureImageTagNode, AzureRegistryNode, AzureRepositoryNode } from './explorer/models/azureRegistryNodes';
import { ContainerNode } from './explorer/models/containerNode';
import { connectCustomRegistry, disconnectCustomRegistry } from './explorer/models/customRegistries';
import { DockerHubImageTagNode, DockerHubOrgNode, DockerHubRepositoryNode } from './explorer/models/dockerHubNodes';
import { ImageNode } from './explorer/models/imageNode';
import { NodeBase } from './explorer/models/nodeBase';
import { RootNode } from './explorer/models/rootNode';
import { browseAzurePortal } from './explorer/utils/browseAzurePortal';
import { browseDockerHub, dockerHubLogout } from './explorer/utils/dockerHubUtils';
import { ext } from "./extensionVariables";
import { initializeTelemetryReporter, reporter } from './telemetry/telemetry';
import { AzureAccount } from './typings/azure-account.api';
import { addUserAgent } from './utils/addUserAgent';
import { registerAzureCommand } from './utils/Azure/common';
import { AzureUtilityManager } from './utils/azureUtilityManager';
import { Keytar } from './utils/keytar';

export const FROM_DIRECTIVE_PATTERN = /^\s*FROM\s*([\w-\/:]*)(\s*AS\s*[a-z][a-z0-9-_\\.]*)?$/i;
export const COMPOSE_FILE_GLOB_PATTERN = '**/[dD]ocker-[cC]ompose*.{yaml,yml}';
export const DOCKERFILE_GLOB_PATTERN = '**/{*.dockerfile,[dD]ocker[fF]ile}';

export let dockerExplorerProvider: DockerExplorerProvider;

export type KeyInfo = { [keyName: string]: string; };

export interface ComposeVersionKeys {
    All: KeyInfo,
    v1: KeyInfo,
    v2: KeyInfo
}

let client: LanguageClient;

const DOCUMENT_SELECTOR: DocumentSelector = [
    { language: 'dockerfile', scheme: 'file' }
];

function initializeExtensionVariables(ctx: vscode.ExtensionContext): void {
    registerUIExtensionVariables(ext);

    if (!ext.ui) {
        // This allows for standard interactions with the end user (as opposed to test input)
        ext.ui = new AzureUserInput(ctx.globalState);
    }
    ext.context = ctx;
    ext.outputChannel = util.getOutputChannel();
    if (!ext.terminalProvider) {
        ext.terminalProvider = new DefaultTerminalProvider();
    }
    initializeTelemetryReporter(createTelemetryReporter(ctx));
    ext.reporter = reporter;
    if (!ext.keytar) {
        ext.keytar = Keytar.tryCreate();
    }

    // Set up the user agent for all direct 'request' calls in the extension (must use ext.request)
    let defaultRequestOptions = {};
    addUserAgent(defaultRequestOptions);
    ext.request = request.defaults(defaultRequestOptions);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    const installedExtensions = vscode.extensions.all;
    let azureAccount: AzureAccount | undefined;

    initializeExtensionVariables(ctx);

    // tslint:disable-next-line:prefer-for-of // Grandfathered in
    for (let i = 0; i < installedExtensions.length; i++) {
        const extension = installedExtensions[i];
        if (extension.id === 'ms-vscode.azure-account') {
            try {
                // tslint:disable-next-line:no-unsafe-any
                azureAccount = <AzureAccount>await extension.activate();
            } catch (error) {
                console.log('Failed to activate the Azure Account Extension: ' + parseError(error).message);
            }
            break;
        }
    }
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, new DockerfileCompletionItemProvider(), '.'));

    const YAML_MODE_ID: vscode.DocumentFilter = { language: 'yaml', scheme: 'file', pattern: COMPOSE_FILE_GLOB_PATTERN };
    let yamlHoverProvider = new DockerComposeHoverProvider(new DockerComposeParser(), composeVersionKeys.All);
    ctx.subscriptions.push(vscode.languages.registerHoverProvider(YAML_MODE_ID, yamlHoverProvider));
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(YAML_MODE_ID, new DockerComposeCompletionItemProvider(), '.'));

    ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DOCKER_INSPECT_SCHEME, new DockerInspectDocumentContentProvider()));

    if (azureAccount) {
        AzureUtilityManager.getInstance().setAccount(azureAccount);
    }

    registerDockerCommands(azureAccount);

    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('docker', new DockerDebugConfigProvider()));

    registerDebugConfigurationProvider(ctx);

    await consolidateDefaultRegistrySettings();
    activateLanguageClient(ctx);
}

async function createWebApp(context?: AzureImageTagNode | DockerHubImageTagNode, azureAccount?: AzureAccount): Promise<void> {
    if (context) {
        if (azureAccount) {
            const azureAccountWrapper = new AzureAccountWrapper(ext.context, azureAccount);
            const wizard = new WebAppCreator(ext.outputChannel, azureAccountWrapper, context);
            const result = await wizard.run();
            if (result.status === 'Faulted') {
                throw result.error;
            } else if (result.status === 'Cancelled') {
                throw new UserCancelledError();
            }
        } else {
            const open: vscode.MessageItem = { title: "View in Marketplace" };
            const response = await vscode.window.showErrorMessage('Please install the Azure Account extension to deploy to Azure.', open);
            if (response === open) {
                // tslint:disable-next-line:no-unsafe-any
                opn('https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account');
            }
        }
    }
}

// Remove this when https://github.com/Microsoft/vscode-docker/issues/445 fixed
// tslint:disable-next-line:no-any
function registerCommand(commandId: string, callback: (this: IActionContext, ...args: any[]) => any): void {
    return uiRegisterCommand(
        commandId,
        // tslint:disable-next-line:no-function-expression no-any
        async function (this: IActionContext, ...args: any[]): Promise<any> {
            if (args.length) {
                let properties: {
                    contextValue?: string;
                } & TelemetryProperties = this.properties;
                const contextArg = args[0];

                if (contextArg instanceof NodeBase) {
                    properties.contextValue = contextArg.contextValue;
                } else if (contextArg instanceof vscode.Uri) {
                    properties.contextValue = 'Uri';
                }
            }

            return callback.call(this, ...args);
        });
}

function registerDockerCommands(azureAccount: AzureAccount | undefined): void {
    dockerExplorerProvider = new DockerExplorerProvider(azureAccount);
    vscode.window.registerTreeDataProvider('dockerExplorer', dockerExplorerProvider);
    registerCommand('vscode-docker.explorer.refresh', () => dockerExplorerProvider.refresh());

    registerCommand('vscode-docker.configure', async function (this: IActionContext): Promise<void> { await configure(this, undefined); });
    registerCommand('vscode-docker.api.configure', async function (this: IActionContext, options: ConfigureApiOptions): Promise<void> {
        await configureApi(this, options);
    });

    registerCommand('vscode-docker.container.start', async function (this: IActionContext, node: ImageNode | undefined): Promise<void> { await startContainer(this, node); });
    registerCommand('vscode-docker.container.start.interactive', async function (this: IActionContext, node: ImageNode | undefined): Promise<void> { await startContainerInteractive(this, node); });
    registerCommand('vscode-docker.container.start.azurecli', async function (this: IActionContext): Promise<void> { await startAzureCLI(this); });
    registerCommand('vscode-docker.container.stop', async function (this: IActionContext, node: ContainerNode | RootNode | undefined): Promise<void> { await stopContainer(this, node); });
    registerCommand('vscode-docker.container.restart', async function (this: IActionContext, node: ContainerNode | RootNode | undefined): Promise<void> { await restartContainer(this, node); });
    registerCommand('vscode-docker.container.show-logs', async function (this: IActionContext, node: ContainerNode | RootNode | undefined): Promise<void> { await showLogsContainer(this, node); });
    registerCommand('vscode-docker.container.open-shell', async function (this: IActionContext, node: ContainerNode | RootNode | undefined): Promise<void> { await openShellContainer(this, node); });
    registerCommand('vscode-docker.container.remove', async function (this: IActionContext, node: ContainerNode | RootNode | undefined): Promise<void> { await removeContainer(this, node); });
    registerCommand('vscode-docker.image.build', async function (this: IActionContext, item: vscode.Uri | undefined): Promise<void> { await buildImage(this, item); });
    registerCommand('vscode-docker.image.inspect', async function (this: IActionContext, node: ImageNode | undefined): Promise<void> { await inspectImage(this, node); });
    registerCommand('vscode-docker.image.remove', async function (this: IActionContext, node: ImageNode | RootNode | undefined): Promise<void> { await removeImage(this, node); });
    registerCommand('vscode-docker.image.push', async function (this: IActionContext, node: ImageNode | undefined): Promise<void> { await pushImage(this, node); });
    registerCommand('vscode-docker.image.tag', async function (this: IActionContext, node: ImageNode | undefined): Promise<void> { await tagImage(this, node); });
    registerCommand('vscode-docker.compose.up', composeUp);
    registerCommand('vscode-docker.compose.down', composeDown);
    registerCommand('vscode-docker.compose.restart', composeRestart);
    registerCommand('vscode-docker.system.prune', systemPrune);
    registerCommand('vscode-docker.createWebApp', async (context?: AzureImageTagNode | DockerHubImageTagNode) => await createWebApp(context, azureAccount));
    registerCommand('vscode-docker.dockerHubLogout', dockerHubLogout);
    registerCommand('vscode-docker.browseDockerHub', (context?: DockerHubImageTagNode | DockerHubRepositoryNode | DockerHubOrgNode) => {
        browseDockerHub(context);
    });
    registerCommand('vscode-docker.browseAzurePortal', (context?: AzureRegistryNode | AzureRepositoryNode | AzureImageTagNode) => {
        browseAzurePortal(context);
    });
    registerCommand('vscode-docker.connectCustomRegistry', connectCustomRegistry);
    registerCommand('vscode-docker.disconnectCustomRegistry', disconnectCustomRegistry);
    registerCommand('vscode-docker.setRegistryAsDefault', setRegistryAsDefault);
    registerAzureCommand('vscode-docker.delete-ACR-Registry', deleteAzureRegistry);
    registerAzureCommand('vscode-docker.delete-ACR-Image', deleteAzureImage);
    registerAzureCommand('vscode-docker.delete-ACR-Repository', deleteRepository);
    registerAzureCommand('vscode-docker.create-ACR-Registry', createRegistry);
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return undefined;
    }
    // perform cleanup
    Configuration.dispose();
    return await client.stop();
}

namespace Configuration {

    let configurationListener: vscode.Disposable;

    export function computeConfiguration(params: ConfigurationParams): vscode.WorkspaceConfiguration[] {
        let result: vscode.WorkspaceConfiguration[] = [];
        for (let item of params.items) {
            let config: vscode.WorkspaceConfiguration;

            if (item.scopeUri) {
                config = vscode.workspace.getConfiguration(item.section, client.protocol2CodeConverter.asUri(item.scopeUri));
            } else {
                config = vscode.workspace.getConfiguration(item.section);
            }
            result.push(config);
        }
        return result;
    }

    export function initialize(): void {
        configurationListener = vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            // notify the language server that settings have change
            client.sendNotification(DidChangeConfigurationNotification.type, { settings: null });

            // Update endpoint and refresh explorer if needed
            if (e.affectsConfiguration('docker')) {
                docker.refreshEndpoint();
                vscode.commands.executeCommand("vscode-docker.explorer.refresh");
            }
        });
    }

    export function dispose(): void {
        if (configurationListener) {
            // remove this listener when disposed
            configurationListener.dispose();
        }
    }
}

function registerDebugConfigurationProvider(ctx: vscode.ExtensionContext): void {
    const configuration = vscode.workspace.getConfiguration('docker.debugging');

    if (configuration.get('enabled', false)) {
        const fileSystemProvider = new LocalFileSystemProvider();

        const processProvider = new ChildProcessProvider();
        const dockerClient = new CliDockerClient(processProvider);
        const osProvider = new LocalOSProvider();

        const dockerOutputChannel = vscode.window.createOutputChannel('Docker');

        ctx.subscriptions.push(dockerOutputChannel);

        const dockerOutputManager = new DefaultOutputManager(dockerOutputChannel);

        const dockerManager =
            new DefaultDockerManager(
                new DefaultAppStorageProvider(fileSystemProvider),
                new DefaultDebuggerClient(
                    new RemoteVsDbgClient(
                        dockerOutputManager,
                        fileSystemProvider,
                        ctx.globalState,
                        osProvider,
                        processProvider)),
                dockerClient,
                dockerOutputManager,
                fileSystemProvider,
                osProvider,
                processProvider,
                ctx.workspaceState);

        const debugSessionManager = new DockerDebugSessionManager(
            vscode.debug.onDidTerminateDebugSession,
            dockerManager
        );

        ctx.subscriptions.push(debugSessionManager);

        ctx.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(
                'docker-netcoreapp',
                new DockerDebugConfigurationProvider(
                    debugSessionManager,
                    dockerManager,
                    fileSystemProvider,
                    osProvider,
                    new MsBuildNetCoreProjectProvider(
                        fileSystemProvider,
                        new CommandLineMSBuildClient(processProvider),
                        new OSTempFileProvider(
                            osProvider,
                            processProvider)),
                    new AggregatePrerequisite(
                        new DotNetExtensionInstalledPrerequisite(
                            new OpnBrowserClient(),
                            vscode.extensions.getExtension,
                            vscode.window.showErrorMessage),
                        new MacNuGetFallbackFolderSharedPrerequisite(
                            fileSystemProvider,
                            osProvider,
                            vscode.window.showErrorMessage)
                    ))));
    }
}

function activateLanguageClient(ctx: vscode.ExtensionContext): void {
    let serverModule = ctx.asAbsolutePath(path.join("node_modules", "dockerfile-language-server-nodejs", "lib", "server.js"));
    let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, args: ["--node-ipc"] },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    }

    let middleware: Middleware = {
        workspace: {
            configuration: Configuration.computeConfiguration
        }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: DOCUMENT_SELECTOR,
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        },
        middleware: middleware
    }

    client = new LanguageClient("dockerfile-langserver", "Dockerfile Language Server", serverOptions, clientOptions);
    // tslint:disable-next-line:no-floating-promises
    client.onReady().then(() => {
        // attach the VS Code settings listener
        Configuration.initialize();
    });
    client.start();
}
