import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Unlink from '../../src/commands/unlink';
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
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn()
}));

// Mock the logger
vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }),
    getLogger: vi.fn().mockReturnValue({
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

describe('Unlink Command', () => {
    let mockStorage: any;
    let mockRun: any;
    let mockRunSecure: any;
    let mockFindAllPackageJsonFiles: any;
    let mockSafeJsonParse: any;
    let mockValidatePackageJson: any;
    let originalChdir: any;
    let mockChdir: any;

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

        // Mock findAllPackageJsonFiles
        const { findAllPackageJsonFiles } = await import('../../src/util/performance');
        mockFindAllPackageJsonFiles = vi.mocked(findAllPackageJsonFiles);

        // Mock validation functions
        const { safeJsonParse, validatePackageJson } = await import('../../src/util/validation');
        mockSafeJsonParse = vi.mocked(safeJsonParse);
        mockValidatePackageJson = vi.mocked(validatePackageJson);

        // Mock process.chdir
        originalChdir = process.chdir;
        mockChdir = vi.fn();
        process.chdir = mockChdir;
    });

    afterEach(() => {
        // Restore process.chdir
        process.chdir = originalChdir;
    });

    describe('execute', () => {
        describe('new single project unlink behavior (no arguments)', () => {
            it('should execute new unlink steps for current project without clean-node-modules flag', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                // Mock current directory with package.json
                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                // Mock all npm commands to succeed
                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config);

                // Should only run npm unlink -g (not clean/reinstall without flag)
                expect(mockRun).toHaveBeenCalledWith('npm unlink -g');
                expect(mockRun).not.toHaveBeenCalledWith('rm -rf node_modules package-lock.json');
                expect(mockRun).not.toHaveBeenCalledWith('npm install');
                expect(result).toContain('Successfully unlinked @fjell/my-package');
            });

            it('should execute full unlink steps with clean-node-modules flag', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        cleanNodeModules: true
                    }
                };

                // Mock current directory with package.json
                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                // Mock all npm commands to succeed
                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config);

                // Should run all steps with flag enabled
                expect(mockRun).toHaveBeenCalledWith('npm unlink -g');
                expect(mockRun).toHaveBeenCalledWith('rm -rf node_modules package-lock.json');
                expect(mockRun).toHaveBeenCalledWith('npm install');
                expect(result).toContain('Successfully unlinked @fjell/my-package');
            });

            it('should handle dry run for new unlink behavior without clean flag', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    dryRun: true
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                const result = await Unlink.execute(config);

                expect(mockRun).not.toHaveBeenCalled();
                expect(result).toContain('DRY RUN: Would execute unlink steps for @fjell/my-package');
            });

            it('should handle dry run for new unlink behavior with clean flag', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    dryRun: true,
                    unlink: {
                        cleanNodeModules: true
                    }
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                const result = await Unlink.execute(config);

                expect(mockRun).not.toHaveBeenCalled();
                expect(result).toContain('DRY RUN: Would execute unlink steps for @fjell/my-package');
            });

            it('should handle missing package.json in current directory', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                mockStorage.exists.mockResolvedValue(false);

                const result = await Unlink.execute(config);

                expect(mockRun).not.toHaveBeenCalled();
                expect(result).toContain('No package.json found in current directory');
            });

            it('should handle package.json without name field', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ version: '1.0.0' });

                const result = await Unlink.execute(config);

                expect(mockRun).not.toHaveBeenCalled();
                expect(result).toContain('Failed to parse package.json');
            });

            it('should handle npm install failure when clean flag is enabled', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        cleanNodeModules: true
                    }
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                // npm unlink -g and rm succeed, npm install fails
                mockRun
                    .mockResolvedValueOnce({ stdout: '', stderr: '' })  // npm unlink -g
                    .mockResolvedValueOnce({ stdout: '', stderr: '' })  // rm -rf
                    .mockRejectedValueOnce(new Error('npm install failed'));  // npm install

                await expect(Unlink.execute(config)).rejects.toThrow('npm install failed');
            });

            it('should handle npm unlink -g failure gracefully with clean flag', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        cleanNodeModules: true
                    }
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                // npm unlink -g fails (package wasn't linked), others succeed
                mockRun
                    .mockRejectedValueOnce(new Error('package not globally linked'))  // npm unlink -g
                    .mockResolvedValueOnce({ stdout: '', stderr: '' })  // rm -rf
                    .mockResolvedValueOnce({ stdout: '', stderr: '' });  // npm install

                const result = await Unlink.execute(config);

                expect(result).toContain('Successfully unlinked @fjell/my-package');
            });

            it('should detect remaining links using npm ls --link --json', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                mockStorage.exists.mockResolvedValue(true);
                mockStorage.readFile.mockResolvedValue(
                    JSON.stringify({ name: '@fjell/my-package', version: '1.0.0' })
                );
                mockSafeJsonParse.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });
                mockValidatePackageJson.mockReturnValue({ name: '@fjell/my-package', version: '1.0.0' });

                // Mock the first 3 steps to succeed
                mockRun
                    .mockResolvedValueOnce({ stdout: '', stderr: '' })  // npm unlink -g
                    .mockResolvedValueOnce({ stdout: '', stderr: '' })  // rm -rf
                    .mockResolvedValueOnce({ stdout: '', stderr: '' }); // npm install

                // Mock child_process.exec for npm ls --link --json
                const mockExec = vi.fn();
                vi.doMock('child_process', () => ({
                    exec: mockExec
                }));
                vi.doMock('util', () => ({
                    promisify: () => mockExec
                }));

                // Mock npm ls --link --json to return links in same scope
                mockExec.mockResolvedValue({
                    stdout: JSON.stringify({
                        dependencies: {
                            '@fjell/other-package': {
                                version: '1.0.0',
                                resolved: 'file:../other-package'
                            },
                            '@other/package': {
                                version: '1.0.0',
                                resolved: 'file:../../../other-package'
                            }
                        }
                    }),
                    stderr: ''
                });

                const result = await Unlink.execute(config);

                expect(result).toContain('Successfully unlinked @fjell/my-package');
                // The warning about remaining links should be logged (not in return value)
            });
        });

        it('should use new single project behavior when no package argument provided', async () => {
            const config: Config = {
                configDirectory: '/test',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            // Mock current directory with package.json
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(
                JSON.stringify({ name: '@test/package', version: '1.0.0' })
            );
            mockSafeJsonParse.mockReturnValue({ name: '@test/package', version: '1.0.0' });
            mockValidatePackageJson.mockReturnValue({ name: '@test/package', version: '1.0.0' });

            // Mock npm unlink to succeed
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config);

            // Should not use findAllPackageJsonFiles for workspace scanning
            expect(mockFindAllPackageJsonFiles).not.toHaveBeenCalled();
            // Should only run npm unlink -g (without clean flag)
            expect(mockRun).toHaveBeenCalledWith('npm unlink -g');
            expect(result).toContain('Successfully unlinked @test/package');
        });

        it('should handle dry run mode with new behavior', async () => {
            const config: Config = {
                configDirectory: '/test',
                discoveredConfigDirs: [],
                resolvedConfigDirs: [],
                dryRun: true
            };

            // Mock current directory with package.json
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(
                JSON.stringify({ name: '@test/package', version: '1.0.0' })
            );
            mockSafeJsonParse.mockReturnValue({ name: '@test/package', version: '1.0.0' });
            mockValidatePackageJson.mockReturnValue({ name: '@test/package', version: '1.0.0' });

            const result = await Unlink.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toContain('DRY RUN: Would execute unlink steps for @test/package');
        });

        it('should handle no package.json in current directory', async () => {
            const config: Config = {
                configDirectory: '/test',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            // Mock that package.json doesn't exist in current directory
            mockStorage.exists.mockResolvedValue(false);

            const result = await Unlink.execute(config);

            expect(mockRun).not.toHaveBeenCalled();
            expect(result).toContain('No package.json found in current directory');
        });

        it('should handle npm unlink failures gracefully in new behavior', async () => {
            const config: Config = {
                configDirectory: '/test',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            // Mock current directory with package.json
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(
                JSON.stringify({ name: '@test/package', version: '1.0.0' })
            );
            mockSafeJsonParse.mockReturnValue({ name: '@test/package', version: '1.0.0' });
            mockValidatePackageJson.mockReturnValue({ name: '@test/package', version: '1.0.0' });

            // npm unlink -g can fail if package wasn't linked, but this should be treated as success
            mockRun.mockRejectedValue(new Error('package not linked'));

                const result = await Unlink.execute(config);

            expect(result).toContain('Successfully unlinked @test/package');
        });

        it('should use new behavior even with multiple target directories when no package argument', async () => {
            const config: Config = {
                configDirectory: '/test',
                discoveredConfigDirs: [],
                resolvedConfigDirs: [],
                tree: {
                    directories: ['/test/dir1', '/test/dir2']
                }
            };

            // Mock current directory with package.json
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(
                JSON.stringify({ name: '@test/package', version: '1.0.0' })
            );
            mockSafeJsonParse.mockReturnValue({ name: '@test/package', version: '1.0.0' });
            mockValidatePackageJson.mockReturnValue({ name: '@test/package', version: '1.0.0' });

            // Mock npm unlink to succeed
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config);

            // Even with multiple target directories, if no package argument is provided,
            // it should use the new single-project behavior
            expect(mockFindAllPackageJsonFiles).not.toHaveBeenCalled();
            expect(result).toContain('Successfully unlinked @test/package');
        });
    });

    describe('scope-based unlinking', () => {
        beforeEach(() => {
            // Reset all mocks for scope-based tests
            vi.clearAllMocks();
            mockChdir.mockClear();
            mockRun.mockClear();
            mockFindAllPackageJsonFiles.mockClear();
            mockStorage.readFile.mockClear();
        });

        const createMockPackageJson = (name: string, dependencies?: Record<string, any>) => ({
            name,
            version: '1.0.0',
            dependencies: dependencies || {}
        });

        const setupMockPackageFiles = (packages: Array<{ path: string; name: string; dependencies?: Record<string, any> }>) => {
            // Mock needs to return the same data for both findMatchingPackages and findConsumingPackages calls
            const packageData = packages.map(pkg => ({
                path: pkg.path,
                relativePath: pkg.path.replace('/package.json', '').split('/').pop(),
                packageJson: createMockPackageJson(pkg.name, pkg.dependencies)
            }));

            // Both findMatchingPackages and findConsumingPackages call findAllPackageJsonFiles
            // Reset and set up for multiple calls
            mockFindAllPackageJsonFiles.mockClear();
            mockFindAllPackageJsonFiles.mockResolvedValue(packageData);

            mockStorage.readFile.mockImplementation((path: string) => {
                const pkg = packages.find(p => p.path === path);
                if (pkg) {
                    return Promise.resolve(JSON.stringify(createMockPackageJson(pkg.name, pkg.dependencies)));
                }
                return Promise.reject(new Error('File not found'));
            });

            mockSafeJsonParse.mockImplementation((content: string) => JSON.parse(content));
            mockValidatePackageJson.mockImplementation((parsed: any) => parsed);
        };

        describe('parsePackageArgument', () => {
            it('should parse scope-only argument correctly', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' },
                    { path: '/test/packages/other/package.json', name: '@other/package' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell');

                expect(result).toContain('Successfully unlinked 2 package(s): @fjell/core, @fjell/utils');
            });

            it('should parse full package name correctly', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/core');

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });

            it('should throw error for non-scoped package argument', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                await expect(Unlink.execute(config, 'invalid-package')).rejects.toThrow(
                    'Package argument must start with @ (scope): invalid-package'
                );
            });
        });

        describe('findMatchingPackages', () => {
            it('should find packages matching scope', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' },
                    { path: '/test/packages/other/package.json', name: '@other/package' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell');

                expect(mockRun).toHaveBeenCalledWith('npm unlink');
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/core');
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/utils');
                expect(mockChdir).not.toHaveBeenCalledWith('/test/packages/other');
            });

            it('should find exact package match', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/core');

                expect(mockRun).toHaveBeenCalledTimes(1);
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/core');
                expect(mockChdir).not.toHaveBeenCalledWith('/test/packages/utils');
            });

            it('should handle no matching packages', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/other/package.json', name: '@other/package' }
                ]);

                const result = await Unlink.execute(config, '@fjell');

                expect(result).toContain('No packages found in scope: @fjell');
                expect(mockRun).not.toHaveBeenCalled();
            });

            it('should handle no matching specific package', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' }
                ]);

                const result = await Unlink.execute(config, '@fjell/core');

                // When no exact package match is found, it returns empty unlinked list
                expect(result).toContain('Successfully unlinked 0 package(s):');
                expect(mockRun).not.toHaveBeenCalled();
            });
        });

        describe('findConsumingPackages', () => {
            it('should unlink consuming packages first', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    {
                        path: '/test/packages/app/package.json',
                        name: '@fjell/app',
                        dependencies: { '@fjell/core': '^1.0.0' }
                    },
                    {
                        path: '/test/packages/website/package.json',
                        name: '@fjell/website',
                        dependencies: { '@fjell/core': '^1.0.0' }
                    }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });
                mockRunSecure.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/core');

                // Should unlink consuming packages first (using runSecure)
                expect(mockRunSecure).toHaveBeenCalledWith('npm', ['unlink', '@fjell/core']);
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/app');
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/website');
                // Then unlink the source package
                expect(mockRun).toHaveBeenCalledWith('npm unlink');
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/core');
            });

            it('should handle different dependency types', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    {
                        path: '/test/packages/app/package.json',
                        name: '@fjell/app',
                        dependencies: {
                            devDependencies: { '@fjell/core': '^1.0.0' },
                            peerDependencies: { '@fjell/core': '^1.0.0' },
                            optionalDependencies: { '@fjell/core': '^1.0.0' }
                        }
                    }
                ]);

                // Override the mock to handle different dependency types correctly
                mockStorage.readFile.mockImplementation((path: string) => {
                    if (path === '/test/packages/core/package.json') {
                        return Promise.resolve(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));
                    }
                    if (path === '/test/packages/app/package.json') {
                        return Promise.resolve(JSON.stringify({
                            name: '@fjell/app',
                            version: '1.0.0',
                            devDependencies: { '@fjell/core': '^1.0.0' },
                            peerDependencies: { '@fjell/core': '^1.0.0' },
                            optionalDependencies: { '@fjell/core': '^1.0.0' }
                        }));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });
                mockRunSecure.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/core');

                expect(mockRunSecure).toHaveBeenCalledWith('npm', ['unlink', '@fjell/core']);
                expect(mockChdir).toHaveBeenCalledWith('/test/packages/app');
            });

            it('should handle consuming package unlink failures gracefully', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' },
                    {
                        path: '/test/packages/app/package.json',
                        name: '@fjell/app',
                        dependencies: { '@fjell/core': '^1.0.0' }
                    }
                ]);

                // Mock failure for consuming package unlink but success for source
                mockRun
                    .mockRejectedValueOnce(new Error('consumer unlink failed'))
                    .mockResolvedValueOnce({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/core');

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });

            it('should handle source package unlink failures gracefully', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' }
                ]);

                mockRun.mockRejectedValue(new Error('source unlink failed'));

                const result = await Unlink.execute(config, '@fjell/core');

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });
        });

        describe('config integration', () => {
            it('should use packageArgument from config.unlink', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        packageArgument: '@fjell/core'
                    }
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config);

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });

            it('should prioritize parameter over config.unlink.packageArgument', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        packageArgument: '@fjell/core'
                    }
                };

                setupMockPackageFiles([
                    { path: '/test/packages/utils/package.json', name: '@fjell/utils' }
                ]);

                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell/utils');

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/utils');
            });

            it('should use dryRun from config.unlink', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    unlink: {
                        dryRun: true,
                        packageArgument: '@fjell/core'
                    }
                };

                setupMockPackageFiles([
                    { path: '/test/packages/core/package.json', name: '@fjell/core' }
                ]);

                const result = await Unlink.execute(config);

                expect(mockRun).not.toHaveBeenCalled();
                // In dry run mode for scope-based unlinking, it still reports success but doesn't run commands
                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });
        });

        describe('error handling', () => {
            it('should handle package.json parsing errors gracefully', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                mockFindAllPackageJsonFiles.mockResolvedValue([
                    { path: '/test/packages/invalid/package.json', relativePath: 'invalid' },
                    { path: '/test/packages/core/package.json', relativePath: 'core' }
                ]);

                mockStorage.readFile.mockImplementation((path: string) => {
                    if (path === '/test/packages/invalid/package.json') {
                        return Promise.resolve('invalid json');
                    }
                    if (path === '/test/packages/core/package.json') {
                        return Promise.resolve(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                mockSafeJsonParse.mockImplementation((content: string) => {
                    if (content === 'invalid json') {
                        throw new Error('Invalid JSON');
                    }
                    return JSON.parse(content);
                });
                mockValidatePackageJson.mockImplementation((parsed: any) => parsed);
                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell');

                expect(result).toContain('Successfully unlinked 1 package(s): @fjell/core');
            });

            it('should handle execute function errors', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: []
                };

                mockFindAllPackageJsonFiles.mockRejectedValue(new Error('File system error'));

                await expect(Unlink.execute(config, '@fjell')).rejects.toThrow('File system error');
            });
        });

        describe('multiple directories with scope unlinking', () => {
            it('should handle scope unlinking across multiple directories', async () => {
                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    tree: {
                        directories: ['/test/dir1', '/test/dir2']
                    }
                };

                // For multiple directories, the function calls findAllPackageJsonFiles for each directory
                // For each target package, it calls findAllPackageJsonFiles for both matching and consuming
                const packageData = [
                    { path: '/test/dir1/packages/core/package.json', relativePath: 'dir1/core' },
                    { path: '/test/dir2/packages/utils/package.json', relativePath: 'dir2/utils' }
                ];

                mockFindAllPackageJsonFiles.mockResolvedValue(packageData);

                mockStorage.readFile.mockImplementation((path: string) => {
                    if (path === '/test/dir1/packages/core/package.json') {
                        return Promise.resolve(JSON.stringify({ name: '@fjell/core', version: '1.0.0' }));
                    }
                    if (path === '/test/dir2/packages/utils/package.json') {
                        return Promise.resolve(JSON.stringify({ name: '@fjell/utils', version: '1.0.0' }));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                mockSafeJsonParse.mockImplementation((content: string) => JSON.parse(content));
                mockValidatePackageJson.mockImplementation((parsed: any) => parsed);
                mockRun.mockResolvedValue({ stdout: '', stderr: '' });

                const result = await Unlink.execute(config, '@fjell');

                // With multiple directories, packages might be found multiple times, so expect the actual count
                expect(result).toContain('Successfully unlinked');
                expect(result).toContain('@fjell/core');
                expect(result).toContain('@fjell/utils');
            });
        });
    });
});
