import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../logging';

export interface ParallelPublishConfig {
    maxConcurrency?: number;
    autoSync?: boolean;
    autoRebase?: boolean;
    autoForceWithLease?: boolean;
    failFast?: boolean;
    checkpoints?: boolean;
    notifications?: boolean;
}

export interface RecoveryConfig {
    maxRetries?: number;
    retryDelay?: number;
    autoRecoverableErrors?: string[];
}

export interface NpmConfig {
    registryPropagationDelay?: number;
    verifyPublished?: boolean;
}

export interface KodrdrivConfig {
    parallel?: ParallelPublishConfig;
    recovery?: RecoveryConfig;
    npm?: NpmConfig;
}

const CONFIG_FILES = ['.kodrdrivrc.json', '.kodrdrivrc', 'kodrdriv.config.json'];

/**
 * Load configuration from file
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<KodrdrivConfig | null> {
    const logger = getLogger();

    for (const filename of CONFIG_FILES) {
        const configPath = path.join(cwd, filename);

        try {
            const content = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(content) as KodrdrivConfig;
            logger.verbose(`Loaded configuration from ${configPath}`);
            return config;
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                logger.warn(`Failed to load config from ${configPath}: ${error.message}`);
            }
        }
    }

    logger.verbose('No configuration file found, using defaults');
    return null;
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): KodrdrivConfig {
    return {
        parallel: {
            maxConcurrency: 8,
            autoSync: false,
            autoRebase: false,
            autoForceWithLease: true,
            failFast: false,
            checkpoints: false,
            notifications: false,
        },
        recovery: {
            maxRetries: 3,
            retryDelay: 5000,
            autoRecoverableErrors: [
                'dist-cleanup-failed',
                'pr-already-exists',
                'branch-out-of-sync',
            ],
        },
        npm: {
            registryPropagationDelay: 10000,
            verifyPublished: true,
        },
    };
}

/**
 * Merge loaded config with defaults
 */
export function mergeWithDefaults(config: KodrdrivConfig | null): KodrdrivConfig {
    const defaults = getDefaultConfig();

    if (!config) {
        return defaults;
    }

    return {
        parallel: { ...defaults.parallel, ...config.parallel },
        recovery: { ...defaults.recovery, ...config.recovery },
        npm: { ...defaults.npm, ...config.npm },
    };
}

/**
 * Get effective configuration (loaded + defaults)
 */
export async function getEffectiveConfig(cwd: string = process.cwd()): Promise<KodrdrivConfig> {
    const loaded = await loadConfig(cwd);
    return mergeWithDefaults(loaded);
}

/**
 * Create a sample configuration file
 */
export function createSampleConfig(): string {
    const config: KodrdrivConfig = {
        parallel: {
            maxConcurrency: 8,
            autoSync: true,
            autoRebase: false,
            autoForceWithLease: true,
            failFast: false,
            checkpoints: false,
            notifications: true,
        },
        recovery: {
            maxRetries: 3,
            retryDelay: 5000,
            autoRecoverableErrors: [
                'dist-cleanup-failed',
                'pr-already-exists',
                'branch-out-of-sync',
            ],
        },
        npm: {
            registryPropagationDelay: 10000,
            verifyPublished: true,
        },
    };

    return JSON.stringify(config, null, 2);
}

/**
 * Save sample configuration to file
 */
export async function saveSampleConfig(cwd: string = process.cwd()): Promise<string> {
    const logger = getLogger();
    const configPath = path.join(cwd, '.kodrdrivrc.json');

    try {
        // Check if file already exists
        await fs.access(configPath);
        throw new Error(`Configuration file already exists: ${configPath}`);
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const sampleConfig = createSampleConfig();
    await fs.writeFile(configPath, sampleConfig, 'utf-8');
    logger.info(`✅ Created sample configuration: ${configPath}`);

    return configPath;
}

