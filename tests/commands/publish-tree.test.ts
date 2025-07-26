import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock all dependencies
vi.mock('fs/promises', () => ({
    default: {
        readdir: vi.fn(),
        access: vi.fn()
    },
    readdir: vi.fn(),
    access: vi.fn()
}));

vi.mock('path', () => ({
    default: {
        join: vi.fn((...paths) => paths.join('/')),
        dirname: vi.fn((path) => {
            const parts = path.split('/');
            return parts.slice(0, -1).join('/') || '/';
        }),
        basename: vi.fn((path) => path.split('/').pop() || ''),
        relative: vi.fn((from, to) => {
            // Simple relative path calculation for mocking
            if (to.startsWith(from)) {
                return to.substring(from.length + 1);
            }
            return to;
        })
    },
    join: vi.fn((...paths) => paths.join('/')),
    dirname: vi.fn((path) => {
        const parts = path.split('/');
        return parts.slice(0, -1).join('/') || '/';
    }),
    basename: vi.fn((path) => path.split('/').pop() || ''),
    relative: vi.fn((from, to) => {
        // Simple relative path calculation for mocking
        if (to.startsWith(from)) {
            return to.substring(from.length + 1);
        }
        return to;
    })
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn(() => ({
        readFile: vi.fn()
    }))
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn()
}));

vi.mock('../../src/commands/publish', () => ({
    execute: vi.fn()
}));

import fs from 'fs/promises';
import { execute } from '../../src/commands/publish-tree';
import { getLogger } from '../../src/logging';
import { create as createStorage } from '../../src/util/storage';
import { run } from '../../src/util/child';
import * as Publish from '../../src/commands/publish';
import type { Config } from '../../src/types';

