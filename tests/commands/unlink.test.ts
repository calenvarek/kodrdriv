import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Unlink from '../../src/commands/unlink';
import { Config } from '../../src/types';
import { KODRDRIV_DEFAULTS } from '../../src/constants';
import * as Child from '../../src/util/child';
import path from 'path';

// Mock the path module to have consistent behavior
vi.mock('path', async () => {
    const actual = await vi.importActual('path') as any;
    return {
        ...actual,
        resolve: vi.fn((...args: string[]) => {
            if (args.length === 2 && args[1] === '../test-packages') {
                return (actual.resolve as any)('/mock/test-packages');
            }
            return actual.resolve(...args);
        }),
        join: actual.join,
        relative: vi.fn((from: string, to: string) => {
            const relPath = actual.relative(from, to);
            return relPath.replace(/\\/g, '/');
        })
    };
});

// Mock process.cwd
vi.stubGlobal('process', {
    ...process,
    cwd: vi.fn(() => '/mock/cwd')
});

// Mock the dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }),
    getDryRunLogger: vi.fn().mockImplementation((isDryRun: boolean) => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn(() => ({
        exists: vi.fn(),
        isDirectory: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        listFiles: vi.fn(),
    })),
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    unlink: vi.fn(),
    rm: vi.fn(),
}));

