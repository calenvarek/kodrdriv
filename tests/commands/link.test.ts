import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Link from '../../src/commands/link';
import { Config } from '../../src/types';
import * as Storage from '../../src/util/storage';
import path from 'path';

// Mock the path module to have consistent behavior
vi.mock('path', async () => {
    const actual = await vi.importActual('path') as any;
    return {
        ...actual,
        resolve: vi.fn((...args: string[]) => {
            if (args.length === 2 && args[1] === '../') {
                return '/mock/cwd/../';
            }
            if (args.length === 2 && args[1] === '../company-packages/') {
                return '/mock/cwd/../company-packages/';
            }
            if (args.length === 2 && args[1] === '../company-packages/') {
                return '/mock/cwd/../company-packages/';
            }
            return actual.resolve(...args);
        }),
        join: actual.join,
        relative: vi.fn((from: string, to: string) => {
            if (to.includes('/mock/cwd/../cache')) return '../cache';
            if (to.includes('/mock/cwd/../utils')) return '../utils';
            if (to.includes('/mock/cwd/../dev-utils')) return '../dev-utils';
            if (to.includes('/mock/cwd/../peer-lib')) return '../peer-lib';
            if (to.includes('/mock/cwd/../company-packages/cache')) return '../company-packages/cache';
            if (to.includes('/mock/cwd/../company-packages/shared')) return '../company-packages/shared';
            return actual.relative(from, to);
        })
    };
});

// Mock process.cwd
vi.stubGlobal('process', {
    ...process,
    cwd: vi.fn(() => '/mock/cwd')
});

// Mock the storage module
vi.mock('../../src/util/storage', () => ({
    create: vi.fn()
}));

// Mock the logger
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }))
}));