describe('publish-tree', () => {
    let mockLogger: any;
    let mockStorage: any;
    let mockRun: Mock;
    let mockPublishExecute: Mock;

    // Helper function to create base config with required Cardigantime properties
    const createBaseConfig = (overrides: Partial<Config> = {}): Config => ({
        configDirectory: '/test/config',
        discoveredConfigDirs: ['/test/config'],
        resolvedConfigDirs: ['/test/config'],
        ...overrides
    });

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };
        (getLogger as Mock).mockReturnValue(mockLogger);

        mockStorage = {
            readFile: vi.fn()
        };
        (createStorage as Mock).mockReturnValue(mockStorage);

        mockRun = run as Mock;
        mockPublishExecute = Publish.execute as Mock;

        // Mock process.cwd and process.chdir
        vi.spyOn(process, 'cwd').mockReturnValue('/workspace');
        vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe('execute', () => {
        it('should handle empty directory with no package.json files', async () => {
            const config: Config = {
                configDirectory: '/test/config',
                discoveredConfigDirs: ['/test/config'],
                resolvedConfigDirs: ['/test/config']
            };

            (fs.readdir as Mock).mockResolvedValue([]);

            const result = await execute(config);

            expect(result).toContain('No package.json files found');
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No package.json files found'));
        });

        it('should scan and build dependency graph for simple packages', async () => {
            const config = createBaseConfig();

            // Mock directory scanning
            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true },
                { name: 'file.txt', isDirectory: () => false }
            ]);

            // Mock package.json access
            (fs.access as Mock).mockImplementation((path: string) => {
                if (path.includes('package-a') || path.includes('package-b')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('Not found'));
            });

            // Mock package.json content
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        dependencies: { 'package-b': '1.0.0' }
                    }));
                } else if (path.includes('package-b')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-b',
                        version: '1.0.0',
                        dependencies: {}
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 2 packages');
            expect(result).toContain('1. package-b');
            expect(result).toContain('2. package-a');
            expect(mockLogger.info).toHaveBeenCalledWith('Found 2 package.json files');
        });

        it('should handle circular dependencies', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Create circular dependency
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        dependencies: { 'package-b': '1.0.0' }
                    }));
                } else if (path.includes('package-b')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-b',
                        version: '1.0.0',
                        dependencies: { 'package-a': '1.0.0' }
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            await expect(execute(config)).rejects.toThrow('Circular dependency detected');
        });

        it('should exclude packages based on patterns', async () => {
            const config = createBaseConfig({
                publishTree: {
                    excludedPatterns: ['test-*', 'internal']
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'test-package', isDirectory: () => true },
                { name: 'internal', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0'
                    }));
                } else if (path.includes('test-package')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0'
                    }));
                } else if (path.includes('internal')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'internal-package',
                        version: '1.0.0'
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 1 packages');
            expect(result).toContain('package-a');
            expect(result).not.toContain('test-package');
            expect(result).not.toContain('internal-package');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Excluding package.json'));
        });

        it('should start from specified package', async () => {
            const config = createBaseConfig({
                publishTree: {
                    startFrom: 'package-b'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true },
                { name: 'package-c', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('package-a') ? 'package-a' :
                                  path.includes('package-b') ? 'package-b' : 'package-c';

                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            const result = await execute(config);

            expect(result).toContain('starting from package-b');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('skipping 1 package'));
        });

        it('should throw error for invalid startFrom package', async () => {
            const config = createBaseConfig({
                publishTree: {
                    startFrom: 'non-existent'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            await expect(execute(config)).rejects.toThrow("Package directory 'non-existent' not found");
        });

        it('should execute script in dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true,
                publishTree: {
                    script: 'npm run build'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            const result = await execute(config);

            expect(result).toContain('All 1 packages completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would execute: npm run build');
            expect(mockRun).not.toHaveBeenCalled();
        });

        it('should execute script in packages', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 1 packages completed successfully');
            expect(mockRun).toHaveBeenCalledWith('npm run build');
            expect(process.chdir).toHaveBeenCalledWith('/workspace/package-a');
        });

        it('should execute cmd with priority over script', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    cmd: 'yarn build'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            mockRun.mockResolvedValue(undefined);

            await execute(config);

            expect(mockRun).toHaveBeenCalledWith('yarn build');
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Both --script and --cmd provided'));
        });

        it('should execute publish with priority over cmd and script', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    cmd: 'yarn build',
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockPublishExecute).toHaveBeenCalledWith(config);
            expect(mockRun).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Multiple execution options provided'));
        });

        it('should handle script execution failure and provide recovery command', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('package-a') ? 'package-a' : 'package-b';
                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            // First call succeeds, second fails
            mockRun.mockResolvedValueOnce(undefined)
                   .mockRejectedValueOnce(new Error('Build failed'));

            await expect(execute(config)).rejects.toThrow('Script failed in package package-b');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('To resume from this package, run:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('kodrdriv publish-tree --start-from package-b'));
        });

        it('should handle package.json without name field', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                version: '1.0.0'
                // Missing name field
            }));

            await expect(execute(config)).rejects.toThrow('Package at /workspace/package-a/package.json has no name field');
        });

        it('should handle invalid JSON in package.json', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue('invalid json {');

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace');
        });

        it('should handle file system errors during scanning', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockRejectedValue(new Error('Permission denied'));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace');
        });

        it('should use custom directory from config', async () => {
            const config = createBaseConfig({
                publishTree: {
                    directory: '/custom/path'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([]);

            await execute(config);

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Analyzing workspace at: /custom/path'));
        });

        it('should collect all dependency types', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                dependencies: { 'dep1': '1.0.0' },
                devDependencies: { 'dep2': '1.0.0' },
                peerDependencies: { 'dep3': '1.0.0' },
                optionalDependencies: { 'dep4': '1.0.0' }
            }));

            const result = await execute(config);

            expect(result).toContain('package-a');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: package-a'));
        });
    });

    describe('edge cases and error handling', () => {
        it('should restore working directory after script failure', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'failing-command'
                }
            });

            const originalCwd = '/workspace';
            (process.cwd as Mock).mockReturnValue(originalCwd);

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            mockRun.mockRejectedValue(new Error('Command failed'));

            await expect(execute(config)).rejects.toThrow();

            // Verify chdir was called to restore original directory
            expect(process.chdir).toHaveBeenCalledWith('/workspace/package-a');
            expect(process.chdir).toHaveBeenCalledWith(originalCwd);
        });

        it('should handle packages with no version field', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a'
                // No version field
            }));

            const result = await execute(config);

            expect(result).toContain('package-a (0.0.0)'); // Default version
        });

        it('should format complex error output', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'failing-command'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            const complexError = new Error('Build failed');
            (complexError as any).stderr = 'Error: Module not found\nStack trace...';
            (complexError as any).stdout = 'Building project...\nCompiling...';

            mockRun.mockRejectedValue(complexError);

            await expect(execute(config)).rejects.toThrow('Script failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('STDERR:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('STDOUT:'));
        });
    });
});
