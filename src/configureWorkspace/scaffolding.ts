/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { IActionContext, IAzureQuickPickItem, } from "vscode-azureextensionui";
import { ext } from "../extensionVariables";
import { captureCancelStep } from '../utils/captureCancelStep';
import { Platform, PlatformOS } from "../utils/platform";
import { quickPickWorkspaceFolder } from '../utils/quickPickWorkspaceFolder';
import { ConfigureTelemetryCancelStep, ConfigureTelemetryProperties, promptForPorts as promptForPortsUtil, quickPickOS } from './configUtils';

/**
 * Represents the options that can be passed by callers (e.g. the programmatic scaffolding API used by IoT extension).
 */
export interface ScaffoldContext extends IActionContext {
    folder?: vscode.WorkspaceFolder;
    initializeForDebugging?: boolean;
    os?: PlatformOS;
    outputFolder?: string;
    platform?: Platform;
    ports?: number[];
    rootFolder?: string;
}

/**
 * Represents the context passed to individual scaffolders, with suitable defaults for critical properties.
 */
export interface ScaffolderContext extends ScaffoldContext {
    captureStep<TReturn, TPrompt extends (...args: []) => Promise<TReturn>>(step: ConfigureTelemetryCancelStep, prompt: TPrompt): TPrompt;
    folder: vscode.WorkspaceFolder;
    initializeForDebugging: boolean;
    platform: Platform;
    promptForOS(): Promise<PlatformOS>;
    promptForPorts(defaultPorts?: number[]): Promise<number[]>;
    rootFolder: string;
}

export type ScaffoldedFile = {
    filePath: string;
    open?: boolean;
};

export type ScaffoldFile = {
    contents: string;
    fileName: string;
    open?: boolean;
};

export type Scaffolder = (context: ScaffolderContext) => Promise<ScaffoldFile[]>;

async function promptForFolder(): Promise<vscode.WorkspaceFolder> {
    return await quickPickWorkspaceFolder('To generate Docker files you must first open a folder or workspace in VS Code.');
}

async function promptForOS(): Promise<PlatformOS> {
    return await quickPickOS();
}

async function promptForOverwrite(fileName: string): Promise<boolean> {
    const YES_PROMPT: vscode.MessageItem = {
        title: 'Yes',
        isCloseAffordance: false
    };
    const YES_OR_NO_PROMPTS: vscode.MessageItem[] = [
        YES_PROMPT,
        {
            title: 'No',
            isCloseAffordance: true
        }
    ];

    const response = await vscode.window.showErrorMessage(`"${fileName}" already exists. Would you like to overwrite it?`, ...YES_OR_NO_PROMPTS);

    return response === YES_PROMPT;
}

async function promptForPorts(defaultPorts?: number[]): Promise<number[]> {
    return await promptForPortsUtil(defaultPorts);
}

const scaffolders: Map<Platform, Scaffolder> = new Map<Platform, Scaffolder>();

async function promptForPlatform(): Promise<Platform> {
    let opt: vscode.QuickPickOptions = {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Select Application Platform'
    }

    const items = Array.from(scaffolders.keys()).map(p => <IAzureQuickPickItem<Platform>>{ label: p, data: p });
    let response = await ext.ui.showQuickPick(items, opt);
    return response.data;
}

export function registerScaffolder(platform: Platform, scaffolder: Scaffolder): void {
    scaffolders.set(platform, scaffolder);
}

export async function scaffold(context: ScaffoldContext): Promise<ScaffoldedFile[]> {
    function captureStep<TReturn, TPrompt extends (...args: []) => Promise<TReturn>>(step: ConfigureTelemetryCancelStep, prompt: TPrompt): TPrompt {
        return captureCancelStep(step, context.telemetry.properties, prompt);
    }

    let folder: vscode.WorkspaceFolder;

    try {
        folder = context.folder ?? await captureStep('folder', promptForFolder)();
    } catch (err) {
        // Suppress reporting issues due to high volume
        context.errorHandling.suppressReportIssue = true;
        throw err;
    }

    const rootFolder = context.rootFolder ?? folder.uri.fsPath;
    const telemetryProperties = <ConfigureTelemetryProperties>context.telemetry.properties;

    const platform = context.platform ?? await captureStep('platform', promptForPlatform)();

    telemetryProperties.configurePlatform = platform;

    const scaffolder = scaffolders.get(platform);

    if (!scaffolder) {
        throw new Error(`No scaffolder is registered for platform '${context.platform}'.`);
    }

    telemetryProperties.orchestration = 'single';

    // Invoke the individual scaffolder, passing a copy of the original context, with omitted properies given suitable defaults...
    const files = await scaffolder({
        ...context,
        captureStep,
        folder,
        initializeForDebugging: context.initializeForDebugging === undefined || context.initializeForDebugging,
        platform,
        promptForOS: captureStep('os', promptForOS),
        promptForPorts: captureStep('port', promptForPorts),
        rootFolder
    });

    const writtenFiles: ScaffoldedFile[] = [];

    await Promise.all(
        files.map(
            async file => {
                const filePath = path.resolve(rootFolder, file.fileName);

                if (await fse.pathExists(filePath) === false || await promptForOverwrite(file.fileName)) {
                    await fse.writeFile(filePath, file.contents, 'utf8');

                    writtenFiles.push({ filePath, open: file.open });
                }
            }));

    return writtenFiles;
}
