import { describe, it, beforeEach, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock dependencies
vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn()
    }))
}));

vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn()
}));

import { execute } from '../../src/commands/updates';
import { getDryRunLogger } from '../../src/logging';
import { run } from '@eldrforge/git-tools';
import type { Config } from '../../src/types';

describe('updates command', () => {
    let mockRun: Mock;
    let mockLogger: any;

    beforeEach(() => {
        // Clear all mocks
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn()
        };

        (getDryRunLogger as Mock).mockReturnValue(mockLogger);
        mockRun = vi.mocked(run);
    });

    const createBaseConfig = (overrides: Partial<Config> = {}): Config => ({
        configDirectory: '/test/config',
        discoveredConfigDirs: ['/test/config'],
        resolvedConfigDirs: ['/test/config'],
        ...overrides
    });

    describe('npm install after updates', () => {
        it('should run npm install after npm-check-updates when updates are found', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            // Mock npm-check-updates output indicating updates were made
            mockRun
                .mockResolvedValueOnce({
                    stdout: 'Upgrading /path/to/package.json\n @fjell/core ^4.4.58 → ^4.4.59\nRun npm install to install new versions.',
                    stderr: ''
                })
                // Mock npm install
                .mockResolvedValueOnce({
                    stdout: 'added 1 package, removed 1 package, and audited 100 packages',
                    stderr: ''
                });

            await execute(config);

            // Should have called npm-check-updates
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('npm-check-updates'));
            // Should have called npm install
            expect(mockRun).toHaveBeenCalledWith('npm install');
            // Should have been called twice total
            expect(mockRun).toHaveBeenCalledTimes(2);
        });

        it('should NOT run npm install when no updates are found', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            // Mock npm-check-updates output indicating no updates
            mockRun.mockResolvedValueOnce({
                stdout: 'Upgrading /path/to/package.json\nAll dependencies match the latest package versions :)',
                stderr: ''
            });

            await execute(config);

            // Should have called npm-check-updates
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('npm-check-updates'));
            // Should NOT have called npm install (no updates)
            expect(mockRun).not.toHaveBeenCalledWith('npm install');
            // Should have been called only once
            expect(mockRun).toHaveBeenCalledTimes(1);
        });

        it('should throw error if npm install fails after updates', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            // Mock npm-check-updates success with updates
            mockRun
                .mockResolvedValueOnce({
                    stdout: 'Upgrading /path/to/package.json\n @fjell/core ^4.4.58 → ^4.4.59',
                    stderr: ''
                })
                // Mock npm install failure
                .mockRejectedValueOnce(new Error('npm install failed: ERESOLVE'));

            await expect(execute(config)).rejects.toThrow('Failed to update lock file after dependency updates');
        });

        it('should handle dry run mode without running npm install', async () => {
            const config = createBaseConfig({
                dryRun: true,
                updates: {
                    scope: '@fjell'
                }
            });

            await execute(config);

            // Should NOT have called npm-check-updates or npm install in dry run
            expect(mockRun).not.toHaveBeenCalled();
            // Should have logged what would be run
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Would run'));
            expect(mockLogger.info).toHaveBeenCalledWith('Would run: npm install');
        });
    });

    describe('scope validation', () => {
        it('should require scope parameter', async () => {
            const config = createBaseConfig({
                updates: {}
            });

            await expect(execute(config)).rejects.toThrow('Scope parameter is required');
        });

        it('should require scope to start with @', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: 'fjell'  // Missing @
                }
            });

            await expect(execute(config)).rejects.toThrow('Invalid scope "fjell". Scope must start with @');
        });

        it('should accept valid scopes', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            mockRun.mockResolvedValueOnce({
                stdout: 'All dependencies match the latest package versions :)',
                stderr: ''
            });

            await execute(config);

            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('/^@fjell//'));
        });
    });

    describe('output handling', () => {
        it('should log npm-check-updates stdout', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            mockRun.mockResolvedValueOnce({
                stdout: 'Upgrading /path/to/package.json\n @fjell/core ^4.4.58 → ^4.4.59',
                stderr: ''
            }).mockResolvedValueOnce({
                stdout: 'npm install success',
                stderr: ''
            });

            await execute(config);

            expect(mockLogger.info).toHaveBeenCalledWith('✅ npm-check-updates output:');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('@fjell/core'));
        });

        it('should log npm-check-updates stderr as warnings', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            mockRun.mockResolvedValueOnce({
                stdout: 'All dependencies match the latest package versions :)',
                stderr: 'Some warning message'
            });

            await execute(config);

            expect(mockLogger.info).toHaveBeenCalledWith('⚠️  npm-check-updates warnings:');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Some warning message'));
        });

        it('should log npm install output as verbose', async () => {
            const config = createBaseConfig({
                updates: {
                    scope: '@fjell'
                }
            });

            mockRun
                .mockResolvedValueOnce({
                    stdout: '@fjell/core ^4.4.58 → ^4.4.59',
                    stderr: ''
                })
                .mockResolvedValueOnce({
                    stdout: 'added 1 package\naudited 100 packages',
                    stderr: ''
                });

            await execute(config);

            expect(mockLogger.verbose).toHaveBeenCalledWith('npm install output:');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('added 1 package'));
        });
    });
});

