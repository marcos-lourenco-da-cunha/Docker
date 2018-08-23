/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, OutputChannel, Terminal } from "vscode";
import { IAzureUserInput, ITelemetryReporter } from "vscode-azureextensionui";
import { ITerminalProvider } from "./commands/utils/TerminalProvider";
import { IKeytar } from './utils/keytar';

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: OutputChannel;
    export let ui: IAzureUserInput;
    export let reporter: ITelemetryReporter;
    export let terminalProvider: ITerminalProvider;
    export let keytar: IKeytar | undefined;
}
