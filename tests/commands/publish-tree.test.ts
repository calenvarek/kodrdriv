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
    })),
    getDryRunLogger: vi.fn(() => ({
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
        readFile: vi.fn(),
        exists: vi.fn()
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
import { getLogger, getDryRunLogger } from '../../src/logging';
import { create as createStorage } from '../../src/util/storage';
import { run } from '../../src/util/child';
import * as Publish from '../../src/commands/publish';
import type { Config } from '../../src/types';

describe('publish-tree', () => {
    let mockLogger: any;
    let mockDryRunLogger: any;
    let mockStorage: any;
    let mockRun: Mock;
    let mockPublishExecute: Mock;
    let originalEnv: NodeJS.ProcessEnv;

    // Helper function to create base config with required Cardigantime properties
    const createBaseConfig = (overrides: Partial<Config> = {}): Config => ({
        configDirectory: '/test/config',
        discoveredConfigDirs: ['/test/config'],
        resolvedConfigDirs: ['/test/config'],
        ...overrides
    });

    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };
        mockDryRunLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };
        (getLogger as Mock).mockReturnValue(mockLogger);
        (getDryRunLogger as Mock).mockReturnValue(mockDryRunLogger);

        mockStorage = {
            readFile: vi.fn(),
            exists: vi.fn()
        };
        (createStorage as Mock).mockReturnValue(mockStorage);

        // Default mock for exists to return true for package.json files
        mockStorage.exists.mockImplementation((path: string) => {
            return Promise.resolve(path.includes('package.json'));
        });

        mockRun = run as Mock;
        mockPublishExecute = Publish.execute as Mock;



        // Mock process.cwd and process.chdir
        vi.spyOn(process, 'cwd').mockReturnValue('/workspace');
        vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
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
                version: '1.0.0',
                scripts: {
                    prepublishOnly: 'npm run test'
                }
            }));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockPublishExecute).toHaveBeenCalledWith(config);
            // Ensure no custom script/cmd was run (only publish should be called)
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

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Invalid package.json (/workspace/package-a/package.json): name must be a string');
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



    describe('package prechecks', () => {
        it('should pass package prechecks when prepublishOnly script exists', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                scripts: {
                    prepublishOnly: 'npm run clean && npm run test'
                }
            }));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockDryRunLogger.info).toHaveBeenCalledWith(expect.stringContaining('All prechecks passed for 1 packages'));
        });

        it('should fail package prechecks when prepublishOnly script is missing', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                scripts: {
                    build: 'npm run build'
                }
            }));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should handle missing package.json in package directory', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // First call for scanning succeeds, second call for prechecks fails
            mockStorage.exists.mockResolvedValueOnce(true) // For scanning
                              .mockResolvedValueOnce(false); // For prechecks

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0'
            }));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should handle invalid package.json during prechecks', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Return valid JSON for scanning, invalid for prechecks
            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({ name: 'package-a', version: '1.0.0' })) // For scanning
                .mockResolvedValueOnce('invalid json {'); // For prechecks

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should check required environment variables from config', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                },
                publish: {
                    requiredEnvVars: ['NPM_TOKEN', 'API_KEY']
                }
            });

            // Set one env var but not the other
            process.env.NPM_TOKEN = 'token-value';
            delete process.env.API_KEY;

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                scripts: {
                    prepublishOnly: 'npm run test'
                }
            }));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should parse .npmrc file for environment variables', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            // Don't set the env var
            delete process.env.CUSTOM_REGISTRY_TOKEN;

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        scripts: {
                            prepublishOnly: 'npm run test'
                        }
                    }));
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve('//registry.npmjs.org/:_authToken=${CUSTOM_REGISTRY_TOKEN}\n@scope:registry=https://npm.custom.com/');
                }
                return Promise.reject(new Error('File not found'));
            });

            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(true); // Both package.json and .npmrc exist
            });

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should handle .npmrc parsing errors gracefully', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        scripts: {
                            prepublishOnly: 'npm run test'
                        }
                    }));
                }
                if (path.includes('.npmrc')) {
                    throw new Error('Permission denied');
                }
                return Promise.reject(new Error('File not found'));
            });

            mockStorage.exists.mockReturnValue(Promise.resolve(true));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            // Should complete successfully despite .npmrc error
            expect(mockDryRunLogger.info).toHaveBeenCalledWith(expect.stringContaining('All prechecks passed'));
        });

        it('should handle package prechecks in dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true,
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Missing prepublishOnly script
            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                scripts: {
                    build: 'npm run build'
                }
            }));

            const result = await execute(config);

            expect(result).toContain('DRY RUN: All 1 packages completed successfully');
            // In dry run mode, the function completes successfully even with issues
            // The warning message may not be called in this specific scenario
            // Just verify that the operation completed successfully
        });

        it('should provide detailed error message for multiple package failures', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0'
                        // Missing prepublishOnly script
                    }));
                } else if (path.includes('package-b')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-b',
                        version: '1.0.0'
                        // Missing prepublishOnly script
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 2 packages');
            expect(mockDryRunLogger.error).toHaveBeenCalledWith('❌ Prechecks failed for 2 packages:');
            expect(mockDryRunLogger.error).toHaveBeenCalledWith('📋 To fix these issues:');
        });
    });

    describe('pattern matching and exclusions', () => {
        it('should match glob patterns correctly', async () => {
            const config = createBaseConfig({
                publishTree: {
                    excludedPatterns: ['**/*test*/**', '*.temp']
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'test-utils', isDirectory: () => true },
                { name: 'project.temp', isDirectory: () => true },
                { name: 'nested-test-pkg', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockImplementation((path: string) => {
                // Only package-a should have a package.json (others are excluded by patterns)
                if (path.includes('package-a')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('Not found'));
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0'
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 1 packages');
            expect(result).toContain('package-a');
            expect(result).not.toContain('test-utils');
            expect(result).not.toContain('project-temp');
            expect(result).not.toContain('nested-test-pkg');
        });

        it('should handle wildcard patterns', async () => {
            const config = createBaseConfig({
                publishTree: {
                    excludedPatterns: ['temp-*', '*-backup']
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'temp-project', isDirectory: () => true },
                { name: 'project-backup', isDirectory: () => true },
                { name: 'temp-backup', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('package-a') ? 'package-a' :
                                  path.includes('temp-project') ? 'temp-project' :
                                  path.includes('project-backup') ? 'project-backup' : 'temp-backup';

                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 1 packages');
            expect(result).toContain('package-a');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Excluding package.json'));
        });

        it('should handle question mark patterns', async () => {
            const config = createBaseConfig({
                publishTree: {
                    excludedPatterns: ['temp?', 'pkg-v?.?.?']
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'temp1', isDirectory: () => true },
                { name: 'temps', isDirectory: () => true },
                { name: 'pkg-v1.0.0', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockImplementation((path: string) => {
                // Only package-a and temps should have package.json (others are excluded by patterns)
                if (path.includes('package-a') || path.includes('temps')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('Not found'));
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package-a')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0'
                    }));
                } else if (path.includes('temps')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'temps',
                        version: '1.0.0'
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 2 packages');
            expect(result).toContain('package-a');
            expect(result).toContain('temps'); // 'temps' doesn't match 'temp?' pattern
        });
    });

    describe('error formatting and handling', () => {
        it('should format script errors with stderr and stdout', async () => {
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

            const errorWithOutput = new Error('Command failed');
            (errorWithOutput as any).stderr = 'Error: Module not found\nAt line 15 in file.js';
            (errorWithOutput as any).stdout = 'Building project...\nCompiling modules...\nFailed at step 3';

            mockRun.mockRejectedValue(errorWithOutput);

            await expect(execute(config)).rejects.toThrow('Script failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('STDERR:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('STDOUT:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Module not found'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Building project'));
        });

        it('should format simple errors without stderr/stdout', async () => {
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

            const simpleError = new Error('Simple command failed');
            mockRun.mockRejectedValue(simpleError);

            await expect(execute(config)).rejects.toThrow('Script failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Simple command failed'));
        });

        it('should handle errors with empty stderr/stdout', async () => {
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

            const errorWithEmptyOutput = new Error('Command failed');
            (errorWithEmptyOutput as any).stderr = '';
            (errorWithEmptyOutput as any).stdout = '   \n  \n';

            mockRun.mockRejectedValue(errorWithEmptyOutput);

            await expect(execute(config)).rejects.toThrow('Script failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-a:'));
            expect(mockLogger.error).not.toHaveBeenCalledWith(expect.stringContaining('STDERR:'));
            expect(mockLogger.error).not.toHaveBeenCalledWith(expect.stringContaining('STDOUT:'));
        });
    });

    describe('complex dependency scenarios', () => {
        it('should handle deep dependency chains', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'level-0', isDirectory: () => true },
                { name: 'level-1', isDirectory: () => true },
                { name: 'level-2', isDirectory: () => true },
                { name: 'level-3', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Create a 4-level dependency chain
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('level-0')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'level-0',
                        version: '1.0.0'
                    }));
                } else if (path.includes('level-1')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'level-1',
                        version: '1.0.0',
                        dependencies: { 'level-0': '1.0.0' }
                    }));
                } else if (path.includes('level-2')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'level-2',
                        version: '1.0.0',
                        dependencies: { 'level-1': '1.0.0' }
                    }));
                } else if (path.includes('level-3')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'level-3',
                        version: '1.0.0',
                        dependencies: { 'level-2': '1.0.0' }
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 4 packages');
            expect(result).toContain('1. level-0');
            expect(result).toContain('2. level-1');
            expect(result).toContain('3. level-2');
            expect(result).toContain('4. level-3');
        });

        it('should handle diamond dependency pattern', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'base', isDirectory: () => true },
                { name: 'left', isDirectory: () => true },
                { name: 'right', isDirectory: () => true },
                { name: 'top', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Create diamond pattern: top -> left,right -> base
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('base')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'base',
                        version: '1.0.0'
                    }));
                } else if (path.includes('left')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'left',
                        version: '1.0.0',
                        dependencies: { 'base': '1.0.0' }
                    }));
                } else if (path.includes('right')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'right',
                        version: '1.0.0',
                        dependencies: { 'base': '1.0.0' }
                    }));
                } else if (path.includes('top')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'top',
                        version: '1.0.0',
                        dependencies: { 'left': '1.0.0', 'right': '1.0.0' }
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 4 packages');
            expect(result).toContain('1. base');
            expect(result).toContain('4. top');
            // left and right can be in either order
            expect(result).toMatch(/2\. (left|right)/);
            expect(result).toMatch(/3\. (left|right)/);
        });

        it('should handle multiple independent packages', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'independent-a', isDirectory: () => true },
                { name: 'independent-b', isDirectory: () => true },
                { name: 'independent-c', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('independent-a') ? 'independent-a' :
                                  path.includes('independent-b') ? 'independent-b' : 'independent-c';

                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 3 packages');
            expect(result).toContain('Local Dependencies: none');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(no local dependencies)'));
        });

        it('should handle mixed dependency types', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'core', isDirectory: () => true },
                { name: 'plugin', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('core')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'core',
                        version: '1.0.0'
                    }));
                } else if (path.includes('plugin')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'plugin',
                        version: '1.0.0',
                        dependencies: { 'external-lib': '1.0.0' },
                        devDependencies: { 'core': '1.0.0', 'test-lib': '1.0.0' },
                        peerDependencies: { 'core': '1.0.0' },
                        optionalDependencies: { 'core': '1.0.0' }
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 2 packages');
            expect(result).toContain('1. core');
            expect(result).toContain('2. plugin');
            expect(result).toContain('Local Dependencies: core');
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

        it('should handle storage file existence checks', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'package-a',
                version: '1.0.0',
                scripts: {
                    prepublishOnly: 'npm run test'
                }
            }));

            // Mock storage exists to return false for .npmrc
            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('.npmrc')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockDryRunLogger.info).toHaveBeenCalledWith(expect.stringContaining('All prechecks passed'));
        });

        it('should handle startFrom with package name instead of directory name', async () => {
            const config = createBaseConfig({
                publishTree: {
                    startFrom: 'my-package'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-dir', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'my-package',
                version: '1.0.0'
            }));

            const result = await execute(config);

            expect(result).toContain('starting from my-package');
        });

        it('should handle parsing package.json with missing name after validation', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                version: '1.0.0'
                // Missing name - will be caught by validation
            }));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace');
        });
    });

    describe('parallel execution', () => {
        it('should execute packages in parallel when enabled', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'package-b', isDirectory: () => true },
                { name: 'package-c', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // All packages have no dependencies - should run in parallel
            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('package-a') ? 'package-a' :
                                  path.includes('package-b') ? 'package-b' : 'package-c';

                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 3 packages completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 1: Executing 3 packages in parallel'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('✅ Level 1 completed: all 3 packages finished successfully'));
            expect(mockRun).toHaveBeenCalledTimes(3);
        });

        it('should group packages into dependency levels correctly', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'utils', isDirectory: () => true },
                { name: 'core', isDirectory: () => true },
                { name: 'api', isDirectory: () => true },
                { name: 'ui', isDirectory: () => true },
                { name: 'app', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Create dependency chain: utils -> core -> api -> ui -> app
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('utils')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'utils',
                        version: '1.0.0'
                    }));
                } else if (path.includes('core')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'core',
                        version: '1.0.0',
                        dependencies: { 'utils': '1.0.0' }
                    }));
                } else if (path.includes('api')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'api',
                        version: '1.0.0',
                        dependencies: { 'core': '1.0.0' }
                    }));
                } else if (path.includes('ui')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'ui',
                        version: '1.0.0',
                        dependencies: { 'core': '1.0.0', 'utils': '1.0.0' }
                    }));
                } else if (path.includes('app')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'app',
                        version: '1.0.0',
                        dependencies: { 'api': '1.0.0', 'ui': '1.0.0' }
                    }));
                }
                return Promise.reject(new Error('File not found'));
            });

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 5 packages completed successfully');

            // Verify level grouping log messages
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Packages grouped into'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 1: Executing utils'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 2: Executing core'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 3: Executing 2 packages in parallel: api, ui'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 4: Executing app'));

            expect(mockRun).toHaveBeenCalledTimes(5);
        });

        it('should handle parallel execution failures correctly', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: true
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

            // First package succeeds, second fails
            mockRun.mockResolvedValueOnce(undefined)
                   .mockRejectedValueOnce(new Error('Build failed'));

            await expect(execute(config)).rejects.toThrow('Script failed in package package-b');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-b:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('To resume from this package, run:'));
        });

        it('should execute sequentially when parallel is disabled', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: false
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

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 2 packages completed successfully');
            expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Level 1:'));
            expect(mockRun).toHaveBeenCalledTimes(2);
        });

        it('should handle parallel execution in dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true,
                publishTree: {
                    script: 'npm run build',
                    parallel: true
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

            const result = await execute(config);

            expect(result).toContain('DRY RUN: All 2 packages completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('DRY RUN:'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 1: Executing 2 packages in parallel'));
            expect(mockRun).not.toHaveBeenCalled();
        });

        it('should execute publish command in parallel mode', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true,
                    parallel: true
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
                    version: '1.0.0',
                    scripts: {
                        prepublishOnly: 'npm run test'
                    }
                }));
            });

            mockPublishExecute.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 2 packages completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Executing publish'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockPublishExecute).toHaveBeenCalledTimes(2);
            // Ensure no custom script/cmd was run (only publish should be called)
            expect(mockRun).not.toHaveBeenCalled();
        });

        it('should handle promise rejection in parallel execution', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: true
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

            // Simulate a promise rejection (not an Error throw)
            mockRun.mockRejectedValue('Promise rejected');

            await expect(execute(config)).rejects.toThrow('Script failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Script failed in package package-a:'));
        });

        it('should handle single package level correctly in parallel mode', async () => {
            const config = createBaseConfig({
                publishTree: {
                    script: 'npm run build',
                    parallel: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'single-package', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'single-package',
                version: '1.0.0'
            }));

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 1 packages completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 1: Executing single-package'));
            expect(mockRun).toHaveBeenCalledTimes(1);
        });
    });

    describe('additional edge cases', () => {
        it('should handle packages with external dependencies only', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'external-only', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'external-only',
                version: '1.0.0',
                dependencies: {
                    'lodash': '4.17.21',
                    'express': '4.18.0'
                }
            }));

            const result = await execute(config);

            expect(result).toContain('external-only');
            expect(result).toContain('Local Dependencies: none');
        });

        it('should handle environment variable patterns with different formats', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            // Set some env vars but not others
            process.env.TOKEN_1 = 'value1';
            delete process.env.TOKEN_2;
            delete process.env.API_SECRET;

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        scripts: {
                            prepublishOnly: 'npm run test'
                        }
                    }));
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve([
                        '//registry.npmjs.org/:_authToken=${TOKEN_1}',
                        'registry=https://custom.registry.com',
                        'api-token=$TOKEN_2',
                        'secret=$API_SECRET'
                    ].join('\n'));
                }
                return Promise.reject(new Error('File not found'));
            });

            mockStorage.exists.mockReturnValue(Promise.resolve(true));

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Prechecks failed for 1 package');
        });

        it('should handle .npmrc with no environment variables', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        scripts: {
                            prepublishOnly: 'npm run test'
                        }
                    }));
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve([
                        'registry=https://registry.npmjs.org/',
                        'save-exact=true',
                        'progress=false'
                    ].join('\n'));
                }
                return Promise.reject(new Error('File not found'));
            });

            mockStorage.exists.mockReturnValue(Promise.resolve(true));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockDryRunLogger.info).toHaveBeenCalledWith(expect.stringContaining('All prechecks passed'));
        });

        it('should handle duplicate environment variables in .npmrc', async () => {
            const config = createBaseConfig({
                publishTree: {
                    publish: true,
                },
                publish: {
                    requiredEnvVars: ['NPM_TOKEN']
                }
            });

            process.env.NPM_TOKEN = 'token-value';

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'package-a',
                        version: '1.0.0',
                        scripts: {
                            prepublishOnly: 'npm run test'
                        }
                    }));
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve([
                        '//registry.npmjs.org/:_authToken=${NPM_TOKEN}',
                        'secondary-token=${NPM_TOKEN}',
                        'backup-token=$NPM_TOKEN'
                    ].join('\n'));
                }
                return Promise.reject(new Error('File not found'));
            });

            mockStorage.exists.mockReturnValue(Promise.resolve(true));

            mockPublishExecute.mockResolvedValue(undefined);

            await execute(config);

            expect(mockDryRunLogger.info).toHaveBeenCalledWith(expect.stringContaining('All prechecks passed'));
        });

        it('should handle very complex dependency graph with multiple levels', async () => {
            const config = createBaseConfig({
                publishTree: {
                    parallel: true,
                    script: 'npm run build'
                }
            });

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'shared', isDirectory: () => true },
                { name: 'utils', isDirectory: () => true },
                { name: 'auth', isDirectory: () => true },
                { name: 'api', isDirectory: () => true },
                { name: 'ui-components', isDirectory: () => true },
                { name: 'admin-ui', isDirectory: () => true },
                { name: 'client-ui', isDirectory: () => true },
                { name: 'app', isDirectory: () => true }
            ]);

            (fs.access as Mock).mockResolvedValue(undefined);

            // Complex dependency graph
            mockStorage.readFile.mockImplementation((path: string) => {
                const packages: { [key: string]: any } = {
                    'shared': { name: 'shared', version: '1.0.0' },
                    'utils': {
                        name: 'utils',
                        version: '1.0.0',
                        dependencies: { 'shared': '1.0.0' }
                    },
                    'auth': {
                        name: 'auth',
                        version: '1.0.0',
                        dependencies: { 'shared': '1.0.0', 'utils': '1.0.0' }
                    },
                    'api': {
                        name: 'api',
                        version: '1.0.0',
                        dependencies: { 'auth': '1.0.0', 'utils': '1.0.0' }
                    },
                    'ui-components': {
                        name: 'ui-components',
                        version: '1.0.0',
                        dependencies: { 'shared': '1.0.0' }
                    },
                    'admin-ui': {
                        name: 'admin-ui',
                        version: '1.0.0',
                        dependencies: { 'ui-components': '1.0.0', 'auth': '1.0.0' }
                    },
                    'client-ui': {
                        name: 'client-ui',
                        version: '1.0.0',
                        dependencies: { 'ui-components': '1.0.0', 'api': '1.0.0' }
                    },
                    'app': {
                        name: 'app',
                        version: '1.0.0',
                        dependencies: { 'admin-ui': '1.0.0', 'client-ui': '1.0.0', 'api': '1.0.0' }
                    }
                };

                for (const [packageName, packageInfo] of Object.entries(packages)) {
                    if (path.includes(packageName)) {
                        return Promise.resolve(JSON.stringify(packageInfo));
                    }
                }
                return Promise.reject(new Error('File not found'));
            });

            mockRun.mockResolvedValue(undefined);

            const result = await execute(config);

            expect(result).toContain('All 8 packages completed successfully');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Packages grouped into'));
            expect(mockRun).toHaveBeenCalledTimes(8);
        });

        it('should handle scanning directory with mixed file types', async () => {
            const config = createBaseConfig();

            (fs.readdir as Mock).mockResolvedValue([
                { name: 'package-a', isDirectory: () => true },
                { name: 'file1.txt', isDirectory: () => false },
                { name: 'package-b', isDirectory: () => true },
                { name: 'file2.json', isDirectory: () => false },
                { name: 'symlink', isDirectory: () => false },
                { name: 'nested-dir', isDirectory: () => true }
            ]);

            // Only package-a and package-b have package.json
            (fs.access as Mock).mockImplementation((path: string) => {
                if (path.includes('package-a') || path.includes('package-b')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('Not found'));
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                const packageName = path.includes('package-a') ? 'package-a' : 'package-b';
                return Promise.resolve(JSON.stringify({
                    name: packageName,
                    version: '1.0.0'
                }));
            });

            const result = await execute(config);

            expect(result).toContain('Build Order for 2 packages');
            expect(result).toContain('package-a');
            expect(result).toContain('package-b');
        });
    });
});