describe('Unlink Command', () => {
    let mockConfig: Config;
    let mockStorage: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.mocked(Child.run).mockClear();

        mockConfig = {
            ...KODRDRIV_DEFAULTS,
            discoveredConfigDirs: [],
            resolvedConfigDirs: [],
            link: {
                scopeRoots: { '@test': '../test-packages' },
                dryRun: false,
            },
        };

        mockStorage = {
            exists: vi.fn(),
            isDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            listFiles: vi.fn(),
            deleteFile: vi.fn(),
        };

        const storageModule = await import('../../src/util/storage');
        vi.mocked(storageModule.create).mockReturnValue(mockStorage);
    });

    it('should throw error when package.json not found', async () => {
        mockStorage.exists.mockResolvedValue(false);

        await expect(Unlink.execute(mockConfig)).rejects.toThrow('No package.json files found in current directory or subdirectories.');
    });

    it('should skip gracefully when no scope roots configured', async () => {
        const configWithoutScopes = {
            ...mockConfig,
            link: {
                ...mockConfig.link,
                scopeRoots: {},
            },
        };

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.readFile.mockResolvedValue('{"name": "test-package"}');

        const result = await Unlink.execute(configWithoutScopes);

        expect(result).toBe('No scope roots configured. Skipping link management.');
    });

    it('should clean up file: dependencies and verify cleanup', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a', 'package-b']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    dependencies: {
                        '@test/package-a': 'file:../test-packages/package-a',
                        '@other/package': '1.0.0'
                    }
                }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-b', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-b' }));
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toContain('Successfully cleaned up 1 linked dependencies and 0 other problematic dependencies across');

        const writeFileCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
        expect(writeFileCall[0]).toContain('package.json');
        const writtenPackageJson = JSON.parse(writeFileCall[1]);
        expect(writtenPackageJson.dependencies['@test/package-a']).toBe('^1.0.0');
        expect(writtenPackageJson.dependencies['@other/package']).toBe('1.0.0');
    });

    it('should clean up workspace configurations and overrides', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        let packageJsonData = {
            name: 'test-package',
            dependencies: {
                '@test/package-a': 'file:../test-packages/package-a'
            },
            workspaces: ['packages/*'],
            overrides: {
                '@test/package-a': 'file:../test-packages/package-a',
                'some-other-package': '1.0.0'
            },
            resolutions: {
                '@test/package-a': 'link:../test-packages/package-a'
            }
        };

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify(packageJsonData));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            return Promise.resolve('');
        });

        // Mock writeFile to capture the writes
        mockStorage.writeFile.mockImplementation((filePath: string, content: string) => {
            if (filePath.includes('package.json')) {
                const parsed = JSON.parse(content);
                // Verify that the cleanup happened correctly in the call
                expect(parsed.dependencies['@test/package-a']).toBe('^1.0.0'); // Restored
                expect(parsed.workspaces).toBeUndefined(); // Removed
                expect(parsed.overrides['@test/package-a']).toBeUndefined(); // Removed
                expect(parsed.overrides['some-other-package']).toBe('1.0.0'); // Preserved
                expect(parsed.resolutions).toBeUndefined(); // Removed entirely
            }
            return Promise.resolve();
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toContain('Successfully cleaned up 1 linked dependencies and 3 other problematic dependencies across');
    });

    it('should return message when no packages found for unlinking', async () => {
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve([]); // No packages found
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({})); // Empty backup
            }
            return Promise.resolve('');
        });

        const result = await Unlink.execute(mockConfig);

        expect(result).toBe('No packages found matching scope roots for unlinking and no problematic dependencies detected.');
    });

    it('should handle dry run mode correctly', async () => {
        const dryRunConfig = { ...mockConfig, dryRun: true };
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    dependencies: {
                        '@test/package-a': 'file:../test-packages/package-a'
                    },
                    workspaces: ['packages/*']
                }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(dryRunConfig);

        // Assert
        expect(result).toContain('DRY RUN: Would unlink 1 dependency reference(s) and clean up 2 problematic dependencies across 1 package.json files');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
    });

    it('should correctly remove all overrides if all are unlinked', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    dependencies: {
                        '@test/package-a': 'file:../test-packages/package-a'
                    }
                }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
        const writtenPackageJson = JSON.parse(writeFileCall[1]);
        expect(writtenPackageJson.dependencies['@test/package-a']).toBe('^1.0.0');
        // Verify that npm command was called (either npm install or npm ci)
        expect(Child.run).toHaveBeenCalled();
    });

    it('should preserve other properties in package.json when unlinking', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    workspaces: ['packages/*'],
                    dependencies: {
                        '@test/package-a': 'file:../test-packages/package-a',
                        '@another/unrelated': '2.0.0'
                    }
                }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
        expect(writeFileCall[0]).toContain('package.json');
        const writtenPackageJson = JSON.parse(writeFileCall[1]);
        expect(writtenPackageJson.workspaces).toBeUndefined(); // Workspace should be removed
        expect(writtenPackageJson.dependencies['@test/package-a']).toBe('^1.0.0');
        expect(writtenPackageJson.dependencies['@another/unrelated']).toBe('2.0.0');
        // Verify that npm command was called (either npm install or npm ci)
        expect(Child.run).toHaveBeenCalled();
    });

    it('should do nothing if no problematic dependencies found', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(false);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    dependencies: {
                        '@other/package': '1.0.0'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toBe('No problematic dependencies were found to clean up.');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
    });

    it('should throw error for invalid package.json', async () => {
        // Arrange
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockResolvedValue(['package-a']);
        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath.includes('package.json')) {
                return Promise.resolve("invalid: yaml:");
            }
            return Promise.resolve('');
        });

        // Act & Assert
        await expect(Unlink.execute(mockConfig)).rejects.toThrow('No package.json files found in current directory or subdirectories');
    });

    it('should throw error for invalid package.json', async () => {
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(false);
        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            return Promise.resolve([]);
        });
        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve('not a valid json');
            }
            return Promise.resolve('');
        });

        await expect(Unlink.execute(mockConfig)).rejects.toThrow('No package.json files found in current directory or subdirectories');
    });

    it('should skip packages with invalid package.json during scan', async () => {
        // Arrange
        mockStorage.exists.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) return Promise.resolve(true);
            return Promise.resolve(true);
        });
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === process.cwd()) return Promise.resolve(['package.json']);
            if (filePath === testPackagesPath) return Promise.resolve(['package-a', 'package-b', 'package-c']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'test-package',
                    dependencies: {
                        '@test/package-a': 'file:../test-packages/package-a',
                        '@test/package-c': 'file:../test-packages/package-c'
                    }
                }));
            }
            if (filePath === path.join(process.cwd(), '.kodrdriv-link-backup.json')) {
                return Promise.resolve(JSON.stringify({
                    '.:@test/package-a': {
                        originalVersion: '^1.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    },
                    '.:@test/package-c': {
                        originalVersion: '^2.0.0',
                        dependencyType: 'dependencies',
                        relativePath: '.'
                    }
                }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-b', 'package.json')) {
                return Promise.resolve('invalid json'); // This one is invalid
            }
            if (filePath === path.join(testPackagesPath, 'package-c', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-c' }));
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
        const writtenPackageJson = JSON.parse(writeFileCall[1]);
        expect(writtenPackageJson.dependencies['@test/package-a']).toBe('^1.0.0');
        expect(writtenPackageJson.dependencies['@test/package-c']).toBe('^2.0.0');
        // The real test is that no error was thrown, and only valid packages were unlinked
    });
});
