/**
 * Adapter for ai-service StorageAdapter using kodrdriv Storage
 */

import type { StorageAdapter } from '@eldrforge/ai-service';
import { createStorage } from '@eldrforge/shared';
import path from 'path';

/**
 * Create a StorageAdapter implementation using kodrdriv Storage
 *
 * @param outputDirectory - Directory where output files should be written (default: 'output')
 */
export function createStorageAdapter(outputDirectory: string = 'output'): StorageAdapter {
    const storage = createStorage();

    return {
        async writeOutput(fileName: string, content: string): Promise<void> {
            // Ensure output directory exists
            await storage.ensureDirectory(outputDirectory);

            // Write file to output directory
            const filePath = path.join(outputDirectory, fileName);
            await storage.writeFile(filePath, content, 'utf8');
        },

        async readTemp(fileName: string): Promise<string> {
            return await storage.readFile(fileName, 'utf8');
        },

        async writeTemp(fileName: string, content: string): Promise<void> {
            await storage.writeFile(fileName, content, 'utf8');
        },

        async readFile(fileName: string, encoding: string = 'utf8'): Promise<string> {
            return await storage.readFile(fileName, encoding);
        },
    };
}