describe('link command', () => {
    let mockStorage: any;
    let mockConfig: Config;

    beforeEach(() => {
        // Clear all mocks and timers
        vi.clearAllMocks();
        vi.clearAllTimers();

        mockStorage = {
            exists: vi.fn(),
            isDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            listFiles: vi.fn()
        };

        (Storage.create as any).mockReturnValue(mockStorage);

        mockConfig = {
            dryRun: false,
            verbose: false,
            debug: false,
            overrides: false,
            model: 'gpt-4o-mini',
            instructions: '',
            contextDirectories: [],
            configDirectory: '.kodrdriv',
            commit: {
                add: false,
                cached: false,
                sendit: false,
                messageLimit: 10
            },
            release: {
                from: 'main',
                to: 'HEAD',
                messageLimit: 10
            },
            publish: {
                mergeMethod: 'squash',
                requiredEnvVars: []
            },
            link: {
                scopeRoots: { '@company': '../' },
                workspaceFile: 'pnpm-workspace.yaml',
                dryRun: false
            },
            excludedPatterns: []
        };
    });

    describe('error handling', () => {
        it('should throw error when package.json is not found', async () => {
            // Arrange
            mockStorage.exists.mockResolvedValue(false);

            // Act & Assert
            await expect(Link.execute(mockConfig)).rejects.toThrow('package.json not found in current directory.');
        });

        it('should throw error when package.json is malformed', async () => {
            // Arrange
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue('invalid json');

            // Act & Assert
            await expect(Link.execute(mockConfig)).rejects.toThrow('Failed to parse package.json');
        });

        it('should throw error when no scope roots are configured', async () => {
            // Arrange
            const configWithoutScopes = {
                ...mockConfig,
                link: {
                    scopeRoots: {},
                    workspaceFile: 'pnpm-workspace.yaml',
                    dryRun: false
                }
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            }));

            // Act & Assert
            await expect(Link.execute(configWithoutScopes)).rejects.toThrow('No scope roots configured');
        });

        it('should handle filesystem errors gracefully during directory scanning', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(true);
            });

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                throw new Error('File read error');
            });

            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.listFiles.mockRejectedValue(new Error('Permission denied'));

            // Act
            const result = await Link.execute(mockConfig);

            // Assert - Should handle error gracefully and continue
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should handle malformed existing workspace file', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(true);
            });

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve('invalid: yaml: [content');
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);
            mockStorage.isDirectory.mockResolvedValue(true);

            // Act & Assert
            await expect(Link.execute(mockConfig)).rejects.toThrow('Failed to parse existing workspace file');
        });
    });

    describe('package discovery', () => {
        it('should discover and link packages from dependencies', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0', '@company/utils': '^2.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('utils')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('utils')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath.includes('utils') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/utils' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache', 'utils', 'other']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 2 sibling packages');
            expect(result).toContain('../cache');
            expect(result).toContain('../utils');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('pnpm-workspace.yaml'),
                expect.stringContaining('packages:'),
                'utf-8'
            );
        });

        it('should discover packages from devDependencies and peerDependencies', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' },
                devDependencies: { '@company/dev-utils': '^1.0.0' },
                peerDependencies: { '@company/peer-lib': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('dev-utils') && !filePath.includes('peer-lib')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('dev-utils') && !filePath.includes('peer-lib')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath.includes('dev-utils') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/dev-utils' }));
                }
                if (filePath.includes('peer-lib') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/peer-lib' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache', 'dev-utils', 'peer-lib']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 3 sibling packages');
            expect(result).toContain('../cache');
            expect(result).toContain('../dev-utils');
            expect(result).toContain('../peer-lib');
        });

        it('should handle multiple scope roots', async () => {
            // Arrange
            const configWithMultipleScopes = {
                ...mockConfig,
                link: {
                    scopeRoots: {
                        '@company': '../company-packages/',
                        '@company2': '../company2-packages/'
                    },
                    workspaceFile: 'pnpm-workspace.yaml',
                    dryRun: false
                }
            };

            const packageJson = {
                name: '@company/providers',
                dependencies: {
                    '@company/cache': '^1.0.0',
                    '@company/shared': '^1.0.0'
                }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('shared')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('shared')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath.includes('shared') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/shared' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath.includes('company-packages')) return Promise.resolve(['cache', 'utils']);
                if (dirPath.includes('company-packages')) return Promise.resolve(['shared', 'common']);
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(configWithMultipleScopes);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(result).toContain('../company-packages/cache');
        });

        it('should skip packages that do not match the scope', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('other')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache') && !filePath.includes('other')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath.includes('other') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@different/scope' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache', 'other']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(result).toContain('../cache');
            expect(result).not.toContain('../other');
        });
    });

    describe('workspace file handling', () => {
        it('should create new workspace file when none exists', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('pnpm-workspace.yaml'),
                expect.stringContaining('packages:\n  - ../cache'),
                'utf-8'
            );
        });

        it('should merge with existing workspace file packages', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            const existingWorkspace = 'packages:\n  - existing-package\n  - another-existing';

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(existingWorkspace);
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            const writeCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('pnpm-workspace.yaml'));
            expect(writeCall[1]).toContain('existing-package');
            expect(writeCall[1]).toContain('another-existing');
            expect(writeCall[1]).toContain('../cache');
        });

        it('should avoid duplicate packages in workspace file', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            const existingWorkspace = 'packages:\n  - ../cache\n  - other-package';

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(existingWorkspace);
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            const writeCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('pnpm-workspace.yaml'));
            const packageLines = writeCall[1].split('\n').filter((line: string) => line.includes('../cache'));
            expect(packageLines).toHaveLength(1); // Should not duplicate
        });

        it('should use custom workspace filename', async () => {
            // Arrange
            const customConfig = {
                ...mockConfig,
                link: {
                    ...mockConfig.link,
                    workspaceFile: 'custom-workspace.yaml'
                }
            };

            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('custom-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(customConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('custom-workspace.yaml'),
                expect.any(String),
                'utf-8'
            );
        });
    });

    describe('dry run mode', () => {
        it('should perform dry run mode from global config', async () => {
            // Arrange
            const dryRunConfig = {
                ...mockConfig,
                dryRun: true
            };

            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(dryRunConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
        });

        it('should perform dry run mode from link-specific config', async () => {
            // Arrange
            const dryRunConfig = {
                ...mockConfig,
                link: {
                    ...mockConfig.link,
                    dryRun: true
                }
            };

            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(dryRunConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle package.json without name field', async () => {
            // Arrange
            const packageJson = {
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 sibling packages');
        });

        it('should handle empty dependencies', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers'
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(JSON.stringify(packageJson));
            mockStorage.listFiles.mockResolvedValue([]);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should handle sibling packages without name field', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve(JSON.stringify({})); // No name field
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should handle malformed sibling package.json files', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(true);
                }
                if (filePath.endsWith('pnpm-workspace.yaml')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath.endsWith('package.json') && !filePath.includes('../') && !filePath.includes('cache')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.includes('cache') && filePath.endsWith('package.json')) {
                    return Promise.resolve('invalid json');
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockResolvedValue(['cache']);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert - Should handle gracefully and continue
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should return message when no matching packages found', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@other/package': '^1.0.0' }
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(JSON.stringify(packageJson));
            mockStorage.listFiles.mockResolvedValue([]);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should handle directory scanning functionality', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@other/unknown': '^1.0.0' }
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(JSON.stringify(packageJson));
            mockStorage.listFiles.mockResolvedValue([]); // No directories found
            mockStorage.isDirectory.mockResolvedValue(true);

            // Act
            const result = await Link.execute(mockConfig);

            // Assert - Should scan directories but find no matches
            expect(result).toBe('No matching sibling packages found for linking.');
            expect(mockStorage.listFiles).toHaveBeenCalled();
        });
    });
}); 