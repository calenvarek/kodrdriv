import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { ParallelExecutionCheckpoint } from '../types/parallelExecution';
import { create as createStorage } from './storage';

const CHECKPOINT_VERSION = '1.0.0';

interface Lock {
    release: () => Promise<void>;
}

export class CheckpointManager {
    private checkpointPath: string;
    private lockPath: string;
    private tempPath: string;
    private logger = getLogger();
    private storage = createStorage({ log: this.logger.info });

    constructor(outputDirectory: string = process.cwd()) {
        this.checkpointPath = path.join(outputDirectory, '.kodrdriv-parallel-context.json');
        this.lockPath = `${this.checkpointPath}.lock`;
        this.tempPath = `${this.checkpointPath}.tmp`;
    }

    async save(checkpoint: ParallelExecutionCheckpoint): Promise<void> {
        const lock = await this.acquireLock();

        try {
            // Set version and timestamp
            checkpoint.version = CHECKPOINT_VERSION;
            checkpoint.lastUpdated = new Date().toISOString();

            // Validate before saving
            this.validateCheckpoint(checkpoint);

            // Write to temp file
            const serialized = JSON.stringify(checkpoint, null, 2);
            await fs.writeFile(this.tempPath, serialized, 'utf-8');

            // Atomic rename
            await fs.rename(this.tempPath, this.checkpointPath);

            this.logger.debug(`Checkpoint saved: ${this.checkpointPath}`);
        } finally {
            await lock.release();
        }
    }

    async load(): Promise<ParallelExecutionCheckpoint | null> {
        if (!await this.storage.exists(this.checkpointPath)) {
            return null;
        }

        const lock = await this.acquireLock();

        try {
            const content = await fs.readFile(this.checkpointPath, 'utf-8');
            const checkpoint = JSON.parse(content) as ParallelExecutionCheckpoint;

            // Validate
            this.validateCheckpoint(checkpoint);

            // Check version
            if (!this.isCompatibleVersion(checkpoint.version)) {
                throw new Error(`Incompatible checkpoint version: ${checkpoint.version}`);
            }

            return checkpoint;
        } catch (error: any) {
            this.logger.error(`Failed to load checkpoint: ${error.message}`);

            // Try backup
            const backup = await this.loadBackup();
            if (backup) {
                this.logger.info('Recovered from backup checkpoint');
                return backup;
            }

            return null;
        } finally {
            await lock.release();
        }
    }

    async backup(): Promise<void> {
        if (!await this.storage.exists(this.checkpointPath)) {
            return;
        }

        const backupPath = `${this.checkpointPath}.backup`;
        await fs.copyFile(this.checkpointPath, backupPath);
    }

    async cleanup(): Promise<void> {
        const files = [
            this.checkpointPath,
            this.lockPath,
            this.tempPath,
            `${this.checkpointPath}.backup`
        ];

        await Promise.all(
            files.map(file => fs.unlink(file).catch(() => {}))
        );
    }

    private async acquireLock(): Promise<Lock> {
        const maxWaitMs = 30000;
        const startTime = Date.now();

        while (true) {
            try {
                const fileHandle = await fs.open(this.lockPath, 'wx');
                try {
                    const pid = process.pid;
                    const timestamp = new Date().toISOString();
                    await fileHandle.writeFile(`${pid}\n${timestamp}`);
                } finally {
                    await fileHandle.close();
                }

                return {
                    release: async () => {
                        await fs.unlink(this.lockPath).catch(() => {});
                    }
                };
            } catch (error: any) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }

                const elapsed = Date.now() - startTime;
                if (elapsed > maxWaitMs) {
                    this.logger.warn('Breaking stale checkpoint lock');
                    await fs.unlink(this.lockPath).catch(() => {});
                    continue;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    private validateCheckpoint(checkpoint: ParallelExecutionCheckpoint): void {
        if (!checkpoint.executionId) {
            throw new Error('Invalid checkpoint: missing executionId');
        }

        if (!checkpoint.state) {
            throw new Error('Invalid checkpoint: missing state');
        }

        // Validate state consistency
        const allPackages = new Set([
            ...checkpoint.state.pending,
            ...checkpoint.state.ready,
            ...checkpoint.state.running.map(r => r.name),
            ...checkpoint.state.completed,
            ...checkpoint.state.failed.map(f => f.name),
            ...checkpoint.state.skipped
        ]);

        if (allPackages.size !== checkpoint.buildOrder.length) {
            this.logger.warn('Checkpoint state inconsistency detected');
        }
    }

    private isCompatibleVersion(version: string): boolean {
        // Simple major version check
        const [major] = version.split('.');
        const [expectedMajor] = CHECKPOINT_VERSION.split('.');
        return major === expectedMajor;
    }

    private async loadBackup(): Promise<ParallelExecutionCheckpoint | null> {
        const backupPath = `${this.checkpointPath}.backup`;
        if (!await this.storage.exists(backupPath)) {
            return null;
        }

        try {
            const content = await fs.readFile(backupPath, 'utf-8');
            return JSON.parse(content) as ParallelExecutionCheckpoint;
        } catch {
            return null;
        }
    }
}
