/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, ProviderResult, WorkspaceFolder } from 'vscode';
import { callWithTelemetryAndErrorHandling } from 'vscode-azureextensionui';
import { PlatformOS } from '../../utils/platform';
import { DebugSessionManager } from './debugSessionManager';
import { DockerContainerExtraHost, DockerContainerPort, DockerContainerVolume } from './dockerClient';
import { DockerManager, LaunchBuildOptions, LaunchResult, LaunchRunOptions } from './dockerManager';
import { FileSystemProvider } from './fsProvider';
import { NetCoreProjectProvider } from './netCoreProjectProvider';
import { OSProvider } from './osProvider';
import { Prerequisite } from './prereqManager';

interface DockerDebugBuildOptions {
    args?: { [key: string]: string };
    context?: string;
    dockerfile?: string;
    labels?: { [key: string]: string };
    tag?: string;
    target?: string;
}

interface DockerDebugRunOptions {
    containerName?: string;
    env?: { [key: string]: string };
    envFiles?: string[];
    extraHosts?: DockerContainerExtraHost[];
    labels?: { [key: string]: string };
    network?: string;
    networkAlias?: string;
    os?: PlatformOS;
    ports?: DockerContainerPort[];
    volumes?: DockerContainerVolume[];
}

interface DebugConfigurationBrowserBaseOptions {
    enabled?: boolean;
    command?: string;
    args?: string;
}

interface DebugConfigurationBrowserOptions extends DebugConfigurationBrowserBaseOptions {
    windows?: DebugConfigurationBrowserBaseOptions;
    osx?: DebugConfigurationBrowserBaseOptions;
    linux?: DebugConfigurationBrowserBaseOptions;
}

interface DockerDebugConfiguration extends DebugConfiguration {
    appFolder?: string;
    appOutput?: string;
    appProject?: string;
    dockerBuild?: DockerDebugBuildOptions;
    dockerRun?: DockerDebugRunOptions;
}

export class DockerDebugConfigurationProvider implements DebugConfigurationProvider {
    private static readonly defaultLabels: { [key: string]: string } = { 'com.microsoft.created-by': 'visual-studio-code' };

    constructor(
        private readonly debugSessionManager: DebugSessionManager,
        private readonly dockerManager: DockerManager,
        private readonly fsProvider: FileSystemProvider,
        private readonly osProvider: OSProvider,
        private readonly netCoreProjectProvider: NetCoreProjectProvider,
        private readonly prerequisite: Prerequisite) {
    }

    public provideDebugConfigurations(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugConfiguration[]> {
        return [
            {
                name: 'Docker: Launch .NET Core (Preview)',
                type: 'docker-coreclr',
                request: 'launch',
                preLaunchTask: 'build',
                dockerBuild: {
                },
                dockerRun: {
                }
            }
        ];
    }

    public resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DockerDebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration | undefined> {
        return callWithTelemetryAndErrorHandling(
            'debugCoreClr',
            async () => await this.resolveDockerDebugConfiguration(folder, debugConfiguration));
    }

    private static resolveFolderPath(folderPath: string, folder: WorkspaceFolder): string {
        return folderPath.replace(/\$\{workspaceFolder\}/gi, folder.uri.fsPath);
    }

    private async resolveDockerDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DockerDebugConfiguration): Promise<DebugConfiguration | undefined> {
        if (!folder) {
            throw new Error('No workspace folder is associated with debugging.');
        }

        const { appFolder, resolvedAppFolder } = await this.inferAppFolder(folder, debugConfiguration);

        const { resolvedAppProject } = await this.inferAppProject(folder, debugConfiguration, resolvedAppFolder);

        const appName = path.parse(resolvedAppProject).name;

        const os = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.os
            ? debugConfiguration.dockerRun.os
            : 'Linux';

        const appOutput = await this.inferAppOutput(debugConfiguration, os, resolvedAppProject);

        const buildOptions = await this.inferBuildOptions(folder, debugConfiguration, appFolder, resolvedAppFolder, appName);
        const runOptions = DockerDebugConfigurationProvider.inferRunOptions(folder, debugConfiguration, appName, os);

        const launchOptions = {
            appFolder: resolvedAppFolder,
            appOutput,
            build: buildOptions,
            run: runOptions
        };

        const prerequisiteSatisfied = await this.prerequisite.checkPrerequisite(launchOptions);

        if (!prerequisiteSatisfied) {
            return undefined;
        }

        const result = await this.dockerManager.prepareForLaunch(launchOptions);

        const configuration = this.createConfiguration(debugConfiguration, appFolder, result);

        this.debugSessionManager.startListening();

        return configuration;
    }

