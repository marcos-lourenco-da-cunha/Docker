/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the external face of extension.bundle.js, the main webpack bundle for the extension.
 * Anything needing to be exposed outside of the extension sources must be exported from here, because
 * everything else will be in private modules in extension.bundle.js.
 */

// Export activate/deactivate for main.js
export { activateInternal, deactivateInternal } from './src/extension';

// Exports for tests
// The tests are not packaged with the webpack bundle and therefore only have access to code exported from this file.
//
// The tests should import '../extension.bundle.ts'. At design-time they live in tests/ and so will pick up this file (extension.bundle.ts).
// At runtime the tests live in dist/tests and will therefore pick up the main webpack bundle at dist/extension.bundle.js.
export { AsyncPool } from './src/utils/asyncpool';
export { wrapError } from './src/utils/wrapError';
export { ext } from './src/extensionVariables';
export { nonNullProp } from './src/utils/nonNull';
export { IKeytar } from './src/utils/keytar';
export { throwDockerConnectionError, internal } from './explorer/utils/dockerConnectionError';
export { getImageLabel, trimWithElipsis } from './explorer/models/getImageLabel';
export { isWindows10RS3OrNewer, isWindows10RS4OrNewer, isWindows10RS5OrNewer } from "./src/utils/osVersion";
export { LineSplitter } from './src/debugging/coreclr/lineSplitter';
export { CommandLineBuilder } from './src/debugging/coreclr/commandLineBuilder';
export { DockerClient } from './src/debugging/coreclr/CliDockerClient';
export { LaunchOptions } from './src/debugging/coreclr/dockerManager';
export { DotNetClient } from './src/debugging/coreclr/CommandLineDotNetClient';
export { FileSystemProvider } from './src/debugging/coreclr/fsProvider';
export { OSProvider } from './src/debugging/coreclr/LocalOSProvider';
export { DockerDaemonIsLinuxPrerequisite, DockerfileExistsPrerequisite, DotNetSdkInstalledPrerequisite, LinuxUserInDockerGroupPrerequisite, MacNuGetFallbackFolderSharedPrerequisite } from './src/debugging/coreclr/prereqManager';
export { ProcessProvider } from './src/debugging/coreclr/ChildProcessProvider';
export { PlatformOS, Platform } from './src/utils/platform';
export { DockerBuildImageOptions } from "./src/debugging/coreclr/CliDockerClient";
export { compareBuildImageOptions } from "./src/debugging/coreclr/dockerManager";
export { configure, ConfigureApiOptions, ConfigureTelemetryProperties } from './src/configureWorkspace/configure';
export { globAsync } from './src/utils/globAsync';
export { httpsRequestBinary } from './src/utils/httpRequest';
export { DefaultTerminalProvider } from './src/utils/TerminalProvider';
export { docker } from './src/utils/docker-endpoint';
