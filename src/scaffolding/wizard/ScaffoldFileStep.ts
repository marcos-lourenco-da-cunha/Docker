/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import Handlebars = require('handlebars');
import * as path from 'path';
import * as vscode from 'vscode';
import { MessageItem, Progress } from 'vscode';
import { AzureWizardExecuteStep, DialogResponses, UserCancelledError } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { pathNormalize } from '../../utils/pathNormalize';
import { PlatformOS } from '../../utils/platform';
import { ScaffoldedFileType, ScaffoldingWizardContext } from './ScaffoldingWizardContext';

Handlebars.registerHelper('workspaceRelative', (wizardContext: ScaffoldingWizardContext, absolutePath: string, platform: PlatformOS = 'Linux') => {
    const workspaceFolder: vscode.WorkspaceFolder = wizardContext.workspaceFolder;

    return pathNormalize(
        path.relative(workspaceFolder.uri.fsPath, absolutePath),
        platform
    );
});

Handlebars.registerHelper('eq', (a: string, b: string) => {
    return a === b;
});

Handlebars.registerHelper('basename', (a: string) => {
    return path.basename(a);
});

Handlebars.registerHelper('dirname', (a: string, platform: PlatformOS = 'Linux') => {
    return pathNormalize(
        path.dirname(a),
        platform
    );
});

Handlebars.registerHelper('toQuotedArray', (arr: string[]) => {
    return `[${arr.map(a => `"${a}"`).join(', ')}]`;
});

Handlebars.registerHelper('isRootPort', (ports: number[]) => {
    return ports?.some(p => p < 1024);
});

Handlebars.registerHelper('join', (a: never[] | undefined, b: never[] | undefined) => {
    if (!a) {
        return b;
    } else if (!b) {
        return a;
    } else {
        return a.concat(b);
    }
});

export class ScaffoldFileStep<TWizardContext extends ScaffoldingWizardContext> extends AzureWizardExecuteStep<TWizardContext> {
    public constructor(private readonly fileType: ScaffoldedFileType, public readonly priority: number) {
        super();
    }

    public async execute(wizardContext: TWizardContext, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('vscode-docker.scaffold.scaffoldFileStep.progress', 'Creating \'{0}\'...', this.fileType) });

        const inputPath = await this.getInputPath(wizardContext);

        if (!inputPath) {
            // If there's no template, skip
            return;
        }

        const outputPath = await this.getOutputPath(wizardContext);

        const input = await fse.readFile(inputPath, 'utf-8');
        const template = Handlebars.compile(input);

        const output = template(wizardContext);

        await this.promptForOverwriteIfNeeded(wizardContext, output, outputPath);

        await fse.writeFile(outputPath, output, { encoding: 'utf-8' });
    }

    public shouldExecute(wizardContext: TWizardContext): boolean {
        // If this step is created it always need to be executed
        return true;
    }

    private async getInputPath(wizardContext: TWizardContext): Promise<string> {
        const config = vscode.workspace.getConfiguration('docker');
        const settingsTemplatesPath = config.get<string | undefined>('scaffolding.templatePath', undefined);
        const defaultTemplatesPath = path.join(ext.context.asAbsolutePath('resources'), 'templates');

        let subPath: string;
        switch (wizardContext.platform) {
            case 'Node.js':
                subPath = path.join('node', `${this.fileType}.template`);
                break;
            case '.NET: ASP.NET Core':
            case '.NET: Core Console':
                subPath = path.join('netCore', `${this.fileType}.template`);
                break;
            case 'Python: Django':
            case 'Python: Flask':
            case 'Python: General':
                subPath = path.join('python', `${this.fileType}.template`);
                break;
            case 'Java':
                subPath = path.join('java', `${this.fileType}.template`);
                break;
            case 'C++':
                subPath = path.join('cpp', `${this.fileType}.template`);
                break;
            case 'Go':
                subPath = path.join('go', `${this.fileType}.template`);
                break;
            case 'Ruby':
                subPath = path.join('ruby', `${this.fileType}.template`);
                break;
            case 'Other':
                subPath = path.join('other', `${this.fileType}.template`);
                break;
            default:
                throw new Error(localize('vscode-docker.scaffold.scaffoldFileStep.unknownPlatform', 'Unknown platform \'{0}\'', wizardContext.platform));
        }

        return (settingsTemplatesPath && await this.scanUpwardForFile(path.join(settingsTemplatesPath, subPath))) ||
            await this.scanUpwardForFile(path.join(defaultTemplatesPath, subPath));
    }

    private async scanUpwardForFile(file: string, maxDepth: number = 1): Promise<string> {
        const fileName = path.basename(file);
        let currentFile = file;

        for (let i = 0; i <= maxDepth; i++) {
            if (await fse.pathExists(currentFile)) {
                return currentFile;
            }

            const parentDir = path.resolve(path.join(path.dirname(currentFile), '..'));

            currentFile = path.join(parentDir, fileName);
        }

        return undefined;
    }

    private async getOutputPath(wizardContext: TWizardContext): Promise<string> {
        if (this.fileType === 'Dockerfile' && wizardContext.artifact &&
            (wizardContext.platform === 'Node.js' || wizardContext.platform === '.NET: ASP.NET Core' || wizardContext.platform === '.NET: Core Console')) {
            // Dockerfiles may be placed in subpaths for Node and .NET; the others are always at the workspace folder level
            return path.join(path.dirname(wizardContext.artifact), this.fileType);
        } else {
            return path.join(wizardContext.workspaceFolder.uri.fsPath, this.fileType);
        }
    }

    private async promptForOverwriteIfNeeded(wizardContext: TWizardContext, output: string, outputPath: string): Promise<void> {
        if (wizardContext.overwriteAll) {
            // If overwriteAll is set, no need to prompt
            return;
        } else if (!(await fse.pathExists(outputPath))) {
            // If the output file does not exist, no need to prompt
            return;
        } else {
            const existingContents = await fse.readFile(outputPath, 'utf-8');

            if (output === existingContents) {
                // If the output contents are identical, no need to prompt
                return;
            }
        }

        // Otherwise, prompt
        const prompt = localize('vscode-docker.scaffold.scaffoldFileStep.prompt', 'Do you want to overwrite \'{0}\'?', this.fileType);
        const overwrite: MessageItem = {
            title: localize('vscode-docker.scaffold.scaffoldFileStep.overwrite', 'Overwrite')
        };
        const overwriteAll: MessageItem = {
            title: localize('vscode-docker.scaffold.scaffoldFileStep.overwriteAll', 'Overwrite All')
        };

        const response = await ext.ui.showWarningMessage(prompt, overwriteAll, overwrite, DialogResponses.cancel);

        // Throw if the response is Cancel (Escape / X will throw above)
        if (response === DialogResponses.cancel) {
            throw new UserCancelledError();
        } else if (response === overwriteAll) {
            wizardContext.overwriteAll = true;
        }
    }
}
