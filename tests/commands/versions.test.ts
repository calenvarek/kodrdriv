import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock all dependencies
vi.mock('fs/promises', () => {
    const mockFs = {
        readdir: vi.fn(),
        access: vi.fn(),
        stat: vi.fn()
    };
    return {
        default: mockFs,
        ...mockFs
    };
});

vi.mock('path', () => ({
    default: {
        join: vi.fn((...paths) => paths.join('/')),
        dirname: vi.fn((path) => {
            const parts = path.split('/');
            return parts.slice(0, -1).join('/') || '/';
        }),
        basename: vi.fn((path) => path.split('/').pop() || ''),
    },
    join: vi.fn((...paths) => paths.join('/')),
    dirname: vi.fn((path) => {
        const parts = path.split('/');
        return parts.slice(0, -1).join('/') || '/';
    }),
    basename: vi.fn((path) => path.split('/').pop() || ''),
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

vi.mock('@eldrforge/shared', () => ({
    createStorage: vi.fn(() => ({
        readFile: vi.fn(),
        writeFile: vi.fn(),
        exists: vi.fn(),
        isDirectory: vi.fn(),
        isDirectoryWritable: vi.fn(),
        isDirectoryReadable: vi.fn()
    }))
}));

vi.mock('@eldrforge/git-tools', () => ({
    safeJsonParse: vi.fn(),
    validatePackageJson: vi.fn(),
}));

vi.mock('../../src/util/general', () => ({
    getOutputPath: vi.fn()
}));

import { execute } from '../../src/commands/versions';
import { getLogger } from '../../src/logging';
import { createStorage } from '@eldrforge/shared';
import { safeJsonParse, validatePackageJson } from '@eldrforge/git-tools';
import fs from 'fs/promises';
import path from 'path';
import { Config } from '../../src/types';

describe('versions command', () => {
    let mockLogger: any;
    let mockStorage: any;
    let mockReaddir: Mock;
    let mockStat: Mock;

    const createBaseConfig = (versionsConfig: any = {}): Config => ({
        dryRun: false,
        verbose: false,
        debug: false,
        overrides: false,
        model: 'gpt-4o-mini',
        contextDirectories: [],
        configDirectory: '.kodrdriv',
        outputDirectory: 'output/kodrdriv',
        preferencesDirectory: '~/.kodrdriv',
        discoveredConfigDirs: [],
        resolvedConfigDirs: [],
        versions: versionsConfig,
        commit: {},
        audioCommit: {},
        release: {},
        audioReview: {},
        review: {},
        publish: {},
        link: {},
        unlink: {},
        tree: {},
        development: {},
        excludedPatterns: []
    });

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        mockStorage = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            exists: vi.fn(),
            isDirectory: vi.fn(),
            isDirectoryWritable: vi.fn(),
            isDirectoryReadable: vi.fn()
        };

        (getLogger as Mock).mockReturnValue(mockLogger);
        (createStorage as Mock).mockReturnValue(mockStorage);

        mockReaddir = fs.readdir as Mock;
        mockStat = fs.stat as Mock;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('executeMinor', () => {
        it('should throw error when no subcommand is provided', async () => {
            const config = createBaseConfig({
                // No subcommand
            });

            await expect(execute(config)).rejects.toThrow('Versions command requires a subcommand');
        });

        it('should throw error for unknown subcommand', async () => {
            const config = createBaseConfig({
                subcommand: 'unknown'
            });

            await expect(execute(config)).rejects.toThrow('Unknown versions subcommand: unknown');
        });

        it('should normalize scoped dependencies to major.minor format', async () => {
            const config = createBaseConfig({
                subcommand: 'minor',
                directories: ['/workspace']
            });

            // Mock discovering packages - no root package.json, but subdirectories have them
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(
                    path === '/workspace/package-a/package.json' ||
                    path === '/workspace/package-b/package.json'
                );
            });

            // Mock package.json files
            const packageAContent = JSON.stringify({
                name: '@eldrforge/package-a',
                version: '1.2.3',
                dependencies: {
                    '@eldrforge/package-b': '1.1.0',
                    'external-package': '^2.0.0'
                }
            });

            const packageBContent = JSON.stringify({
                name: '@eldrforge/package-b',
                version: '1.1.5',
                dependencies: {
                    '@eldrforge/package-a': '~1.2.0'
                }
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path === '/workspace/package-a/package.json') {
                    return Promise.resolve(packageAContent);
                } else if (path === '/workspace/package-b/package.json') {
                    return Promise.resolve(packageBContent);
                }
                return Promise.reject(new Error('File not found'));
            });

            // Mock parsing
            (safeJsonParse as Mock).mockImplementation((content: string) => {
                return JSON.parse(content);
            });

            (validatePackageJson as Mock).mockImplementation((parsed: any) => {
                return parsed;
            });

            // Mock directory structure - no package.json in root, so it scans subdirectories
            mockReaddir.mockImplementation((dir: string) => {
                if (dir === '/workspace') {
                    return Promise.resolve([
                        { name: 'package-a', isDirectory: () => true },
                        { name: 'package-b', isDirectory: () => true },
                        { name: 'node_modules', isDirectory: () => true },
                        { name: 'file.txt', isDirectory: () => false }
                    ]);
                }
                return Promise.resolve([]);
            });

            const result = await execute(config);

            expect(result).toContain('Dependencies updated successfully');
            expect(mockStorage.writeFile).toHaveBeenCalledTimes(2);

                        // Check that dependencies were normalized to major.minor format
            const packageACall = mockStorage.writeFile.mock.calls.find((call: any[]) =>
                call[0] === '/workspace/package-a/package.json'
            );
            expect(packageACall).toBeDefined();

            const updatedPackageA = JSON.parse(packageACall[1]);
            expect(updatedPackageA.dependencies['@eldrforge/package-b']).toBe('1.1'); // '1.1.0' → '1.1'
            expect(updatedPackageA.dependencies['external-package']).toBe('^2.0.0'); // Unchanged
        });

        it('should handle dry run mode correctly', async () => {
            const config = createBaseConfig({
                subcommand: 'minor',
                directories: ['/workspace']
            });
            config.dryRun = true;

            // Mock discovering packages - no root package.json, but subdirectories have them
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(
                    path === '/workspace/package-a/package.json' ||
                    path === '/workspace/package-b/package.json'
                );
            });

            const packageAContent = JSON.stringify({
                name: '@eldrforge/package-a',
                version: '1.2.3',
                dependencies: {
                    '@eldrforge/package-b': '1.1.0'
                }
            });

            const packageBContent = JSON.stringify({
                name: '@eldrforge/package-b',
                version: '1.1.5'
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path === '/workspace/package-a/package.json') {
                    return Promise.resolve(packageAContent);
                } else if (path === '/workspace/package-b/package.json') {
                    return Promise.resolve(packageBContent);
                }
                return Promise.reject(new Error('File not found'));
            });

            (safeJsonParse as Mock).mockImplementation((content: string) => {
                return JSON.parse(content);
            });

            (validatePackageJson as Mock).mockImplementation((parsed: any) => {
                return parsed;
            });

            // Mock directory structure
            mockReaddir.mockImplementation((dir: string) => {
                if (dir === '/workspace') {
                    return Promise.resolve([
                        { name: 'package-a', isDirectory: () => true },
                        { name: 'package-b', isDirectory: () => true },
                        { name: 'node_modules', isDirectory: () => true }
                    ]);
                }
                return Promise.resolve([]);
            });

            const result = await execute(config);

            expect(result).toContain('Dry run complete');
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
            // Check if any info call contains the expected dry run message pattern
            const infoCallsWithUpdates = mockLogger.info.mock.calls.filter((call: any[]) =>
                call[0] && (call[0].includes('Would update dependencies.') || call[0].includes('VERSIONS_WOULD_NORMALIZE'))
            );
            expect(infoCallsWithUpdates.length).toBeGreaterThan(0);
        });

        it('should skip unscoped packages', async () => {
            const config = createBaseConfig({
                subcommand: 'minor',
                directories: ['/workspace']
            });

            // Mock discovering unscoped package
            mockStorage.exists.mockResolvedValue(true);

            const packageContent = JSON.stringify({
                name: 'unscoped-package',
                version: '1.2.3',
                dependencies: {
                    'another-unscoped': '^2.0.0'
                }
            });

            mockStorage.readFile.mockResolvedValue(packageContent);

            (safeJsonParse as Mock).mockImplementation((content: string) => {
                return JSON.parse(content);
            });

            (validatePackageJson as Mock).mockImplementation((parsed: any) => {
                return parsed;
            });

            mockReaddir.mockResolvedValue([]);

            const result = await execute(config);

            expect(result).toContain('Updated 0 of 0 packages with dependency changes');
            expect(mockStorage.writeFile).not.toHaveBeenCalled();
            expect(mockLogger.verbose).toHaveBeenCalledWith(
                'Skipping unscoped-package - not a scoped package'
            );
        });

        it('should handle missing package.json files gracefully', async () => {
            const config = createBaseConfig({
                subcommand: 'minor',
                directories: ['/workspace']
            });

            // Mock no package.json files
            mockStorage.exists.mockResolvedValue(false);
            mockReaddir.mockResolvedValue([]);

            const result = await execute(config);

            expect(result).toBe('No packages found to process.');
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('VERSIONS_NO_PACKAGES'));
        });

        it('should update devDependencies and peerDependencies', async () => {
            const config = createBaseConfig({
                subcommand: 'minor',
                directories: ['/workspace']
            });

            // Mock multiple packages to provide dependencies - no root package.json
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(
                    path === '/workspace/pkg-a/package.json' ||
                    path === '/workspace/pkg-b/package.json' ||
                    path === '/workspace/pkg-c/package.json' ||
                    path === '/workspace/pkg-d/package.json'
                );
            });

            const packageAContent = JSON.stringify({
                name: '@eldrforge/package-a',
                version: '1.2.3',
                dependencies: {
                    '@eldrforge/package-b': '1.1.0'
                },
                devDependencies: {
                    '@eldrforge/package-c': '2.0.0'
                },
                peerDependencies: {
                    '@eldrforge/package-d': '~3.0.0'
                }
            });

            const packageBContent = JSON.stringify({
                name: '@eldrforge/package-b',
                version: '1.2.5'
            });

            const packageCContent = JSON.stringify({
                name: '@eldrforge/package-c',
                version: '2.0.8'
            });

            const packageDContent = JSON.stringify({
                name: '@eldrforge/package-d',
                version: '3.0.1'
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path === '/workspace/pkg-a/package.json') {
                    return Promise.resolve(packageAContent);
                } else if (path === '/workspace/pkg-b/package.json') {
                    return Promise.resolve(packageBContent);
                } else if (path === '/workspace/pkg-c/package.json') {
                    return Promise.resolve(packageCContent);
                } else if (path === '/workspace/pkg-d/package.json') {
                    return Promise.resolve(packageDContent);
                }
                return Promise.reject(new Error('File not found'));
            });

            (safeJsonParse as Mock).mockImplementation((content: string) => {
                return JSON.parse(content);
            });

            (validatePackageJson as Mock).mockImplementation((parsed: any) => {
                return parsed;
            });

            // Mock directory structure to find the additional packages
            mockReaddir.mockImplementation((dir: string) => {
                if (dir === '/workspace') {
                    return Promise.resolve([
                        { name: 'pkg-a', isDirectory: () => true },
                        { name: 'pkg-b', isDirectory: () => true },
                        { name: 'pkg-c', isDirectory: () => true },
                        { name: 'pkg-d', isDirectory: () => true },
                        { name: 'node_modules', isDirectory: () => true }
                    ]);
                }
                return Promise.resolve([]);
            });

            const result = await execute(config);

            expect(result).toContain('Updated 1 of 4 packages with dependency changes');
            expect(mockStorage.writeFile).toHaveBeenCalledTimes(1);

            const writeCall = mockStorage.writeFile.mock.calls[0];
            const updatedPackage = JSON.parse(writeCall[1]);

            expect(updatedPackage.dependencies['@eldrforge/package-b']).toBe('1.1'); // '1.1.0' → '1.1'
            expect(updatedPackage.devDependencies['@eldrforge/package-c']).toBe('2.0'); // '2.0.0' → '2.0'
            expect(updatedPackage.peerDependencies['@eldrforge/package-d']).toBe('~3.0'); // '~3.0.0' → '~3.0'
        });

        it('should use default directories when none provided', async () => {
            const originalCwd = process.cwd;
            process.cwd = vi.fn().mockReturnValue('/default');

            const config = createBaseConfig({
                subcommand: 'minor'
                // No directories specified
            });

            mockStorage.exists.mockResolvedValue(false);
            mockReaddir.mockResolvedValue([]);

            await execute(config);

            expect(mockLogger.verbose).toHaveBeenCalledWith('Scanning directories: /default');

            process.cwd = originalCwd;
        });
    });
});
