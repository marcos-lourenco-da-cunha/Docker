/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Return a normalized string for the OS name specifically for Docker
 * @param os pre-normalized OS name
 * @returns normalized OS name
 */
export function getContainerOsString(os?: string): string {

    switch (os || 'Linux') {
        case 'Linux':
            return 'linux';
        case 'Windows':
            return 'windows';
        case 'Mac':
            return 'darwin';
    }

    return 'linux'; // should never happen
}