    private async inferBuildOptions(folder: WorkspaceFolder, debugConfiguration: DockerDebugConfiguration, appFolder: string, resolvedAppFolder: string, appName: string): Promise<LaunchBuildOptions> {
        const resolvedContext = await this.inferContext(folder, resolvedAppFolder, debugConfiguration);

        const dockerfile = await this.inferDockerfile(folder, resolvedAppFolder, debugConfiguration);

        const args = debugConfiguration && debugConfiguration.dockerBuild && debugConfiguration.dockerBuild.args;

        const labels = (debugConfiguration && debugConfiguration.dockerBuild && debugConfiguration.dockerBuild.labels)
            || DockerDebugConfigurationProvider.defaultLabels;

        const tag = debugConfiguration && debugConfiguration.dockerBuild && debugConfiguration.dockerBuild.tag
            ? debugConfiguration.dockerBuild.tag
            : `${appName.toLowerCase()}:dev`;

        const target = debugConfiguration && debugConfiguration.dockerBuild && debugConfiguration.dockerBuild.target
            ? debugConfiguration.dockerBuild.target
            : 'base'; // CONSIDER: Omit target if not specified, or possibly infer from Dockerfile.

        return {
            args,
            context: resolvedContext,
            dockerfile,
            labels,
            tag,
            target
        };
    }

    private static inferRunOptions(folder: WorkspaceFolder, debugConfiguration: DockerDebugConfiguration, appName: string, os: PlatformOS): LaunchRunOptions {
        const containerName = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.containerName
            ? debugConfiguration.dockerRun.containerName
            : `${appName}-dev`; // CONSIDER: Use unique ID instead?

        const env = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.env;
        const envFiles = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.envFiles
            ? debugConfiguration.dockerRun.envFiles.map(file => DockerDebugConfigurationProvider.resolveFolderPath(file, folder))
            : undefined;

        const labels = (debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.labels)
            || DockerDebugConfigurationProvider.defaultLabels;

        const network = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.network;
        const networkAlias = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.networkAlias;
        const ports = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.ports;
        const volumes = DockerDebugConfigurationProvider.inferVolumes(folder, debugConfiguration);
        const extraHosts = debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.extraHosts;

        return {
            containerName,
            env,
            envFiles,
            extraHosts,
            labels,
            network,
            networkAlias,
            os,
            ports,
            volumes
        };
    }

    private static inferVolumes(folder: WorkspaceFolder, debugConfiguration: DockerDebugConfiguration): DockerContainerVolume[] {
        return debugConfiguration && debugConfiguration.dockerRun && debugConfiguration.dockerRun.volumes
            ? debugConfiguration.dockerRun.volumes.map(volume => ({ ...volume, localPath: DockerDebugConfigurationProvider.resolveFolderPath(volume.localPath, folder) }))
            : [];
    }

    private async inferAppFolder(folder: WorkspaceFolder, configuration: DockerDebugConfiguration): Promise<{ appFolder: string, resolvedAppFolder: string }> {
        let appFolder: string;

        if (configuration) {
            if (configuration.appFolder) {
                appFolder = configuration.appFolder;
            } else if (configuration.appProject) {
                appFolder = path.dirname(configuration.appProject);
            }
        }

        if (appFolder === undefined) {
            appFolder = folder.uri.fsPath;
        }

        const folders = {
            appFolder,
            resolvedAppFolder: DockerDebugConfigurationProvider.resolveFolderPath(appFolder, folder)
        };

        if (!await this.fsProvider.dirExists(folders.resolvedAppFolder)) {
            throw new Error(`The application folder '${folders.resolvedAppFolder}' does not exist. Ensure that the 'appFolder' or 'appProject' property is set correctly in the Docker debug configuration.`);
        }

        return folders;
    }

    private async inferAppOutput(configuration: DockerDebugConfiguration, targetOS: PlatformOS, resolvedAppProject: string): Promise<string> {
        if (configuration && configuration.appOutput) {
            return configuration.appOutput;
        }

        const targetPath = await this.netCoreProjectProvider.getTargetPath(resolvedAppProject);
        const relativeTargetPath = this.osProvider.pathNormalize(targetOS, path.relative(path.dirname(resolvedAppProject), targetPath));

        return relativeTargetPath;
    }

