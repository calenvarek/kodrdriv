import fs from 'fs/promises';
import { getLogger } from '../logging';
import { run } from '@eldrforge/git-tools';

export interface CleanupOptions {
    maxRetries?: number;
    retryDelay?: number;
    moveToBackup?: boolean;
}

/**
 * Robustly clean a directory with retries and fallback strategies
 */
export async function cleanDirectory(
    dirPath: string,
    options: CleanupOptions = {}
): Promise<{ success: boolean; movedToBackup?: string; error?: string }> {
    const logger = getLogger();
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 100;
    const moveToBackup = options.moveToBackup ?? true;

    logger.verbose(`Attempting to clean directory: ${dirPath}`);

    // Try direct deletion with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 2 });
            logger.verbose(`✅ Successfully cleaned ${dirPath}`);
            return { success: true };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // Directory doesn't exist, that's fine
                logger.verbose(`Directory ${dirPath} does not exist, nothing to clean`);
                return { success: true };
            }

            logger.verbose(`Attempt ${attempt}/${maxRetries} to clean ${dirPath} failed: ${error.message}`);

            if (attempt < maxRetries) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
        }
    }

    // If we get here, direct deletion failed. Try moving to backup if enabled
    if (moveToBackup) {
        try {
            const backup = `${dirPath}.backup.${Date.now()}`;
            logger.verbose(`Attempting to move ${dirPath} to ${backup}...`);
            await fs.rename(dirPath, backup);
            logger.warn(`⚠️  Could not delete ${dirPath}, moved to ${backup}`);
            logger.warn(`   You may want to clean this up manually later`);
            return { success: true, movedToBackup: backup };
        } catch (moveError: any) {
            logger.error(`❌ Failed to delete or move ${dirPath}: ${moveError.message}`);
            return { success: false, error: moveError.message };
        }
    }

    return { success: false, error: 'Failed to clean directory after retries' };
}

/**
 * Check for processes using a directory (Unix-like systems only)
 */
export async function checkProcessesUsingDirectory(dirPath: string): Promise<string[]> {
    const logger = getLogger();

    try {
        // This only works on Unix-like systems
        if (process.platform === 'win32') {
            logger.verbose('Process detection not available on Windows');
            return [];
        }

        const { stdout } = await run(`lsof +D ${dirPath} 2>/dev/null || true`);

        if (stdout.trim()) {
            const lines = stdout.trim().split('\n').slice(1); // Skip header
            logger.verbose(`Found ${lines.length} process(es) using ${dirPath}`);
            return lines;
        }

        return [];
    } catch (error: any) {
        // lsof might not be available or might fail, that's okay
        logger.verbose(`Could not check for processes using ${dirPath}: ${error.message}`);
        return [];
    }
}

/**
 * Clean dist directory with enhanced error handling and recovery
 */
export async function cleanDist(options: CleanupOptions = {}): Promise<void> {
    const logger = getLogger();
    const distPath = 'dist';

    logger.info(`🧹 Cleaning ${distPath} directory...`);

    // Check for processes using the directory
    const processes = await checkProcessesUsingDirectory(distPath);
    if (processes.length > 0) {
        logger.warn(`⚠️  Found ${processes.length} process(es) using ${distPath}:`);
        processes.slice(0, 5).forEach(proc => logger.warn(`   ${proc}`));
        if (processes.length > 5) {
            logger.warn(`   ... and ${processes.length - 5} more`);
        }
        logger.warn(`   These processes may interfere with cleanup`);
    }

    const result = await cleanDirectory(distPath, options);

    if (!result.success) {
        throw new Error(`Failed to clean ${distPath}: ${result.error}`);
    }

    if (result.movedToBackup) {
        logger.info(`✅ Cleaned ${distPath} (moved old directory to ${result.movedToBackup})`);
    } else {
        logger.info(`✅ Cleaned ${distPath}`);
    }
}

