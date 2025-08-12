// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import crypto from 'crypto';
/**
 * This module exists to isolate filesystem operations from the rest of the codebase.
 * This makes testing easier by avoiding direct fs mocking in jest configuration.
 *
 * Additionally, abstracting storage operations allows for future flexibility -
 * this export utility may need to work with storage systems other than the local filesystem
 * (e.g. S3, Google Cloud Storage, etc).
 */

export interface Utility {
    exists: (path: string) => Promise<boolean>;
    isDirectory: (path: string) => Promise<boolean>;
    isFile: (path: string) => Promise<boolean>;
    isReadable: (path: string) => Promise<boolean>;
    isWritable: (path: string) => Promise<boolean>;
    isFileReadable: (path: string) => Promise<boolean>;
    isDirectoryWritable: (path: string) => Promise<boolean>;
    isDirectoryReadable: (path: string) => Promise<boolean>;
    createDirectory: (path: string) => Promise<void>;
    ensureDirectory: (path: string) => Promise<void>;
    readFile: (path: string, encoding: string) => Promise<string>;
    readStream: (path: string) => Promise<fs.ReadStream>;
    writeFile: (path: string, data: string | Buffer, encoding: string) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    forEachFileIn: (directory: string, callback: (path: string) => Promise<void>, options?: { pattern: string }) => Promise<void>;
    hashFile: (path: string, length: number) => Promise<string>;
    listFiles: (directory: string) => Promise<string[]>;
    removeDirectory: (path: string) => Promise<void>;
}

export const create = (params: { log?: (message: string, ...args: any[]) => void }): Utility => {

    // eslint-disable-next-line no-console
    const log = params.log || console.log;

    const exists = async (path: string): Promise<boolean> => {
        try {
            await fs.promises.stat(path);
            return true;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: any) {
            return false;
        }
    }

    const isDirectory = async (path: string): Promise<boolean> => {
        const stats = await fs.promises.stat(path);
        if (!stats.isDirectory()) {
            // Log at debug level since this is expected when scanning directories
            // that contain both files and directories
            return false;
        }
        return true;
    }

    const isFile = async (path: string): Promise<boolean> => {
        const stats = await fs.promises.stat(path);
        if (!stats.isFile()) {
            // Log removed since this is expected when checking file types
            return false;
        }
        return true;
    }

    const isReadable = async (path: string): Promise<boolean> => {
        try {
            await fs.promises.access(path, fs.constants.R_OK);
        } catch (error: any) {
            log(`${path} is not readable: %s %s`, error.message, error.stack);
            return false;
        }
        return true;
    }

    const isWritable = async (path: string): Promise<boolean> => {
        try {
            await fs.promises.access(path, fs.constants.W_OK);
        } catch (error: any) {
            log(`${path} is not writable: %s %s`, error.message, error.stack);
            return false;
        }
        return true;
    }

    const isFileReadable = async (path: string): Promise<boolean> => {
        return await exists(path) && await isFile(path) && await isReadable(path);
    }

    const isDirectoryWritable = async (path: string): Promise<boolean> => {
        return await exists(path) && await isDirectory(path) && await isWritable(path);
    }

    const isDirectoryReadable = async (path: string): Promise<boolean> => {
        return await exists(path) && await isDirectory(path) && await isReadable(path);
    }

    const createDirectory = async (path: string): Promise<void> => {
        try {
            await fs.promises.mkdir(path, { recursive: true });
        } catch (mkdirError: any) {
            throw new Error(`Failed to create output directory ${path}: ${mkdirError.message} ${mkdirError.stack}`);
        }
    }

    const ensureDirectory = async (path: string): Promise<void> => {
        if (!(await exists(path))) {
            // Before creating the directory, check if any parent directory is blocked by a file
            try {
                await fs.promises.mkdir(path, { recursive: true });
            } catch (mkdirError: any) {
                // If mkdir fails with ENOTDIR, it means a parent directory is actually a file
                if (mkdirError.code === 'ENOTDIR') {
                    // Find which parent directory is the problem
                    const pathParts = path.split('/').filter(p => p !== '');
                    let currentPath = '';
                    for (const part of pathParts) {
                        currentPath = currentPath ? `${currentPath}/${part}` : part;
                        if (await exists(currentPath) && !(await isDirectory(currentPath))) {
                            throw new Error(`Cannot create directory at ${path}: a file exists at ${currentPath} blocking the path`);
                        }
                    }
                }
                // Re-throw the original error if it's not the file-blocking-path issue or we couldn't find the blocking file
                throw new Error(`Failed to create output directory ${path}: ${mkdirError.message} ${mkdirError.stack}`);
            }
        } else {
            // Path exists, but we need to check if it's actually a directory
            if (!(await isDirectory(path))) {
                // Path exists but is not a directory (likely a file)
                throw new Error(`Cannot create directory at ${path}: a file already exists at this location`);
            }
            // If we reach here, the directory already exists, so nothing to do
        }
    }

    const removeDirectory = async (path: string): Promise<void> => {
        try {
            if (await exists(path)) {
                await fs.promises.rm(path, { recursive: true, force: true });
            }
        } catch (rmError: any) {
            throw new Error(`Failed to remove directory ${path}: ${rmError.message} ${rmError.stack}`);
        }
    }

    const readFile = async (path: string, encoding: string): Promise<string> => {
        return await fs.promises.readFile(path, { encoding: encoding as BufferEncoding });
    }

    const writeFile = async (path: string, data: string | Buffer, encoding: string): Promise<void> => {
        await fs.promises.writeFile(path, data, { encoding: encoding as BufferEncoding });
    }

    const rename = async (oldPath: string, newPath: string): Promise<void> => {
        await fs.promises.rename(oldPath, newPath);
    }

    const deleteFile = async (path: string): Promise<void> => {
        try {
            if (await exists(path)) {
                await fs.promises.unlink(path);
            }
        } catch (deleteError: any) {
            throw new Error(`Failed to delete file ${path}: ${deleteError.message} ${deleteError.stack}`);
        }
    }

    const forEachFileIn = async (directory: string, callback: (file: string) => Promise<void>, options: { pattern: string | string[] } = { pattern: '*.*' }): Promise<void> => {
        try {
            const files = await glob(options.pattern, { cwd: directory, nodir: true });
            for (const file of files) {
                await callback(path.join(directory, file));
            }
        } catch (err: any) {
            throw new Error(`Failed to glob pattern ${options.pattern} in ${directory}: ${err.message}`);
        }
    }

    const readStream = async (path: string): Promise<fs.ReadStream> => {
        return fs.createReadStream(path);
    }

    const hashFile = async (path: string, length: number): Promise<string> => {
        const file = await readFile(path, 'utf8');
        return crypto.createHash('sha256').update(file).digest('hex').slice(0, length);
    }

    const listFiles = async (directory: string): Promise<string[]> => {
        return await fs.promises.readdir(directory);
    }

    return {
        exists,
        isDirectory,
        isFile,
        isReadable,
        isWritable,
        isFileReadable,
        isDirectoryWritable,
        isDirectoryReadable,
        createDirectory,
        ensureDirectory,
        readFile,
        readStream,
        writeFile,
        rename,
        deleteFile,
        forEachFileIn,
        hashFile,
        listFiles,
        removeDirectory,
    };
}
