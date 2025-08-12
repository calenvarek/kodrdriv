import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Link from '../../src/commands/link';
import { Config } from '../../src/types';
import * as Storage from '../../src/util/storage';
import * as Child from '../../src/util/child';

// Mock the storage module
vi.mock('../../src/util/storage', () => ({
    create: vi.fn()
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn(),
}));

// Mock fs/promises with proper module structure
vi.mock('fs/promises', () => {
    const mockMkdir = vi.fn();
    const mockUnlink = vi.fn();
    const mockSymlink = vi.fn();
    const mockReadlink = vi.fn();
    const mockLstat = vi.fn();
    const mockRm = vi.fn();

    return {
        default: {
            mkdir: mockMkdir,
            unlink: mockUnlink,
            symlink: mockSymlink,
            readlink: mockReadlink,
            lstat: mockLstat,
            rm: mockRm
        },
        mkdir: mockMkdir,
        unlink: mockUnlink,
        symlink: mockSymlink,
        readlink: mockReadlink,
        lstat: mockLstat,
        rm: mockRm
    };
});

// Mock the logger
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }),
    getDryRunLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    })
}));

// Mock the performance module
vi.mock('../../src/util/performance');

// Mock the validation module
vi.mock('../../src/util/validation', () => ({
    safeJsonParse: vi.fn(),
    validatePackageJson: vi.fn()
}));

