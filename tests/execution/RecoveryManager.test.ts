import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoveryManager, loadRecoveryManager } from '../../src/execution/RecoveryManager';
import { CheckpointManager } from '../../src/util/checkpointManager';
import { createMockGraph, createMockCheckpoint } from '../helpers/parallelMocks';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('RecoveryManager', () => {
    let testDir: string;
    let checkpointManager: CheckpointManager;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodrdriv-recovery-'));
        checkpointManager = new CheckpointManager(testDir);
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('markCompleted', () => {
        it('should mark single package as completed', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a', 'b', 'c'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['b']
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.markCompleted(['a']);

            const updated = manager.getCheckpoint();
            expect(updated.state.completed).toContain('a');
            expect(updated.state.pending).not.toContain('a');
            expect(updated.state.ready).toContain('b'); // b should now be ready
        });

        it('should mark multiple packages as completed', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a', 'b', 'c'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': ['a', 'b']
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.markCompleted(['a', 'b']);

            const updated = manager.getCheckpoint();
            expect(updated.state.completed).toContain('a');
            expect(updated.state.completed).toContain('b');
            expect(updated.state.ready).toContain('c'); // c should now be ready
        });

        it('should throw error for non-existent package', async () => {
            const checkpoint = createMockCheckpoint();
            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);

            await expect(manager.markCompleted(['nonexistent'])).rejects.toThrow('Package not found');
        });
    });

    describe('skipPackages', () => {
        it('should skip single package', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b'],
                state: {
                    pending: ['a', 'b'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.skipPackages(['a']);

            const updated = manager.getCheckpoint();
            expect(updated.state.skipped).toContain('a');
            expect(updated.state.pending).not.toContain('a');
        });

        it('should skip package and all dependents', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a', 'b', 'c'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['b']
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.skipPackages(['a']);

            const updated = manager.getCheckpoint();
            // a, b, and c should all be skipped (b and c depend on a)
            expect(updated.state.skipped).toContain('a');
            expect(updated.state.skipped).toContain('b');
            expect(updated.state.skipped).toContain('c');
        });
    });

    describe('retryFailed', () => {
        it('should retry retriable failed packages', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a'],
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'Network timeout',
                        isRetriable: true,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.retryFailed();

            const updated = manager.getCheckpoint();
            expect(updated.state.failed).toHaveLength(0);
            // Package 'a' should be in ready (no dependencies) or pending
            const isQueued = updated.state.pending.includes('a') || updated.state.ready.includes('a');
            expect(isQueued).toBe(true);
        });

        it('should not retry non-retriable failures by default', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a'],
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'Build failed',
                        isRetriable: false,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.retryFailed();

            const updated = manager.getCheckpoint();
            expect(updated.state.failed).toHaveLength(1); // Still failed
            expect(updated.state.pending).not.toContain('a');
        });

        it('should retry non-retriable with maxRetries override', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a'],
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'Build failed',
                        isRetriable: false,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.retryFailed({ maxRetries: 5 });

            const updated = manager.getCheckpoint();
            expect(updated.state.failed).toHaveLength(0);
            // Package 'a' should be in ready (no dependencies) or pending
            const isQueued = updated.state.pending.includes('a') || updated.state.ready.includes('a');
            expect(isQueued).toBe(true);
        });
    });

    describe('skipFailed', () => {
        it('should skip all failed packages', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b'],
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'Failed',
                        isRetriable: false,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: ['b']
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.skipFailed();

            const updated = manager.getCheckpoint();
            expect(updated.state.failed).toHaveLength(0);
            expect(updated.state.skipped).toContain('a');
            expect(updated.state.skipped).toContain('b'); // Dependent also skipped
        });
    });

    describe('resetPackage', () => {
        it('should reset package to initial state', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a'],
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: ['a'],
                    failed: [],
                    skipped: []
                },
                retryAttempts: { 'a': 3 },
                packageDurations: { 'a': 5000 }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.resetPackage('a');

            const updated = manager.getCheckpoint();
            expect(updated.state.pending).toContain('a');
            expect(updated.state.completed).not.toContain('a');
            expect(updated.retryAttempts['a']).toBeUndefined();
            expect(updated.packageDurations['a']).toBeUndefined();
        });
    });

    describe('validateState', () => {
        it('should validate correct state', () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a'],
                    ready: ['b'],
                    running: [],
                    completed: ['c'],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const result = manager.validateState();

            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should detect missing packages', () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const result = manager.validateState();

            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes('Missing packages'))).toBe(true);
        });

        it('should detect duplicate packages', () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b'],
                state: {
                    pending: ['a'],
                    ready: ['a'], // Duplicate!
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const result = manager.validateState();

            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes('multiple states'))).toBe(true);
        });
    });

    describe('generateRecoveryHints', () => {
        it('should suggest retry for retriable failures', () => {
            const checkpoint = createMockCheckpoint({
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'ETIMEDOUT',
                        isRetriable: true,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const hints = manager.generateRecoveryHints();

            expect(hints.some(h => h.message.includes('retriable errors'))).toBe(true);
            expect(hints.some(h => h.suggestedCommand?.includes('--retry-failed'))).toBe(true);
        });

        it('should suggest skip for permanent failures', () => {
            const checkpoint = createMockCheckpoint({
                state: {
                    pending: [],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [{
                        name: 'a',
                        error: 'Build failed',
                        isRetriable: false,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const hints = manager.generateRecoveryHints();

            expect(hints.some(h => h.message.includes('permanently'))).toBe(true);
            expect(hints.some(h => h.suggestedCommand?.includes('--skip-failed'))).toBe(true);
        });

        it('should warn about long-running packages', () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

            const checkpoint = createMockCheckpoint({
                state: {
                    pending: [],
                    ready: [],
                    running: [{
                        name: 'a',
                        startTime: twoHoursAgo,
                        elapsedTime: 0
                    }],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({ 'a': [] });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const hints = manager.generateRecoveryHints();

            expect(hints.some(h => h.message.includes('may be stuck'))).toBe(true);
        });
    });

    describe('showStatus', () => {
        it('should display comprehensive status', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a'],
                    ready: [],
                    running: [{
                        name: 'b',
                        startTime: new Date().toISOString(),
                        elapsedTime: 0
                    }],
                    completed: ['c'],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            const status = await manager.showStatus();

            expect(status).toContain('Parallel Execution Status');
            expect(status).toContain('Completed: 1/3');
            expect(status).toContain('Running:   1');
            expect(status).toContain('Pending:   1');
        });
    });

    describe('applyRecoveryOptions', () => {
        it('should apply multiple recovery options', async () => {
            const checkpoint = createMockCheckpoint({
                buildOrder: ['a', 'b', 'c'],
                state: {
                    pending: ['a', 'b', 'c'],
                    ready: [],
                    running: [],
                    completed: [],
                    failed: [],
                    skipped: []
                }
            });

            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': []
            });

            const manager = new RecoveryManager(checkpoint, graph, checkpointManager);
            await manager.applyRecoveryOptions({
                markCompleted: ['a'],
                skipPackages: ['b']
            });

            const updated = manager.getCheckpoint();
            expect(updated.state.completed).toContain('a');
            expect(updated.state.skipped).toContain('b');
        });
    });

    describe('loadRecoveryManager', () => {
        it('should load recovery manager from checkpoint', async () => {
            const checkpoint = createMockCheckpoint();
            const graph = createMockGraph({ 'a': [] });

            await checkpointManager.save(checkpoint);

            const manager = await loadRecoveryManager(graph, testDir);

            expect(manager).toBeTruthy();
            expect(manager!.getCheckpoint().executionId).toBe(checkpoint.executionId);
        });

        it('should return null when no checkpoint exists', async () => {
            const graph = createMockGraph({ 'a': [] });

            const manager = await loadRecoveryManager(graph, testDir);

            expect(manager).toBeNull();
        });
    });
});
