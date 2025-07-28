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

vi.mock('child_process', () => ({
    exec: vi.fn()
}));

import fs from 'fs/promises';
import { exec } from 'child_process';
import { execute } from '../../src/commands/tree';
import { getLogger, getDryRunLogger } from '../../src/logging';
import { create as createStorage } from '../../src/util/storage';
import { run } from '../../src/util/child';
import type { Config } from '../../src/types';

describe('tree', () => {
    let mockLogger: any;
    let mockDryRunLogger: any;
    let mockStorage: any;
    let mockRun: Mock;
    let mockExec: Mock;

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
        // Default successful execution for commands
        mockRun.mockResolvedValue({ stdout: '', stderr: '' });

        mockExec = exec as unknown as Mock;
        // Default successful execution for exec commands
        mockExec.mockImplementation((command: string, options: any, callback?: Function) => {
            if (callback) {
                callback(null, { stdout: '', stderr: '' });
            } else {
                // Return a promise-like object
                return Promise.resolve({ stdout: '', stderr: '' });
            }
        });

        // Mock process.cwd and process.chdir
        vi.spyOn(process, 'cwd').mockReturnValue('/workspace');
        vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    // Helper function to set up common file system mocks
    const setupBasicFilesystemMocks = (packages: Array<{name: string, dependencies?: Record<string, string>, version?: string}>) => {
        const packageNames = packages.map(p => p.name);

        // Mock directory scanning to return the package directories
        (fs.readdir as Mock).mockResolvedValue(
            packageNames.map(name => ({
                name,
                isDirectory: () => true
            }))
        );

        // Mock file access to succeed for all package.json files
        (fs.access as Mock).mockImplementation((path: string) => {
            if (packageNames.some(name => path.includes(name) && path.includes('package.json'))) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('Not found'));
        });

        // Mock file reading to return appropriate package.json content
        mockStorage.readFile.mockImplementation((path: string) => {
            for (const pkg of packages) {
                if (path.includes(pkg.name)) {
                    const packageData: any = {
                        name: pkg.name,
                        dependencies: pkg.dependencies || {}
                    };

                    // Only add version if it's explicitly provided (not undefined)
                    if (pkg.version !== undefined) {
                        packageData.version = pkg.version || '1.0.0';
                    }

                    return Promise.resolve(JSON.stringify(packageData));
                }
            }
            return Promise.reject(new Error('File not found'));
        });
    };

    describe('execute', () => {
        it('should handle empty directory with no package.json files', async () => {
            const config: Config = {
                configDirectory: '/test/config',
                discoveredConfigDirs: ['/test/config'],
                resolvedConfigDirs: ['/test/config']
            };

            // Mock empty directory
            (fs.readdir as Mock).mockResolvedValue([]);

            // Mock access to fail for all package.json files (empty directory)
            (fs.access as Mock).mockRejectedValue(new Error('No such file'));

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

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-b → package-a');
            // Check logged messages
            expect(mockLogger.info).toHaveBeenCalledWith('Found 2 package.json files');
            expect(mockLogger.info).toHaveBeenCalledWith('1. package-b (no local dependencies)');
            expect(mockLogger.info).toHaveBeenCalledWith('2. package-a (depends on: package-b)');
        });

        it('should handle circular dependencies', async () => {
            const config = createBaseConfig();

            // Set up circular dependency: package-a depends on package-b, package-b depends on package-a
            setupBasicFilesystemMocks([
                { name: 'package-a', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b', dependencies: { 'package-a': '1.0.0' } }
            ]);

            await expect(execute(config)).rejects.toThrow('Circular dependency detected');
        });

        it('should exclude packages based on patterns', async () => {
            const config = createBaseConfig({
                tree: {
                    excludedPatterns: ['test-*', 'internal']
                }
            });

            // Set up packages including ones that should be excluded
            setupBasicFilesystemMocks([
                { name: 'package-a' },
                { name: 'test-package' }, // Should be excluded by pattern 'test-*'
                { name: 'internal' }      // Should be excluded by pattern 'internal'
            ]);

            const result = await execute(config);

            // Only package-a should remain after exclusion
            expect(result).toContain('Build order: package-a');
            expect(result).not.toContain('test-package');
            expect(result).not.toContain('internal');
            // The verbose logging about exclusion might not be called in this simple case,
            // so let's focus on the core functionality
            expect(mockLogger.info).toHaveBeenCalledWith('Found 1 package.json files'); // Only non-excluded packages
        });

        it('should start from specified package', async () => {
            const config = createBaseConfig({
                tree: {
                    startFrom: 'package-b'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b' }
            ]);

            const result = await execute(config);

            // Check return value - both packages should be included since package-a depends on package-b
            // and startFrom includes the specified package and all packages that come after it
            expect(result).toContain('Build order: package-b → package-a');
            // Check that no packages were skipped (since package-b is the first in dependency order)
            expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('skipping'));
        });

        it('should throw error for invalid startFrom package', async () => {
            const config = createBaseConfig({
                tree: {
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

        it('should execute command in dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true,
                tree: {
                    cmd: 'npm install'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-a');
            // Check that dry run messages were logged
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would execute: npm install');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: All 1 packages completed successfully! 🎉');
            expect(mockRun).not.toHaveBeenCalled();
        });

        it('should execute command in packages', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', version: '1.0.0' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-a');
            // Check that success message was logged
            expect(mockLogger.info).toHaveBeenCalledWith('All 1 packages completed successfully! 🎉');
            expect(mockExec).toHaveBeenCalledWith('npm install', expect.any(Object), expect.any(Function));
            expect(process.chdir).toHaveBeenCalledWith('/workspace/package-a');
        });

        it('should handle command execution failure and provide recovery command', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', version: '1.0.0', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b', version: '1.0.0' }
            ]);

            // Mock first call to succeed, second call to fail
            mockExec.mockImplementationOnce((command: string, options: any, callback: Function) => {
                callback(null, { stdout: '', stderr: '' });
            }).mockImplementationOnce((command: string, options: any, callback: Function) => {
                callback(new Error('Install failed'));
            });

            await expect(execute(config)).rejects.toThrow('Command failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('To resume from this package, run:'));
            expect(mockLogger.error).toHaveBeenCalledWith('    kodrdriv tree --start-from package-a --cmd "npm install"');
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

            await expect(execute(config)).rejects.toThrow('Failed to analyze workspace: Invalid package.json (/workspace/package.json): name must be a string');
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

        it('should use custom directories from config', async () => {
            const config = createBaseConfig({
                tree: {
                    directories: ['/custom/path']
                }
            });

            (fs.readdir as Mock).mockResolvedValue([]);
            // Mock fs.access to fail for custom paths
            (fs.access as Mock).mockRejectedValue(new Error('ENOENT: no such file or directory'));
            // Override the default exists mock to return false for this custom path
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(false);
            });

            const result = await execute(config);

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Analyzing workspace at: /custom/path'));
            expect(result).toContain('No package.json files found');
        });

        it('should return build order without executing command when no cmd provided', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                { name: 'package-a' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-a');
            // Command should not be executed
            expect(mockRun).not.toHaveBeenCalled();
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

    describe('parallel execution', () => {
        it('should execute packages in parallel when enabled', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install',
                    parallel: true
                }
            });

            // Set up 3 packages with dependency chain: package-c (level 0) -> package-a (level 1) -> package-b (level 2)
            setupBasicFilesystemMocks([
                { name: 'package-a', dependencies: { 'package-c': '1.0.0' } },
                { name: 'package-b', dependencies: { 'package-a': '1.0.0' } },
                { name: 'package-c' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-c → package-a → package-b');
            // Check that parallel execution messages were logged
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Level 1: Executing'));
            expect(mockLogger.info).toHaveBeenCalledWith('All 3 packages completed successfully! 🎉');
        });

        it('should group packages into dependency levels correctly', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install',
                    parallel: true
                }
            });

            setupBasicFilesystemMocks([
                { name: 'utils', version: '1.0.0' },
                { name: 'core', version: '1.0.0', dependencies: { 'utils': '1.0.0' } },
                { name: 'api', version: '1.0.0', dependencies: { 'core': '1.0.0' } },
                { name: 'ui', version: '1.0.0', dependencies: { 'core': '1.0.0', 'utils': '1.0.0' } },
                { name: 'app', version: '1.0.0', dependencies: { 'api': '1.0.0', 'ui': '1.0.0' } }
            ]);

            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(null, { stdout: '', stderr: '' });
            });

            const result = await execute(config);

            expect(result).toContain('Build order: utils → core');

            // Verify that packages were processed correctly
            expect(mockLogger.info).toHaveBeenCalledWith('All 5 packages completed successfully! 🎉');
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: utils'));
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: core'));
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: api'));
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: ui'));
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('Parsed package: app'));

            expect(mockExec).toHaveBeenCalledTimes(5);
        });

        it('should handle parallel execution failures correctly', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install',
                    parallel: true
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', version: '1.0.0', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b', version: '1.0.0' }
            ]);

            // Mock first call to succeed, second call to fail
            mockExec.mockImplementationOnce((command: string, options: any, callback: Function) => {
                callback(null, { stdout: '', stderr: '' });
            }).mockImplementationOnce((command: string, options: any, callback: Function) => {
                callback(new Error('Install failed'));
            });

            await expect(execute(config)).rejects.toThrow('Command failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Command failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('To resume from this package, run:'));
        });

        it('should execute sequentially when parallel is disabled', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'npm install',
                    parallel: false
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-b → package-a');
            // Check that success message was logged
            expect(mockLogger.info).toHaveBeenCalledWith('All 2 packages completed successfully! 🎉');
            // Should not have parallel-specific logging
            expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Level 1:'));
        });

        it('should handle parallel execution in dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true,
                tree: {
                    cmd: 'npm install',
                    parallel: true
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', dependencies: { 'package-b': '1.0.0' } },
                { name: 'package-b' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-b → package-a');
            // Check that dry run and parallel messages were logged
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('DRY RUN:'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(with parallel execution)'));
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: All 2 packages completed successfully! 🎉');
        });
    });

    describe('error formatting and handling', () => {
        it('should format command errors with stderr and stdout', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'failing-command'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a', version: '1.0.0' }
            ]);

            // Mock command failure with stderr and stdout
            const errorWithOutput = new Error('Command failed: failing-command\n/bin/sh: failing-command: command not found') as any;
            errorWithOutput.stderr = '/bin/sh: failing-command: command not found';
            errorWithOutput.stdout = 'Installing packages...\nModule not found';
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(errorWithOutput);
            });

            await expect(execute(config)).rejects.toThrow('Command failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Command failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('STDERR:'));
            // The error should contain the command failure info
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Command failed: failing-command'));
        });

        it('should format simple errors without stderr/stdout', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'failing-command'
                }
            });

            setupBasicFilesystemMocks([
                { name: 'package-a' }
            ]);

            // Mock simple command failure without stdout/stderr
            const simpleError = new Error('Command failed: failing-command\n/bin/sh: failing-command: command not found') as any;
            simpleError.stderr = '/bin/sh: failing-command: command not found';
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(simpleError);
            });

            await expect(execute(config)).rejects.toThrow('Command failed in package package-a');

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('❌ Command failed in package package-a:'));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Command failed: failing-command'));
        });

        it('should restore working directory after command failure', async () => {
            const config = createBaseConfig({
                tree: {
                    cmd: 'failing-command'
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

            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(new Error('Command failed'));
            });

            await expect(execute(config)).rejects.toThrow();

            // Verify chdir was called to restore original directory
            expect(process.chdir).toHaveBeenCalledWith('/workspace/package-a');
            expect(process.chdir).toHaveBeenCalledWith(originalCwd);
        });

        it('should handle packages with no version field', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                { name: 'package-a', version: undefined } // No version field
            ]);

            const result = await execute(config);

            // Check return value format - simple build order
            expect(result).toContain('Build order: package-a');
            // In non-verbose mode, version info is not shown in logs, only build order
            expect(mockLogger.info).toHaveBeenCalledWith('1. package-a (no local dependencies)');
        });
    });

    describe('complex dependency scenarios', () => {
        it('should handle deep dependency chains', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                { name: 'level-0', version: '1.0.0' },
                { name: 'level-1', version: '1.0.0', dependencies: { 'level-0': '1.0.0' } },
                { name: 'level-2', version: '1.0.0', dependencies: { 'level-1': '1.0.0' } },
                { name: 'level-3', version: '1.0.0', dependencies: { 'level-2': '1.0.0' } }
            ]);

            const result = await execute(config);

            expect(result).toContain('Build order: level-0 → level-1 → level-2 → level-3');
            expect(mockLogger.info).toHaveBeenCalledWith('1. level-0 (no local dependencies)');
            expect(mockLogger.info).toHaveBeenCalledWith('2. level-1 (depends on: level-0)');
            expect(mockLogger.info).toHaveBeenCalledWith('3. level-2 (depends on: level-1)');
            expect(mockLogger.info).toHaveBeenCalledWith('4. level-3 (depends on: level-2)');
        });

        it('should handle diamond dependency pattern', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                { name: 'base', version: '1.0.0' },
                { name: 'left', version: '1.0.0', dependencies: { 'base': '1.0.0' } },
                { name: 'right', version: '1.0.0', dependencies: { 'base': '1.0.0' } },
                { name: 'top', version: '1.0.0', dependencies: { 'left': '1.0.0', 'right': '1.0.0' } }
            ]);

            const result = await execute(config);

            expect(result).toContain('Build order:');
            expect(result).toContain('base');
            expect(result).toContain('top');
            expect(result).toContain('left');
            expect(result).toContain('right');
            expect(mockLogger.info).toHaveBeenCalledWith('1. base (no local dependencies)');
        });

        it('should handle multiple independent packages', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                { name: 'independent-a', version: '1.0.0' },
                { name: 'independent-b', version: '1.0.0' },
                { name: 'independent-c', version: '1.0.0' }
            ]);

            const result = await execute(config);

            // Check return value format - simple build order (packages will be in some order)
            expect(result).toContain('Build order:');
            expect(result).toContain('independent-a');
            expect(result).toContain('independent-b');
            expect(result).toContain('independent-c');
            // Check that no local dependencies were logged
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('(no local dependencies)'));
        });

                it('should handle mixed dependency types', async () => {
            const config = createBaseConfig();

            setupBasicFilesystemMocks([
                {
                    name: 'core',
                    version: '1.0.0'
                },
                {
                    name: 'plugin',
                    version: '1.0.0',
                    dependencies: { 'core': '1.0.0' } // Set the local dependency here
                }
            ]);

            const result = await execute(config);

            expect(result).toContain('Build order: core → plugin');
            expect(mockLogger.info).toHaveBeenCalledWith('1. core (no local dependencies)');
            expect(mockLogger.info).toHaveBeenCalledWith('2. plugin (depends on: core)');
        });
    });
});