describe('Link Command', () => {
    let mockStorage: any;
    let mockRun: any;
    let mockRunSecure: any;
    let mockFindAllPackageJsonFiles: any;
    let mockSafeJsonParse: any;
    let mockValidatePackageJson: any;
    let mockFs: any;

    // Helper function to create base config with required properties
    const createBaseConfig = (overrides: Partial<Config> = {}): Config => ({
        configDirectory: '/test/config',
        discoveredConfigDirs: ['/test/config'],
        resolvedConfigDirs: ['/test/config'],
        ...overrides
    });

    beforeEach(async () => {
        vi.clearAllMocks();

        // Mock storage
        mockStorage = {
            exists: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            deleteFile: vi.fn()
        };
        (Storage.create as any).mockReturnValue(mockStorage);

        // Mock child.run and runSecure
        mockRun = vi.mocked(Child.run);
        mockRunSecure = vi.mocked(Child.runSecure);

        // Mock fs/promises
        const fs = await import('fs/promises');
        mockFs = {
            mkdir: vi.mocked(fs.default.mkdir),
            unlink: vi.mocked(fs.default.unlink),
            symlink: vi.mocked(fs.default.symlink),
            readlink: vi.mocked(fs.default.readlink),
            lstat: vi.mocked(fs.default.lstat),
            rm: vi.mocked(fs.default.rm)
        };

        // Mock findAllPackageJsonFiles
        const { findAllPackageJsonFiles } = await import('../../src/util/performance');
        mockFindAllPackageJsonFiles = vi.mocked(findAllPackageJsonFiles);

        // Mock validation functions
        const { safeJsonParse, validatePackageJson } = await import('../../src/util/validation');
        mockSafeJsonParse = vi.mocked(safeJsonParse);
        mockValidatePackageJson = vi.mocked(validatePackageJson);
    });

    describe('execute with no arguments (smart same-scope linking)', () => {
        beforeEach(() => {
            // Setup default JSON parsing mocks
            mockSafeJsonParse.mockImplementation((content: string) => JSON.parse(content));
            mockValidatePackageJson.mockImplementation((parsed: any) => parsed);
        });

        it('should self-link and link same-scope dependencies that are globally available', async () => {
            const config = createBaseConfig({
                verbose: true,
                debug: true
            });

            // Mock current directory package.json
            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0',
                        '@fjell/utils': '^1.0.0',
                        'lodash': '^4.0.0'
                    },
                    devDependencies: {
                        '@fjell/dev-tools': '^1.0.0'
                    }
                }))
                // Mock package.json files for linked packages
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/utils', version: '1.0.0' }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/dev-tools', version: '1.0.0' }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@other/package', version: '1.0.0' }));

            // Mock npm ls --link -g -p output with directory paths
            const mockDirectoryPaths = [
                '/Users/global/node_modules/@fjell/core',
                '/Users/global/node_modules/@fjell/utils',
                '/Users/global/node_modules/@fjell/dev-tools',
                '/Users/global/node_modules/@other/package'
            ].join('\n');

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: mockDirectoryPaths,
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat.mockRejectedValue({ code: 'ENOENT' }); // Nothing exists at target paths
            mockFs.symlink.mockResolvedValue(undefined);

                        const result = await Link.execute(config);

            expect(mockRun).toHaveBeenCalledWith('npm link'); // Self-link
            expect(mockRun).toHaveBeenCalledWith('npm ls --link -g -p'); // Discover global links
            expect(mockRun).toHaveBeenCalledTimes(2); // Only self-link and discovery, no npm link commands

            // Debug: check what was actually called
            console.log('mockFs.symlink.mock.calls:', mockFs.symlink.mock.calls);

            // Check that symlinks were created with correct relative paths (calculated from absolute directory paths)
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/core'), expect.stringContaining('node_modules/@fjell/core'), 'dir');
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/utils'), expect.stringContaining('node_modules/@fjell/utils'), 'dir');
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/dev-tools'), expect.stringContaining('node_modules/@fjell/dev-tools'), 'dir');
            expect(mockFs.symlink).toHaveBeenCalledTimes(3);

            expect(result).toContain('Self-linked @fjell/my-app and linked 3 same-scope dependencies: @fjell/core, @fjell/utils, @fjell/dev-tools');
        });

        it('should handle case with no same-scope dependencies', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0',
                dependencies: {
                    'lodash': '^4.0.0',
                    'express': '^4.0.0'
                }
            }));

            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await Link.execute(config);

            expect(mockRun).toHaveBeenCalledWith('npm link'); // Self-link only
            expect(mockRun).toHaveBeenCalledTimes(1);
            expect(result).toBe('Self-linked @fjell/my-app, no same-scope dependencies to link');
        });

        it('should handle case where same-scope dependencies are not globally linked', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0',
                dependencies: {
                    '@fjell/core': '^1.0.0',
                    '@fjell/utils': '^1.0.0'
                }
            }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({
                        dependencies: {
                            '@other/package': {
                                version: '1.0.0',
                                resolved: 'file:../../../other-package'
                            }
                        }
                    }),
                    stderr: ''
                }); // npm ls --link -g --json (no @fjell packages)

            // Mock fs operations (should not be called since no same-scope deps are available)
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });
            mockFs.symlink.mockResolvedValue(undefined);

            const result = await Link.execute(config);

            expect(mockRun).toHaveBeenCalledWith('npm link'); // Self-link
            expect(mockRun).toHaveBeenCalledWith('npm ls --link -g -p'); // Discover global links
            expect(mockRun).toHaveBeenCalledTimes(2); // No additional linking
            expect(mockFs.symlink).not.toHaveBeenCalled(); // No symlinks created
            expect(result).toBe('Self-linked @fjell/my-app, no same-scope dependencies were available to link');
        });

        it('should fix existing symlinks that point to wrong targets', async () => {
            const config = createBaseConfig();

            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0'
                    }
                }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: '/Users/global/node_modules/@fjell/core',
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations - lstat shows symlink, readlink returns wrong target, then we fix it
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat.mockResolvedValueOnce({
                isSymbolicLink: () => true,
                isDirectory: () => false
            }); // Target is a symlink
            mockFs.readlink.mockResolvedValueOnce('../../../wrong-path'); // Existing symlink points to wrong target
            mockFs.unlink.mockResolvedValueOnce(undefined); // Remove wrong symlink
            mockFs.symlink.mockResolvedValueOnce(undefined); // Create correct symlink

            const result = await Link.execute(config);

            // Check that we read the existing symlink
            expect(mockFs.readlink).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));

            // Check that we removed the wrong symlink and created the correct one
            expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/core'), expect.stringContaining('node_modules/@fjell/core'), 'dir');

            expect(result).toBe('Self-linked @fjell/my-app and linked 1 same-scope dependencies: @fjell/core');
        });

        it('should leave existing symlinks that point to correct targets', async () => {
            const config = createBaseConfig();

            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0'
                    }
                }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: '/Users/global/node_modules/@fjell/core',
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations - lstat shows symlink, readlink returns correct target
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat.mockResolvedValueOnce({
                isSymbolicLink: () => true,
                isDirectory: () => false
            }); // Target is a symlink
            mockFs.readlink.mockResolvedValueOnce('../../../../../../global/node_modules/@fjell/core'); // Existing symlink points to correct target

            const result = await Link.execute(config);

            // Check that we read the existing symlink
            expect(mockFs.readlink).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));

            // Check that we did NOT remove or recreate the symlink
            expect(mockFs.unlink).not.toHaveBeenCalled();
            expect(mockFs.symlink).not.toHaveBeenCalled();

            expect(result).toBe('Self-linked @fjell/my-app and linked 1 same-scope dependencies: @fjell/core');
        });

        it('should remove existing directory and create symlink', async () => {
            const config = createBaseConfig();

            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0'
                    }
                }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: '/Users/global/node_modules/@fjell/core',
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations - lstat shows directory exists
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat.mockResolvedValueOnce({
                isSymbolicLink: () => false,
                isDirectory: () => true
            }); // Target is a directory
            mockFs.rm.mockResolvedValueOnce(undefined); // Remove directory
            mockFs.symlink.mockResolvedValueOnce(undefined); // Create symlink

            const result = await Link.execute(config);

            // Check that we detected the directory and removed it
            expect(mockFs.lstat).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));
            expect(mockFs.rm).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'), { recursive: true, force: true });
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/core'), expect.stringContaining('node_modules/@fjell/core'), 'dir');

            expect(result).toBe('Self-linked @fjell/my-app and linked 1 same-scope dependencies: @fjell/core');
        });

        it('should remove existing file and create symlink', async () => {
            const config = createBaseConfig();

            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0'
                    }
                }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: '/Users/global/node_modules/@fjell/core',
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations - lstat shows file exists
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat.mockResolvedValueOnce({
                isSymbolicLink: () => false,
                isDirectory: () => false
            }); // Target is a file
            mockFs.unlink.mockResolvedValueOnce(undefined); // Remove file
            mockFs.symlink.mockResolvedValueOnce(undefined); // Create symlink

            const result = await Link.execute(config);

            // Check that we detected the file and removed it
            expect(mockFs.lstat).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));
            expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('node_modules/@fjell/core'));
            expect(mockFs.symlink).toHaveBeenCalledWith(expect.stringContaining('global/node_modules/@fjell/core'), expect.stringContaining('node_modules/@fjell/core'), 'dir');

            expect(result).toBe('Self-linked @fjell/my-app and linked 1 same-scope dependencies: @fjell/core');
        });

        it('should handle partial linking failures gracefully', async () => {
            const config = createBaseConfig();

            mockStorage.readFile
                .mockResolvedValueOnce(JSON.stringify({
                    name: '@fjell/my-app',
                    version: '1.0.0',
                    dependencies: {
                        '@fjell/core': '^1.0.0',
                        '@fjell/utils': '^1.0.0'
                    }
                }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }))
                .mockResolvedValueOnce(JSON.stringify({ name: '@fjell/utils', version: '1.0.0' }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockResolvedValueOnce({
                    stdout: '/Users/global/node_modules/@fjell/core\n/Users/global/node_modules/@fjell/utils',
                    stderr: ''
                }); // npm ls --link -g -p

            // Mock fs operations - first succeeds, second fails
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.lstat
                .mockRejectedValueOnce({ code: 'ENOENT' }) // @fjell/core doesn't exist initially
                .mockRejectedValueOnce({ code: 'ENOENT' }); // @fjell/utils doesn't exist initially
            mockFs.symlink
                .mockResolvedValueOnce(undefined) // @fjell/core succeeds
                .mockRejectedValueOnce(new Error('symlink failed')); // @fjell/utils fails

            const result = await Link.execute(config);

            expect(result).toBe('Self-linked @fjell/my-app and linked 1 same-scope dependencies: @fjell/core');
        });

        it('should handle non-scoped packages', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: 'my-app',
                version: '1.0.0',
                dependencies: {
                    'lodash': '^4.0.0'
                }
            }));

            const result = await Link.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toBe('Current package must have a scoped name (e.g., @scope/package) for smart linking');
        });

        it('should handle missing package.json', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

            const result = await Link.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toContain('No valid package.json found in current directory');
        });

        it('should handle package.json without name', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                version: '1.0.0'
            }));

            const result = await Link.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toBe('package.json must have a name field');
        });

        it('should handle dry run mode', async () => {
            const config = createBaseConfig({
                dryRun: true
            });

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0',
                dependencies: {
                    '@fjell/core': '^1.0.0',
                    '@fjell/utils': '^1.0.0'
                }
            }));

            const result = await Link.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toBe('DRY RUN: Would self-link and attempt to link 2 same-scope dependencies');
        });

        it('should handle dry run mode with no same-scope dependencies', async () => {
            const config = createBaseConfig({
                dryRun: true
            });

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0',
                dependencies: {
                    'lodash': '^4.0.0'
                }
            }));

            const result = await Link.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toBe('DRY RUN: Would self-link, no same-scope dependencies found to link');
        });

        it('should handle npm ls command failure gracefully', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0',
                dependencies: {
                    '@fjell/core': '^1.0.0'
                }
            }));

            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // npm link (self-link)
                .mockRejectedValueOnce(new Error('npm ls failed')); // npm ls --link -g --json fails

            const result = await Link.execute(config);

            expect(result).toBe('Self-linked @fjell/my-app, no same-scope dependencies were available to link');
        });

        it('should handle self-linking failure', async () => {
            const config = createBaseConfig();

            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@fjell/my-app',
                version: '1.0.0'
            }));

            mockRun.mockRejectedValue(new Error('npm link failed'));

            await expect(Link.execute(config)).rejects.toThrow('Failed to self-link @fjell/my-app: npm link failed');
        });
    });

    describe('scope-based linking', () => {
        beforeEach(() => {
            // Setup default JSON parsing mocks
            mockSafeJsonParse.mockImplementation((content: string) => JSON.parse(content));
            mockValidatePackageJson.mockImplementation((parsed: any) => parsed);
        });

        describe('package argument parsing', () => {
            it('should parse scope-only arguments correctly', async () => {
                const config = createBaseConfig();

                // Mock package discovery to find packages in scope
                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/packages/utils/package.json',
                        relativePath: 'packages/utils'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/utils", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell');

                    expect(result).toContain('Successfully linked 2 package(s): @fjell/core, @fjell/utils');
                    expect(mockRun).toHaveBeenCalledWith('npm link');
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should parse specific package arguments correctly', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/packages/utils/package.json',
                        relativePath: 'packages/utils'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/utils", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell/core');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).toHaveBeenCalledWith('npm link');
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should throw error for invalid package arguments', async () => {
                const config = createBaseConfig();

                await expect(Link.execute(config, 'invalid-package')).rejects.toThrow(
                    'Package argument must start with @ (scope): invalid-package'
                );
            });
        });

        describe('package discovery', () => {
            it('should find packages in scope', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/packages/utils/package.json',
                        relativePath: 'packages/utils'
                    },
                    {
                        path: '/test/packages/other/package.json',
                        relativePath: 'packages/other'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/utils", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@other/package", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell');

                    expect(result).toContain('Successfully linked 2 package(s): @fjell/core, @fjell/utils');
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should handle no matching packages found', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/other/package.json',
                        relativePath: 'packages/other'
                    }
                ]);

                mockStorage.readFile.mockResolvedValue('{"name": "@other/package", "version": "1.0.0"}');

                const result = await Link.execute(config, '@fjell');

                expect(result).toBe('No packages found in scope: @fjell');
                expect(mockRun).not.toHaveBeenCalled();
            });

            it('should handle no specific package found', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/utils/package.json',
                        relativePath: 'packages/utils'
                    }
                ]);

                mockStorage.readFile.mockResolvedValue('{"name": "@fjell/utils", "version": "1.0.0"}');

                const result = await Link.execute(config, '@fjell/core');

                // When no specific package matches, it processes an empty array and returns successfully with 0 packages
                expect(result).toBe('Successfully linked 0 package(s): ');
                expect(mockRun).not.toHaveBeenCalled();
            });

            it('should handle packages without names', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/invalid/package.json',
                        relativePath: 'packages/invalid'
                    },
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"version": "1.0.0"}') // No name field
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should handle malformed package.json files', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/malformed/package.json',
                        relativePath: 'packages/malformed'
                    },
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('invalid json')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                mockSafeJsonParse
                    .mockImplementationOnce(() => { throw new Error('Invalid JSON'); })
                    .mockReturnValueOnce({ name: '@fjell/core', version: '1.0.0' });

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                } finally {
                    process.chdir = originalChdir;
                }
            });
        });

        describe('consuming packages', () => {
            it('should link consuming packages', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/apps/web/package.json',
                        relativePath: 'apps/web'
                    },
                    {
                        path: '/test/apps/api/package.json',
                        relativePath: 'apps/api'
                    }
                ]);

                // Mock multiple calls for source discovery and consuming discovery
                mockStorage.readFile
                    // First round: finding @fjell/core
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "web-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "api-app", "version": "1.0.0", "devDependencies": {"@fjell/core": "^1.0.0"}}')
                    // Second round: finding consuming packages
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "web-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "api-app", "version": "1.0.0", "devDependencies": {"@fjell/core": "^1.0.0"}}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });
                mockRunSecure.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell/core');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).toHaveBeenCalledWith('npm link'); // Source package
                    expect(mockRunSecure).toHaveBeenCalledWith('npm', ['link', '@fjell/core']); // Consumer packages
                    expect(mockRunSecure).toHaveBeenCalledTimes(2); // 2 consumers
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should handle no consuming packages', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/packages/utils/package.json',
                        relativePath: 'packages/utils'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/utils", "version": "1.0.0"}')
                    // Second round for consuming packages
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/utils", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell/core');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).toHaveBeenCalledWith('npm link');
                    expect(mockRun).toHaveBeenCalledTimes(1); // Only source package
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should check all dependency types', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/apps/dep/package.json',
                        relativePath: 'apps/dep'
                    },
                    {
                        path: '/test/apps/devDep/package.json',
                        relativePath: 'apps/devDep'
                    },
                    {
                        path: '/test/apps/peerDep/package.json',
                        relativePath: 'apps/peerDep'
                    },
                    {
                        path: '/test/apps/optDep/package.json',
                        relativePath: 'apps/optDep'
                    }
                ]);

                mockStorage.readFile
                    // First round: source discovery
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "dep-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "devdep-app", "version": "1.0.0", "devDependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "peerdep-app", "version": "1.0.0", "peerDependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "optdep-app", "version": "1.0.0", "optionalDependencies": {"@fjell/core": "^1.0.0"}}')
                    // Second round: consuming discovery
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "dep-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "devdep-app", "version": "1.0.0", "devDependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "peerdep-app", "version": "1.0.0", "peerDependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "optdep-app", "version": "1.0.0", "optionalDependencies": {"@fjell/core": "^1.0.0"}}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });
                mockRunSecure.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell/core');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).toHaveBeenCalledWith('npm link'); // Source
                    expect(mockRunSecure).toHaveBeenCalledWith('npm', ['link', '@fjell/core']); // Consumers
                    expect(mockRunSecure).toHaveBeenCalledTimes(4); // 4 consumers
                } finally {
                    process.chdir = originalChdir;
                }
            });
        });

        describe('dry run mode for scope-based linking', () => {
            it('should handle dry run with scope argument', async () => {
                const config = createBaseConfig({
                    dryRun: true
                });

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).not.toHaveBeenCalled();
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should handle dry run with link config option', async () => {
                const config = createBaseConfig({
                    link: {
                        dryRun: true,
                        packageArgument: '@fjell'
                    }
                });

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config);

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                    expect(mockRun).not.toHaveBeenCalled();
                } finally {
                    process.chdir = originalChdir;
                }
            });
        });

        describe('error handling', () => {
            it('should handle source package linking failure', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile.mockResolvedValue('{"name": "@fjell/core", "version": "1.0.0"}');
                mockRun.mockRejectedValue(new Error('npm link failed'));

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    await expect(Link.execute(config, '@fjell/core')).rejects.toThrow(
                        'Failed to link source package @fjell/core: npm link failed'
                    );
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should handle consumer package linking failure', async () => {
                const config = createBaseConfig();

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    },
                    {
                        path: '/test/apps/web/package.json',
                        relativePath: 'apps/web'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "web-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "web-app", "version": "1.0.0", "dependencies": {"@fjell/core": "^1.0.0"}}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' }); // Source succeeds
                mockRunSecure.mockRejectedValue(new Error('consumer link failed')); // Consumer fails

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    await expect(Link.execute(config, '@fjell/core')).rejects.toThrow(
                        'Failed to link @fjell/core in consumer web-app: consumer link failed'
                    );
                } finally {
                    process.chdir = originalChdir;
                }
            });
        });

        describe('configuration options', () => {
            it('should use packageArgument from config when not provided as parameter', async () => {
                const config = createBaseConfig({
                    link: {
                        packageArgument: '@fjell/core'
                    }
                });

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });
                mockRunSecure.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config);

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                } finally {
                    process.chdir = originalChdir;
                }
            });

            it('should prefer parameter over config packageArgument', async () => {
                const config = createBaseConfig({
                    link: {
                        packageArgument: '@other/package'
                    }
                });

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    {
                        path: '/test/packages/core/package.json',
                        relativePath: 'packages/core'
                    }
                ]);

                mockStorage.readFile
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}')
                    .mockResolvedValueOnce('{"name": "@fjell/core", "version": "1.0.0"}');

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const originalChdir = process.chdir;
                const mockChdir = vi.fn();
                process.chdir = mockChdir;

                try {
                    const result = await Link.execute(config, '@fjell/core');

                    expect(result).toContain('Successfully linked 1 package(s): @fjell/core');
                } finally {
                    process.chdir = originalChdir;
                }
            });
        });
    });
});
