/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fse from 'fs-extra';

export interface FileSystemProvider {
    dirExists(path: string): Promise<boolean>;
    fileExists(path: string): Promise<boolean>;
    hashFile(path: string): Promise<string>;
    makeDir(path: string): Promise<void>;
    readDir(path: string): Promise<string[]>;
    readFile(filename: string, encoding?: string): Promise<string>;
    unlinkFile(filename: string): Promise<void>;
    // tslint:disable-next-line:no-any
    writeFile(filename: string, data: any): Promise<void>;
}

export class LocalFileSystemProvider implements FileSystemProvider {
    public async dirExists(path: string): Promise<boolean> {
        try {
            const stats = await fse.stat(path);

            return stats.isDirectory();
        } catch (err) {
            // tslint:disable-next-line:no-unsafe-any
            if (err.code === "ENOENT") {
                return false;
            }

            throw err;
        }
    }

    public async fileExists(path: string): Promise<boolean> {
        try {
            const stats = await fse.stat(path);

            return stats.isFile();
        } catch (err) {
            // tslint:disable-next-line:no-unsafe-any
            if (err.code === "ENOENT") {
                return false;
            }

            throw err;
        }
    }

    public async hashFile(path: string): Promise<string> {
        const hash = crypto.createHash('sha256');

        const contents = await this.readFile(path);

        hash.update(contents);

        return hash.digest('hex');
    }

    public async makeDir(path: string): Promise<void> {
        return await fse.mkdir(path);
    }

    public async readDir(path: string): Promise<string[]> {
        return await fse.readdir(path);
    }

    public async readFile(filename: string, encoding?: string): Promise<string> {
        // NOTE: If encoding is specified, output is a string; if omitted, output is a Buffer.
        return (await (encoding ? fse.readFile(filename, encoding) : fse.readFile(filename))).toString();
    }

    public async unlinkFile(filename: string): Promise<void> {
        return await fse.unlink(filename);
    }

    // tslint:disable-next-line:no-any
    public async writeFile(filename: string, data: any): Promise<void> {
        return await fse.writeFile(filename, data);
    }
}
