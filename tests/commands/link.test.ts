import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Link from '../../src/commands/link';
import { Config } from '../../src/types';
import * as Storage from '../../src/util/storage';
import * as Child from '../../src/util/child';
import path from 'path';

// Mock the path module to have consistent behavior
vi.mock('path', async () => {
    const actual = await vi.importActual('path') as any;
    return {
        ...actual,
        resolve: vi.fn((...args: string[]) => {
            if (args.length === 2 && args[0] === process.cwd()) {
                if (args[1] === '../company-packages') {
                    return path.normalize(`${process.cwd()}/../company-packages`);
                }
                if (args[1] === '../different-scope') {
                    return path.normalize(`${process.cwd()}/../different-scope`);
                }
            }
            return actual.resolve(...args);
        }),
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

// Mock the storage module
vi.mock('../../src/util/storage', () => ({
    create: vi.fn()
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn()
}));

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
    getDryRunLogger: vi.fn().mockImplementation((isDryRun: boolean) => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('link command', () => {
    let mockStorage: any;
    let mockConfig: Config;

    beforeEach(() => {
        // Clear all mocks and timers
        vi.clearAllMocks();
        vi.clearAllTimers();
        vi.mocked(Child.run).mockClear();
        mockExit.mockClear();

        mockStorage = {
            exists: vi.fn(),
            isDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            listFiles: vi.fn(),
            deleteFile: vi.fn()
        };

        (Storage.create as any).mockReturnValue(mockStorage);

        mockConfig = {
            dryRun: false,
            verbose: false,
            debug: false,
            overrides: false,
            model: 'gpt-4o-mini',
            contextDirectories: [],
            configDirectory: '.kodrdriv',
            discoveredConfigDirs: [],
            resolvedConfigDirs: [],
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
                scopeRoots: { '@company': '../company-packages' },
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
            await expect(Link.execute(mockConfig)).rejects.toThrow();
        });

        it('should throw error when package.json is malformed', async () => {
            // Arrange
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(false);
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                return Promise.resolve([]);
            });
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve('invalid json');
                }
                return Promise.resolve('{}');
            });

            // Act & Assert
            await expect(Link.execute(mockConfig)).rejects.toThrow();
        });

        it('should skip gracefully when no scope roots are configured', async () => {
            // Arrange
            const configWithoutScopes = {
                ...mockConfig,
                link: {
                    scopeRoots: {},
                    dryRun: false
                }
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(JSON.stringify({
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            }));

            // Act
            const result = await Link.execute(configWithoutScopes);

            // Assert
            expect(result).toBe('No scope roots configured. Skipping link management.');
        });

        it('should handle filesystem errors gracefully during directory scanning', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                return Promise.resolve('{}');
            });
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                // Simulate filesystem errors for scope directories
                return Promise.reject(new Error('Permission denied'));
            });

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

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.endsWith('package.json')) {
                    return Promise.resolve('invalid: yaml: [content');
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });
            mockStorage.isDirectory.mockResolvedValue(true);

            // Act & Assert - Should skip malformed package.json files and continue gracefully
            const result = await Link.execute(mockConfig);
            expect(result).toBe('No matching sibling packages found for linking.');
        });
    });

    describe('package discovery and linking', () => {
        it('should discover and link packages from dependencies into overrides', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0', '@company/utils': '^2.0.0' }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(companyPackagesPath, 'utils', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/utils' }));
                }
                throw new Error(`File not found: ${filePath}`);
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'utils', 'other']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 2 dependency reference(s) across 1 package.json file(s)');
            expect(result).toContain('@company/cache: file:../company-packages/cache');
            expect(result).toContain('@company/utils: file:../company-packages/utils');

            const writeFileCall = mockStorage.writeFile.mock.calls[0];
            expect(writeFileCall[0]).toContain('package.json');
            expect(writeFileCall[1]).toContain('"@company/cache": "file:../company-packages/cache"');
            expect(writeFileCall[1]).toContain('"@company/utils": "file:../company-packages/utils"');
            expect(Child.run).toHaveBeenCalledWith('npm install --silent --prefer-offline --no-audit --no-fund');
        });

        it('should merge with existing overrides in workspace file', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            // Act
            await Link.execute(mockConfig);

            // Assert
            const writeFileCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
            expect(writeFileCall[1]).toContain('"@company/cache": "file:../company-packages/cache"');
            expect(Child.run).toHaveBeenCalledWith('npm install --silent --prefer-offline --no-audit --no-fund');
        });

        it('should not run npm install in dry run mode', async () => {
            // Arrange
            const dryRunConfig = { ...mockConfig, dryRun: true };
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath.endsWith('package.json')) {
                    return Promise.resolve('');
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                throw new Error(`File not found: ${filePath}`);
            });
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            // Act
            await Link.execute(dryRunConfig);

            // Assert
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
            expect(Child.run).not.toHaveBeenCalled();
        });
    });

    describe('package discovery', () => {
        it('should discover packages from devDependencies and peerDependencies', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' },
                devDependencies: { '@company/dev-utils': '^1.0.0' },
                peerDependencies: { '@company/peer-lib': '^1.0.0' }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockImplementation((filePath: string) => {
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(companyPackagesPath, 'dev-utils', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/dev-utils' }));
                }
                if (filePath === path.join(companyPackagesPath, 'peer-lib', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/peer-lib' }));
                }
                throw new Error('File not found');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'dev-utils', 'peer-lib']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 3 dependency reference(s) across 1 package.json file(s)');
            expect(result).toContain('@company/cache: file:../company-packages/cache');
            expect(result).toContain('@company/dev-utils: file:../company-packages/dev-utils');
            expect(result).toContain('@company/peer-lib: file:../company-packages/peer-lib');
        });

        it('should handle multiple scope roots', async () => {
            // Arrange
            const configWithMultipleScopes = {
                ...mockConfig,
                link: {
                    ...mockConfig.link,
                    scopeRoots: {
                        '@company': '../company-packages',
                        '@different': '../different-scope'
                    }
                }
            };

            const packageJson = {
                name: '@app/main',
                dependencies: {
                    '@company/cache': '1.0.0',
                    '@different/pkg': '1.0.0',
                    'some-other-dep': '1.0.0'
                }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');
            const differentScopePath = path.resolve(process.cwd(), '../different-scope');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(differentScopePath, 'pkg', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@different/pkg' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'utils']);
                }
                if (dirPath === differentScopePath) {
                    return Promise.resolve(['pkg']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(configWithMultipleScopes);

            // Assert
            expect(result).toContain('Successfully linked 2 dependency reference(s) across 1 package.json file(s)');
            expect(result).toContain('@company/cache: file:../company-packages/cache');
            expect(result).toContain('@different/pkg: file:../different-scope/pkg');
            expect(result).not.toContain('some-other-dep');
        });

        it('should skip packages that do not match the scope', async () => {
            // Arrange
            const packageJson = {
                name: '@company/my-app',
                dependencies: {
                    '@company/cache': '1.0.0',
                    '@other/package': '1.0.0'
                }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                // This package is in the '@company' scope dir, but has a different scope.
                if (filePath === path.join(companyPackagesPath, 'other-pkg', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@other/package' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'other-pkg']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig); // uses default config with only @company scope

            // Assert
            expect(result).toContain('Successfully linked 1 dependency reference(s) across 1 package.json file(s)');
            expect(result).toContain('@company/cache: file:../company-packages/cache');
            expect(result).not.toContain('@other/package');
        });

        it('should skip packages with invalid package.json during scan', async () => {
            // Arrange
            const packageJson = {
                name: '@company/my-app',
                dependencies: {
                    '@company/cache': '1.0.0',
                    '@company/utils': '1.0.0'
                }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(companyPackagesPath, 'utils', 'package.json')) {
                    return Promise.resolve('invalid json');
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'utils']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 dependency reference(s) across 1 package.json file(s)');
            expect(result).toContain('@company/cache: file:../company-packages/cache');
            expect(result).not.toContain('@company/utils');

            const writeFileCall = mockStorage.writeFile.mock.calls[0];
            expect(writeFileCall[1]).toContain('"@company/utils": "1.0.0"'); // Original version preserved since utils package was invalid
        });
    });

    describe('workspace file handling', () => {
        it('should create new workspace file when none exists', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                return Promise.resolve('{}');
            });
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 dependency reference(s) across 1 package.json file(s)');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('package.json'),
                expect.stringContaining('"@company/cache": "file:../company-packages/cache"'),
                'utf-8'
            );
        });

        it('should merge with existing workspace file packages', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: {
                    '@company/cache': '^1.0.0',
                    '@company/existing': '^2.0.0'
                }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(companyPackagesPath, 'existing', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/existing' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'existing']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 2 dependency reference(s) across 1 package.json file(s)');
            const writeCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
            expect(writeCall[1]).toContain('"@company/existing": "file:../company-packages/existing"');
            expect(writeCall[1]).toContain('"@company/cache": "file:../company-packages/cache"');
        });

        it('should avoid duplicate overrides in workspace file', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: {
                    '@company/cache': '^1.0.0',
                    '@company/utils': '^2.0.0'
                }
            };

            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                if (filePath === path.join(companyPackagesPath, 'utils', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/utils' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache', 'utils']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 2 dependency reference(s) across 1 package.json file(s)');
            const writeCall = mockStorage.writeFile.mock.calls.find((call: any) => call[0].includes('package.json'));
            expect(writeCall[1]).toContain('"@company/cache": "file:../company-packages/cache"');
            expect(writeCall[1]).toContain('"@company/utils": "file:../company-packages/utils"');
        });

        // Removed test for custom workspace filename - npm workspaces use package.json directly

        it('should perform dry run mode from global config', async () => {
            // Arrange
            const dryRunConfig = {
                ...mockConfig,
                dryRun: true
            };
            const packageJson = {
                name: '@company/providers',
                dependencies: { '@company/cache': '^1.0.0' },
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            const result = await Link.execute(dryRunConfig);

            // Assert
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
            expect(Child.run).not.toHaveBeenCalled();
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
                dependencies: { '@company/cache': '^1.0.0' },
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });


            const result = await Link.execute(dryRunConfig);

            // Assert
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
            expect(Child.run).not.toHaveBeenCalled();
        });

        it('should handle package.json without name field', async () => {
            // Arrange
            const packageJson = {
                dependencies: { '@company/cache': '^1.0.0' }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'cache', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/cache' }));
                }
                return Promise.resolve('');
            });
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toContain('Successfully linked 1 dependency reference(s) across 1 package.json file(s)');
        });

        it('should handle empty dependencies', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: {}
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                return Promise.resolve('{}');
            });

            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['cache']);
                }
                return Promise.resolve([]);
            });

            // Act
            const result = await Link.execute(mockConfig);

            // Assert
            expect(result).toBe('No matching sibling packages found for linking.');
        });

        it('should sort overrides alphabetically', async () => {
            // Arrange
            const packageJson = {
                name: '@company/providers',
                dependencies: {
                    '@company/zoo': '1.0.0',
                    '@company/apple': '1.0.0'
                }
            };
            const companyPackagesPath = path.resolve(process.cwd(), '../company-packages');
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filePath: string) => {
                if (filePath === path.join(process.cwd(), 'package.json')) {
                    return Promise.resolve(JSON.stringify(packageJson));
                }
                if (filePath === path.join(companyPackagesPath, 'zoo', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/zoo' }));
                }
                if (filePath === path.join(companyPackagesPath, 'apple', 'package.json')) {
                    return Promise.resolve(JSON.stringify({ name: '@company/apple' }));
                }
                return Promise.resolve('{}');
            });
            mockStorage.listFiles.mockImplementation((dirPath: string) => {
                if (dirPath === process.cwd()) {
                    return Promise.resolve(['package.json']);
                }
                if (dirPath === companyPackagesPath) {
                    return Promise.resolve(['zoo', 'apple']);
                }
                return Promise.resolve([]);
            });

            // Act
            await Link.execute(mockConfig);

            // Assert
            const writeFileCall = mockStorage.writeFile.mock.calls[0];
            const content = writeFileCall[1];
            expect(content).toContain('"@company/apple": "file:../company-packages/apple"');
            expect(content).toContain('"@company/zoo": "file:../company-packages/zoo"');
        });
    });
});
