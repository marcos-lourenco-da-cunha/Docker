/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccumulatorStream, ClientIdentity, GeneratorCommandResponse, IContainerOrchestratorClient, IContainersClient, isChildProcessError, Like, normalizeCommandResponseLike, PromiseCommandResponse, Shell, ShellStreamCommandRunnerFactory, ShellStreamCommandRunnerOptions, VoidCommandResponse } from '../docker';
import { ext } from '../../extensionVariables';
import { RuntimeManager } from '../RuntimeManager';
import { withDockerEnvSettings } from '../../utils/withDockerEnvSettings';

type ClientCallback<TClient, T> = (client: TClient) => Like<PromiseCommandResponse<T>>;
type VoidClientCallback<TClient> = (client: TClient) => Like<VoidCommandResponse>;
type StreamingClientCallback<TClient, T> = (client: TClient) => Like<GeneratorCommandResponse<T>>;

export async function runWithDefaultShellInternal<T>(callback: ClientCallback<IContainersClient, T>): Promise<T>;
export async function runWithDefaultShellInternal(callback: VoidClientCallback<IContainersClient>): Promise<void>;
export async function runWithDefaultShellInternal<T>(callback: ClientCallback<IContainersClient, T> | VoidClientCallback<IContainersClient>): Promise<T | void> {
    return await runWithDefaultShell(
        callback,
        ext.runtimeManager
    );
}

export async function streamWithDefaultShellInternal<T>(callback: StreamingClientCallback<IContainersClient, T>): Promise<AsyncGenerator<T>> {
    return await streamWithDefaultShell(
        callback,
        ext.runtimeManager
    );
}

export async function runOrchestratorWithDefaultShellInternal<T>(callback: ClientCallback<IContainerOrchestratorClient, T>): Promise<T>;
export async function runOrchestratorWithDefaultShellInternal(callback: VoidClientCallback<IContainerOrchestratorClient>): Promise<void>;
export async function runOrchestratorWithDefaultShellInternal<T>(callback: ClientCallback<IContainerOrchestratorClient, T> | VoidClientCallback<IContainerOrchestratorClient>): Promise<T | void> {
    return await runWithDefaultShell(
        callback,
        ext.orchestratorManager
    );
}

export async function streamOrchestratorWithDefaultShellInternal<T>(callback: StreamingClientCallback<IContainerOrchestratorClient, T>): Promise<AsyncGenerator<T>> {
    return await streamWithDefaultShell(
        callback,
        ext.orchestratorManager
    );
}


// 'env', 'shellProvider', 'stdErrPipe', and 'strict' are set by this function and thus should not be included as arguments to the additional options
type DefaultEnvShellStreamCommandRunnerOptions = Omit<ShellStreamCommandRunnerOptions, 'env' | 'shellProvider' | 'stdErrPipe' | 'strict'>;

export async function runWithDefaultShell<TClient extends ClientIdentity, T>(
    callback: ClientCallback<TClient, T> | VoidClientCallback<TClient>,
    runtimeManager: RuntimeManager<TClient>,
    additionalOptions?: DefaultEnvShellStreamCommandRunnerOptions
): Promise<T | void> {
    // Get a `DefaultEnvShellStreamCommandRunnerFactory`
    const factory = new DefaultEnvShellStreamCommandRunnerFactory(additionalOptions);

    // Get the active client
    const client: TClient = await runtimeManager.getClient();

    try {
        // Flatten the callback
        const response = await normalizeCommandResponseLike(callback(client));

        if (response.parse) {
            return await factory.getCommandRunner()(response as PromiseCommandResponse<T>);
        } else {
            await factory.getCommandRunner()(response as VoidCommandResponse);
        }
    } catch (err) {
        if (isChildProcessError(err)) {
            // If this is a child process error, alter the message to be the stderr output, if it isn't falsy
            const stdErr = await factory.errAccumulator.getString();
            err.message = stdErr || err.message;
        }

        throw err;
    } finally {
        factory.dispose();
    }
}

export async function streamWithDefaultShell<TClient extends ClientIdentity, T>(
    callback: StreamingClientCallback<TClient, T>,
    runtimeManager: RuntimeManager<TClient>,
    additionalOptions?: DefaultEnvShellStreamCommandRunnerOptions
): Promise<AsyncGenerator<T>> {
    // Get a `DefaultEnvShellStreamCommandRunnerFactory`
    const factory = new DefaultEnvShellStreamCommandRunnerFactory(additionalOptions);

    // Get the active client
    const client: TClient = await runtimeManager.getClient();

    try {
        return await factory.getStreamingCommandRunner()(
            callback(client)
        );
    } catch (err) {
        if (isChildProcessError(err)) {
            // If this is a child process error, alter the message to be the stderr output, if it isn't falsy
            const stdErr = await factory.errAccumulator.getString();
            err.message = stdErr || err.message;
        }

        throw err;
    } finally {
        factory.dispose();
    }
}

class DefaultEnvShellStreamCommandRunnerFactory<TOptions extends DefaultEnvShellStreamCommandRunnerOptions> extends ShellStreamCommandRunnerFactory<ShellStreamCommandRunnerOptions> implements vscode.Disposable {
    public readonly errAccumulator: AccumulatorStream;

    public constructor(options: TOptions) {
        const errAccumulator = new AccumulatorStream();

        super({
            ...options,
            strict: true,
            stdErrPipe: errAccumulator,
            shellProvider: Shell.getShellOrDefault(),
            env: withDockerEnvSettings(process.env),
        });

        this.errAccumulator = errAccumulator;
    }

    public dispose(): void {
        this.errAccumulator.destroy();
    }
}
