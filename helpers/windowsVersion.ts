/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { ext } from '../extensionVariables';

// Minimum Windows RS3 version number
const windows10RS3MinVersion = '10.0.16299';

// Minimum Windows RS4 version number
const windows10RS4MinVersion = '10.0.17134';

export function isWindows(): boolean {
    return ext.os.platform === 'win32';
}

export function isWindows10RS4OrNewer(): boolean {
    if (!isWindows()) {
        return false;
    }

    return semver.gte(ext.os.release, windows10RS4MinVersion);
}

export function isWindows10RS3OrNewer(): boolean {
    if (!isWindows()) {
        return false;
    }

    return semver.gte(ext.os.release, windows10RS3MinVersion);
}
