/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextManager } from './ContextManager';
import { RuntimeManager } from './RuntimeManager';

export class ContainerRuntimeManager extends RuntimeManager {
    public readonly contextManager: ContextManager = new ContextManager();
    public readonly onContainerRuntimeClientRegistered = this.runtimeClientRegisteredEmitter.event;
}
