import { CommonRegistry, CommonRegistryRoot, RegistryDataProvider, isRegistry } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { isAzureSubscriptionRegistryItem } from './Azure/AzureRegistryDataProvider';

export interface UnifiedRegistryItem<T> {
    provider: RegistryDataProvider<T>;
    wrappedItem: T;
    parent: UnifiedRegistryItem<T> | undefined;
}

export function isUnifiedRegistryItem(item: unknown): item is UnifiedRegistryItem<unknown> {
    return !!item && typeof item === 'object' && 'provider' in item && 'wrappedItem' in item && 'parent' in item;
}

const ConnectedRegistryProvidersKey = 'ConnectedRegistryProviders';

export class UnifiedRegistryTreeDataProvider implements vscode.TreeDataProvider<UnifiedRegistryItem<unknown>> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<UnifiedRegistryItem<unknown> | UnifiedRegistryItem<unknown>[] | undefined>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    private readonly providers = new Map<string, RegistryDataProvider<unknown>>();

    public constructor(private readonly storageMemento: vscode.Memento) {

    }

    public getTreeItem(element: UnifiedRegistryItem<unknown>): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.provider.getTreeItem(element.wrappedItem);
    }

    public async getChildren(element?: UnifiedRegistryItem<unknown> | undefined): Promise<UnifiedRegistryItem<unknown>[]> {
        if (element) {
            const elements = await element.provider.getChildren(element.wrappedItem);

            if (!elements) {
                return [];
            }

            return elements.map(e => {
                return {
                    provider: element.provider,
                    wrappedItem: e,
                    parent: element
                };
            });
        } else {
            const unifiedRoots: UnifiedRegistryItem<unknown>[] = [];

            const connectedProviderIds = this.storageMemento.get<string[]>(ConnectedRegistryProvidersKey, []);

            for (const provider of this.providers.values()) {
                if (!connectedProviderIds.includes(provider.id)) {
                    continue;
                }

                const roots = await provider.getChildren(undefined);
                if (!roots) {
                    continue;
                }

                unifiedRoots.push(...roots.map(r => {
                    return {
                        provider,
                        wrappedItem: r,
                        parent: undefined
                    };
                }));
            }

            return unifiedRoots;
        }
    }

    public getParent(element: UnifiedRegistryItem<unknown>): UnifiedRegistryItem<unknown> | undefined {
        return element.parent;
    }

    public registerProvider(provider: RegistryDataProvider<unknown>): vscode.Disposable {
        this.providers.set(provider.id, provider);

        return {
            dispose: () => {
                this.providers.delete(provider.id);
            }
        };
    }

    public async refresh(): Promise<void> {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    public async connectRegistryProvider(provider: RegistryDataProvider<unknown> | undefined = undefined): Promise<void> {
        const connectedProviderIds = this.storageMemento.get<string[]>(ConnectedRegistryProvidersKey, []);

        if (!provider) {
            const picks: (vscode.QuickPickItem & { provider: RegistryDataProvider<unknown> })[] = [];

            for (const currentProvider of this.providers.values()) {
                if (connectedProviderIds.includes(currentProvider.id)) {
                    continue;
                }

                picks.push({
                    label: currentProvider.label,
                    description: currentProvider.description,
                    provider: currentProvider
                });
            }

            const picked = await vscode.window.showQuickPick(picks, { placeHolder: vscode.l10n.t('Select a registry provider to use') });
            if (!picked) {
                return;
            }

            provider = picked.provider;
        }

        if (!connectedProviderIds.includes(provider.id)) {
            await provider?.onConnect?.();
            const connectedProviderIdsSet: Set<string> = new Set(connectedProviderIds);
            connectedProviderIdsSet.add(provider.id);
            await this.storageMemento.update(ConnectedRegistryProvidersKey, Array.from(connectedProviderIdsSet));
        }

        void this.refresh();
    }

    public async disconnectRegistryProvider(item: UnifiedRegistryItem<unknown>): Promise<void> {
        await item.provider?.onDisconnect?.();

        const newConnectedProviderIds = this.storageMemento
            .get<string[]>(ConnectedRegistryProvidersKey, [])
            .filter(cpi => cpi !== item.provider.id);
        await this.storageMemento.update(ConnectedRegistryProvidersKey, newConnectedProviderIds);

        void this.refresh();
    }

    /**
     *
     * @param imageBaseName The base name of the image to find registries for. e.g. 'docker.io'
     * @returns A list of registries that are connected to the extension. If imageBaseName is provided, only registries that
     *          can be used to push to that image will be returned.
     */
    public async getConnectedRegistries(imageBaseName?: string): Promise<UnifiedRegistryItem<CommonRegistry>[]> {
        let registryRoots = await this.getChildren();
        let findAzureRegistryOnly = false;

        // filter out registry roots that don't match the image base name
        if (imageBaseName) {
            if (imageBaseName === 'docker.io') {
                registryRoots = registryRoots.filter(r => (r.wrappedItem as CommonRegistryRoot).label === ext.dockerHubRegistryDataProvider.label);
            }
            else if (imageBaseName.endsWith('azurecr.io')) {
                registryRoots = registryRoots.filter(r => (r.wrappedItem as CommonRegistryRoot).label === ext.azureRegistryDataProvider.label);
                findAzureRegistryOnly = true;
            }
            else if (imageBaseName === 'ghcr.io') {
                registryRoots = registryRoots.filter(r => (r.wrappedItem as CommonRegistryRoot).label === ext.githubRegistryDataProvider.label);
            }
            else {
                registryRoots = registryRoots.filter(
                    r => (r.wrappedItem as CommonRegistryRoot).label !== 'Docker Hub'
                        && (r.wrappedItem as CommonRegistryRoot).label !== 'Azure'
                        && (r.wrappedItem as CommonRegistryRoot).label !== 'GitHub');
            }
        }

        const results: UnifiedRegistryItem<CommonRegistry>[] = [];

        for (const registryRoot of registryRoots) {
            try {
                const maybeRegistries = await this.getChildren(registryRoot);

                for (const maybeRegistry of maybeRegistries) {
                    // short circuit if we're only looking for Azure registries
                    if (!findAzureRegistryOnly && isRegistry(maybeRegistry.wrappedItem)) {
                        results.push(maybeRegistry as UnifiedRegistryItem<CommonRegistry>);
                    } else if (findAzureRegistryOnly || isAzureSubscriptionRegistryItem(maybeRegistry.wrappedItem)) {
                        const registries = await this.getChildren(maybeRegistry);

                        for (const registry of registries) {
                            if (isRegistry(registry.wrappedItem)) {
                                results.push(registry as UnifiedRegistryItem<CommonRegistry>);
                            }
                        }
                    }
                }
            } catch {
                // best effort
            }
        }

        return results;
    }
}
