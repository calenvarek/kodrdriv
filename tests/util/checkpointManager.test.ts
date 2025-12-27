import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckpointManager } from '@eldrforge/tree-execution';
import { createMockCheckpoint } from '../helpers/parallelMocks';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createStorage } from '@eldrforge/shared';

describe('CheckpointManager', () => {
    let testDir: string;
    let manager: CheckpointManager;
    let storage: ReturnType<typeof createStorage>;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodrdriv-test-'));
        manager = new CheckpointManager(testDir);
        storage = createStorage();
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('save and load', () => {
        it('should save and load checkpoint', async () => {
            const checkpoint = createMockCheckpoint({
                executionId: 'test-123',
                buildOrder: ['pkg-a', 'pkg-b', 'pkg-c']
            });

            await manager.save(checkpoint);
            const loaded = await manager.load();

            expect(loaded).toBeTruthy();
            expect(loaded!.executionId).toBe('test-123');
            expect(loaded!.buildOrder).toEqual(['pkg-a', 'pkg-b', 'pkg-c']);
        });

        it('should return null when no checkpoint exists', async () => {
            const loaded = await manager.load();

            expect(loaded).toBeNull();
        });

        it('should update lastUpdated on save', async () => {
            const checkpoint = createMockCheckpoint();
            const originalUpdated = checkpoint.lastUpdated;

            // Wait a bit to ensure timestamp changes
            await new Promise(resolve => setTimeout(resolve, 10));

            await manager.save(checkpoint);
            const loaded = await manager.load();

            expect(loaded!.lastUpdated).not.toBe(originalUpdated);
        });
    });

    describe('backup and recovery', () => {
        it('should create backup', async () => {
            const checkpoint = createMockCheckpoint();

            await manager.save(checkpoint);
            await manager.backup();

            const backupPath = path.join(testDir, '.kodrdriv-parallel-context.json.backup');
            const exists = await storage.exists(backupPath);

            expect(exists).toBe(true);
        });

        it('should recover from backup on corruption', async () => {
            const checkpoint = createMockCheckpoint({
                executionId: 'backup-test'
            });

            await manager.save(checkpoint);
            await manager.backup();

            // Corrupt main checkpoint
            const checkpointPath = path.join(testDir, '.kodrdriv-parallel-context.json');
            await fs.writeFile(checkpointPath, 'invalid json');

            const loaded = await manager.load();

            expect(loaded).toBeTruthy();
            expect(loaded!.executionId).toBe('backup-test');
        });

        it('should handle missing backup gracefully', async () => {
            const checkpointPath = path.join(testDir, '.kodrdriv-parallel-context.json');
            await fs.writeFile(checkpointPath, 'invalid json');

            const loaded = await manager.load();

            expect(loaded).toBeNull();
        });
    });

    describe('cleanup', () => {
        it('should remove all checkpoint files', async () => {
            const checkpoint = createMockCheckpoint();

            await manager.save(checkpoint);
            await manager.backup();
            await manager.cleanup();

            const checkpointPath = path.join(testDir, '.kodrdriv-parallel-context.json');
            const backupPath = `${checkpointPath}.backup`;
            const lockPath = `${checkpointPath}.lock`;
            const tempPath = `${checkpointPath}.tmp`;

            const filesExist = await Promise.all([
                storage.exists(checkpointPath),
                storage.exists(backupPath),
                storage.exists(lockPath),
                storage.exists(tempPath)
            ]);

            expect(filesExist.every((exists: boolean) => !exists)).toBe(true);
        });

        it('should handle missing files gracefully', async () => {
            // Should not throw
            await expect(manager.cleanup()).resolves.not.toThrow();
        });
    });

    describe('file locking', () => {
        it('should handle concurrent saves', async () => {
            const checkpoint1 = createMockCheckpoint({ executionId: 'first' });
            const checkpoint2 = createMockCheckpoint({ executionId: 'second' });

            // Save both concurrently
            await Promise.all([
                manager.save(checkpoint1),
                manager.save(checkpoint2)
            ]);

            // Should have saved one of them successfully
            const loaded = await manager.load();
            expect(loaded).toBeTruthy();
            expect(['first', 'second']).toContain(loaded!.executionId);
        });
    });

    describe('validation', () => {
        it('should validate checkpoint on save', async () => {
            const invalidCheckpoint = createMockCheckpoint({
                executionId: '', // Invalid - empty
            });

            await expect(manager.save(invalidCheckpoint)).rejects.toThrow('missing executionId');
        });

        it('should validate checkpoint on load', async () => {
            // Manually create invalid checkpoint file
            const checkpointPath = path.join(testDir, '.kodrdriv-parallel-context.json');
            const invalid = {
                version: '1.0.0',
                // missing executionId
                state: {}
            };
            await fs.writeFile(checkpointPath, JSON.stringify(invalid, null, 2));

            const loaded = await manager.load();

            // Should return null due to validation failure
            expect(loaded).toBeNull();
        });

        it('should check version compatibility', async () => {
            const checkpoint = createMockCheckpoint();
            await manager.save(checkpoint);

            // Manually modify version to incompatible
            const checkpointPath = path.join(testDir, '.kodrdriv-parallel-context.json');
            const contentStr = await fs.readFile(checkpointPath, 'utf-8');
            const content = JSON.parse(contentStr);
            content.version = '2.0.0'; // Incompatible major version
            await fs.writeFile(checkpointPath, JSON.stringify(content, null, 2));

            const loaded = await manager.load();

            expect(loaded).toBeNull();
        });
    });
});