    private async inferAppProject(folder: WorkspaceFolder, configuration: DockerDebugConfiguration, resolvedAppFolder: string): Promise<{ appProject: string, resolvedAppProject: string }> {
        let appProject: string;

        if (configuration && configuration.appProject) {
            appProject = configuration.appProject;
        }

        if (appProject === undefined) {
            const files = await this.fsProvider.readDir(resolvedAppFolder);

            const projectFile = files.find(file => ['.csproj', '.fsproj'].includes(path.extname(file)));

            if (projectFile) {
                appProject = path.join(resolvedAppFolder, projectFile);
            }
        }

        if (appProject === undefined) {
            throw new Error('Unable to infer the application project file. Set either the \'appFolder\' or \'appProject\' property in the Docker debug configuration.');
        }

        const projects = {
            appProject,
            resolvedAppProject: DockerDebugConfigurationProvider.resolveFolderPath(appProject, folder)
        };

        if (!await this.fsProvider.fileExists(projects.resolvedAppProject)) {
            throw new Error(`The application project file '${projects.resolvedAppProject}' does not exist. Ensure that the 'appFolder' or 'appProject' property is set correctly in the Docker debug configuration.`);
        }

        return projects;
    }

    private async inferContext(folder: WorkspaceFolder, resolvedAppFolder: string, configuration: DockerDebugConfiguration): Promise<string> {
        const context = configuration && configuration.dockerBuild && configuration.dockerBuild.context
            ? configuration.dockerBuild.context
            : path.normalize(resolvedAppFolder) === path.normalize(folder.uri.fsPath)
                ? resolvedAppFolder                 // The context defaults to the application folder if it's the same as the workspace folder (i.e. there's no solution folder).
                : path.dirname(resolvedAppFolder);  // The context defaults to the application's parent (i.e. solution) folder.

        const resolvedContext = DockerDebugConfigurationProvider.resolveFolderPath(context, folder);

        if (!await this.fsProvider.dirExists(resolvedContext)) {
            throw new Error(`The context folder '${resolvedContext}' does not exist. Ensure that the 'context' property is set correctly in the Docker debug configuration.`);
        }

        return resolvedContext;
    }

    private async inferDockerfile(folder: WorkspaceFolder, resolvedAppFolder: string, configuration: DockerDebugConfiguration): Promise<string> {
        let dockerfile = configuration && configuration.dockerBuild && configuration.dockerBuild.dockerfile
            ? configuration.dockerBuild.dockerfile
            : path.join(resolvedAppFolder, 'Dockerfile'); // CONSIDER: Omit dockerfile argument if not specified or possibly infer from context.

        dockerfile = DockerDebugConfigurationProvider.resolveFolderPath(dockerfile, folder);

        if (!await this.fsProvider.fileExists(dockerfile)) {
            throw new Error(`The Dockerfile '${dockerfile}' does not exist. Ensure that the 'dockerfile' property is set correctly in the Docker debug configuration.`);
        }

        return dockerfile;
    }

    private createLaunchBrowserConfiguration(result: LaunchResult): DebugConfigurationBrowserOptions {
        return result.browserUrl
            ? {
                enabled: true,
                args: result.browserUrl,
                windows: {
                    command: 'cmd.exe',
                    args: `/C start ${result.browserUrl}`
                },
                osx: {
                    command: 'open'
                },
                linux: {
                    command: 'xdg-open'
                }
            }
            : {
                enabled: false
            };
    }

    private createConfiguration(debugConfiguration: DockerDebugConfiguration, appFolder: string, result: LaunchResult): DebugConfiguration {
        const launchBrowser = this.createLaunchBrowserConfiguration(result);

        return {
            name: debugConfiguration.name,
            type: 'coreclr',
            request: 'launch',
            program: result.program,
            args: result.programArgs.join(' '),
            cwd: result.programCwd,
            launchBrowser,
            pipeTransport: {
                pipeCwd: result.pipeCwd,
                pipeProgram: result.pipeProgram,
                pipeArgs: result.pipeArgs,
                debuggerPath: result.debuggerPath,
                quoteArgs: false
            },
            preLaunchTask: debugConfiguration.preLaunchTask,
            sourceFileMap: {
                '/app/Views': path.join(appFolder, 'Views')
            }
        };
    }
}

export default DockerDebugConfigurationProvider;
