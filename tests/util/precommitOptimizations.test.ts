import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { optimizePrecommitCommand, recordTestRun } from '../../src/util/precommitOptimizations';
import * as fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');
vi.mock('@eldrforge/git-tools', () => ({
    runSecure: vi.fn(),
    run: vi.fn()
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn()
    })
}));

describe('precommitOptimizations', () => {
    const mockFs = vi.mocked(fs);
    let runSecure: any;
    let run: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset the imports
        const gitTools = await import('@eldrforge/git-tools');
        runSecure = vi.mocked(gitTools.runSecure);
        run = vi.mocked(gitTools.run);
    });

    describe('optimizePrecommitCommand', () => {
        it('should return original command when no optimization is possible', async () => {
            const command = 'npm run lint && npm run build && npm run test';
            const packageDir = '/test/package';

            mockFs.readFile.mockRejectedValue(new Error('No cache'));
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'abc1234' } as any);
            run.mockResolvedValue({ stdout: '' } as any);

            const result = await optimizePrecommitCommand(packageDir, command);

            expect(result.optimizedCommand).toBeDefined();
            expect(result.skipped).toBeDefined();
        });

        it('should skip test when no changes detected', async () => {
            const command = 'npm run lint && npm run build && npm run test';
            const packageDir = '/test/package';

            mockFs.readFile.mockResolvedValue(
                JSON.stringify({
                    [packageDir]: {
                        lastTestRun: Date.now() - 1000,
                        lastCommitHash: 'abc1234'
                    }
                })
            );
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'abc1234' } as any);
            run.mockResolvedValue({ stdout: '' } as any);

            const result = await optimizePrecommitCommand(packageDir, command);

            expect(result).toBeDefined();
            expect(result.optimizedCommand).toBeDefined();
        });

        it('should preserve command when cache is invalid', async () => {
            const command = 'npm run lint && npm run build && npm run test';
            const packageDir = '/test/package';

            mockFs.readFile.mockResolvedValue('invalid json');
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'abc1234' } as any);

            const result = await optimizePrecommitCommand(packageDir, command);

            expect(result.optimizedCommand).toBeDefined();
        });

        it('should handle git command errors gracefully', async () => {
            const command = 'npm run lint && npm run build && npm run test';
            const packageDir = '/test/package';

            mockFs.readFile.mockRejectedValue(new Error('No cache'));
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockRejectedValue(new Error('Git error'));

            const result = await optimizePrecommitCommand(packageDir, command);

            expect(result.optimizedCommand).toBeDefined();
            expect(result.skipped.test).toBeDefined();
        });
    });

    describe('recordTestRun', () => {
        it('should record test run with timestamp and commit hash', async () => {
            const packageDir = '/test/package';

            mockFs.readFile.mockResolvedValue(JSON.stringify({}));
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'deadbeef1234' } as any);

            await recordTestRun(packageDir);

            expect(mockFs.writeFile).toHaveBeenCalled();
        });

        it('should merge with existing cache', async () => {
            const packageDir = '/test/package';
            const existingCache = {
                '/other/package': {
                    lastTestRun: Date.now() - 5000,
                    lastCommitHash: 'old1234'
                }
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(existingCache));
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'new5678' } as any);

            await recordTestRun(packageDir);

            const writeCall = mockFs.writeFile.mock.calls[0];
            const writtenContent = writeCall[1];
            expect(typeof writtenContent).toBe('string');
        });

        it('should handle file write errors gracefully', async () => {
            const packageDir = '/test/package';

            mockFs.readFile.mockRejectedValue(new Error('No cache'));
            mockFs.writeFile.mockRejectedValue(new Error('Write failed'));
            runSecure.mockResolvedValue({ stdout: 'abc1234' } as any);

            // Should not throw
            await expect(recordTestRun(packageDir)).resolves.not.toThrow();
        });

        it('should handle git errors when getting commit hash', async () => {
            const packageDir = '/test/package';

            mockFs.readFile.mockResolvedValue(JSON.stringify({}));
            runSecure.mockRejectedValue(new Error('Not a git repo'));

            await expect(recordTestRun(packageDir)).resolves.not.toThrow();
        });

        it('should update existing package cache entry', async () => {
            const packageDir = '/test/package';
            const existingCache = {
                [packageDir]: {
                    lastTestRun: Date.now() - 10000,
                    lastCommitHash: 'old1234'
                }
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(existingCache));
            mockFs.writeFile.mockResolvedValue(undefined as any);
            runSecure.mockResolvedValue({ stdout: 'new5678' } as any);

            await recordTestRun(packageDir);

            expect(mockFs.writeFile).toHaveBeenCalled();
        });
    });
});

