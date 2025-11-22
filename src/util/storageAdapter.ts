/**
 * Adapter for ai-service StorageAdapter using kodrdriv Storage
 */

import type { StorageAdapter } from '@eldrforge/ai-service';
import * as Storage from './storage';
import { getLogger } from '../logging';

const logger = getLogger();

/**
 * Create a StorageAdapter implementation using kodrdriv Storage
 */
export function createStorageAdapter(): StorageAdapter {
    const storage = Storage.create({ log: logger.debug });

    return {
        async writeOutput(fileName: string, content: string): Promise<void> {
            await storage.writeFile(fileName, content, 'utf8');
        },

        async readTemp(fileName: string): Promise<string> {
            return await storage.readFile(fileName, 'utf8');
        },

        async writeTemp(fileName: string, content: string): Promise<void> {
            await storage.writeFile(fileName, content, 'utf8');
        },
    };
}

