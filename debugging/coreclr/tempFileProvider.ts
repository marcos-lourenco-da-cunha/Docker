/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import { OSProvider } from "./osProvider";
import { ProcessProvider } from './processProvider';

export interface TempFileProvider {
    getTempFilename(prefix?: string): string;
}

export class OSTempFileProvider implements TempFileProvider {
    private count: number = 1;

    constructor(
        private readonly osProvider: OSProvider,
        private readonly processProvider: ProcessProvider) {
    }

    public getTempFilename(prefix: string = 'temp'): string {
        return path.join(this.osProvider.tmpdir, `${prefix}_${new Date().valueOf()}_${this.processProvider.pid}_${this.count++}.tmp` );
    }
}
