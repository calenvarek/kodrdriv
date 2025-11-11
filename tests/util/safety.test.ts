import { describe, it, beforeEach, expect, vi } from 'vitest';
import { Mock } from 'vitest';
import path from 'path';

// Create a stable mock logger instance
const mockLogger = {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
};

// Mock the logger
vi.mock('../../src/logging', () => ({
    getLogger: () => mockLogger
}));

// Mock validation functions from git-tools
vi.mock('@eldrforge/git-tools', () => ({
    safeJsonParse: vi.fn(),
    validatePackageJson: vi.fn()
}));

// Import the functions to test after mocking
import {
    checkForFileDependencies,
    logFileDependencyWarning,
    logFileDependencySuggestions
} from '../../src/util/safety';

// Import mocked modules to get references to mock functions
import { getLogger } from '../../src/logging';
import { safeJsonParse, validatePackageJson } from '@eldrforge/git-tools';

describe('safety.ts', () => {
    let mockSafeJsonParse: any;
    let mockValidatePackageJson: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSafeJsonParse = safeJsonParse as any;
        mockValidatePackageJson = validatePackageJson as any;
    });

    describe('checkForFileDependencies', () => {
        let mockStorage: any;

        beforeEach(() => {
            mockStorage = {
                exists: vi.fn(),
                isDirectory: vi.fn(),
                listFiles: vi.fn(),
                readFile: vi.fn()
            };
        });

        it('should return empty array when no package.json files found', async () => {
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root' || path.endsWith('/src') || path.endsWith('/dist'));
            });

            mockStorage.isDirectory.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root' || path.endsWith('/src') || path.endsWith('/dist'));
            });

            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(['src', 'dist', 'README.md']);
                } else if (path.endsWith('/src') || path.endsWith('/dist')) {
                    return Promise.resolve(['index.js']);
                }
                return Promise.resolve([]);
            });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith('Found 0 package.json file(s) in directory tree');
        });

                it('should find and process package.json files with file dependencies', async () => {
            const packageJsonContent = JSON.stringify({
                name: 'test-package',
                dependencies: {
                    'regular-dep': '^1.0.0',
                    'file-dep': 'file:../local-package'
                },
                devDependencies: {
                    'dev-file-dep': 'file:./dev-local'
                },
                peerDependencies: {
                    'peer-file-dep': 'file:../peer-package'
                }
            });

            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root' || path.endsWith('/src'));
            });

            mockStorage.isDirectory.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root');
            });

            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(['package.json']);
                }
                return Promise.resolve([]);
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.endsWith('/test/root/package.json')) {
                    return Promise.resolve(packageJsonContent);
                }
                return Promise.reject(new Error('File not found'));
            });

            const parsedJson = {
                name: 'test-package',
                dependencies: {
                    'regular-dep': '^1.0.0',
                    'file-dep': 'file:../local-package'
                },
                devDependencies: {
                    'dev-file-dep': 'file:./dev-local'
                },
                peerDependencies: {
                    'peer-file-dep': 'file:../peer-package'
                }
            };

            mockSafeJsonParse.mockReturnValue(parsedJson);
            mockValidatePackageJson.mockReturnValue(parsedJson);

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                packagePath: '.',
                dependencies: [
                    { name: 'file-dep', version: 'file:../local-package', dependencyType: 'dependencies' },
                    { name: 'dev-file-dep', version: 'file:./dev-local', dependencyType: 'devDependencies' },
                    { name: 'peer-file-dep', version: 'file:../peer-package', dependencyType: 'peerDependencies' }
                ]
            });
        });

                it('should handle multiple package.json files in subdirectories', async () => {
            const rootPackageJson = JSON.stringify({
                name: 'root-package',
                dependencies: { 'file-dep': 'file:../local' }
            });

            const subPackageJson = JSON.stringify({
                name: 'sub-package',
                devDependencies: { 'sub-file-dep': 'file:../../other' }
            });

            // Set up mock calls for different directory paths
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(true);
            });

            mockStorage.isDirectory.mockImplementation((path: string) => {
                // Only the root and packages directories are directories
                return Promise.resolve(path === '/test/root' || path.endsWith('/packages') || path.endsWith('/packages/sub-package'));
            });

            // Root directory listing
            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(['package.json', 'packages']);
                } else if (path.endsWith('/packages')) {
                    return Promise.resolve(['sub-package']);
                } else if (path.endsWith('/packages/sub-package')) {
                    return Promise.resolve(['package.json']);
                }
                return Promise.resolve([]);
            });

            // File reading
            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.endsWith('/test/root/package.json')) {
                    return Promise.resolve(rootPackageJson);
                } else if (path.endsWith('/packages/sub-package/package.json')) {
                    return Promise.resolve(subPackageJson);
                }
                return Promise.reject(new Error('File not found'));
            });

            const parsedRootJson = {
                name: 'root-package',
                dependencies: { 'file-dep': 'file:../local' }
            };

            const parsedSubJson = {
                name: 'sub-package',
                devDependencies: { 'sub-file-dep': 'file:../../other' }
            };

            mockSafeJsonParse
                .mockReturnValueOnce(parsedRootJson)
                .mockReturnValueOnce(parsedSubJson);

            mockValidatePackageJson
                .mockReturnValueOnce(parsedRootJson)
                .mockReturnValueOnce(parsedSubJson);

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toHaveLength(2);
            expect(result[0].packagePath).toBe('.');
            expect(result[1].packagePath).toBe('packages/sub-package');
        });

                it('should skip excluded directories', async () => {
            const packageJsonContent = JSON.stringify({
                name: 'test-package',
                dependencies: { 'regular-dep': '^1.0.0' }
            });

            mockStorage.exists.mockResolvedValue(true);

            mockStorage.isDirectory.mockImplementation((path: string) => {
                // Only the root and src directories are directories
                return Promise.resolve(path === '/test/root' || path.endsWith('/src'));
            });

            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve([
                        'package.json',
                        'node_modules',
                        'dist',
                        'build',
                        'coverage',
                        '.git',
                        '.next',
                        '.nuxt',
                        'out',
                        'public',
                        'static',
                        'assets',
                        'src'
                    ]);
                } else if (path.endsWith('/src')) {
                    return Promise.resolve(['index.js', 'components']);
                }
                return Promise.resolve([]);
            });

            mockStorage.readFile.mockResolvedValue(packageJsonContent);
            mockSafeJsonParse.mockReturnValue({ name: 'test-package', dependencies: { 'regular-dep': '^1.0.0' } });
            mockValidatePackageJson.mockReturnValue({ name: 'test-package', dependencies: { 'regular-dep': '^1.0.0' } });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            // Should only process the root package.json and src directory (but src doesn't have package.json)
            expect(mockStorage.listFiles).toHaveBeenCalledTimes(2); // Root + src
            expect(result).toEqual([]);
        });

        it('should handle depth limit to prevent infinite recursion', async () => {
            let depth = 0;

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            mockStorage.listFiles.mockImplementation((path: string) => {
                // Create a deep nested structure: deep/deep/deep/deep/deep/deep
                return Promise.resolve(['deep']);
            });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
            // Should stop at depth 5 (0, 1, 2, 3, 4, 5) = 6 calls
            expect(mockStorage.listFiles).toHaveBeenCalledTimes(6);
        });

                it('should handle invalid package.json files gracefully', async () => {
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root');
            });

            mockStorage.isDirectory.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root');
            });

            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(['package.json']);
                }
                return Promise.resolve([]);
            });

            mockStorage.readFile.mockImplementation((path: string) => {
                if (path.endsWith('/test/root/package.json')) {
                    return Promise.resolve('{"invalid": json}');
                }
                return Promise.reject(new Error('File not found'));
            });

            mockSafeJsonParse.mockImplementation(() => {
                throw new Error('Invalid JSON');
            });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Skipped invalid package.json')
            );
        });

        it('should handle storage errors gracefully', async () => {
            mockStorage.exists.mockImplementation(() => {
                return Promise.reject(new Error('Storage error'));
            });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Failed to scan directory')
            );
        });

        it('should handle directory access errors gracefully', async () => {
            mockStorage.exists.mockImplementation((path: string) => {
                return Promise.resolve(path === '/test/root' || path.endsWith('/restricted-dir'));
            });

            mockStorage.isDirectory.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(true);
                } else if (path.endsWith('/restricted-dir')) {
                    return Promise.reject(new Error('Access denied'));
                }
                return Promise.resolve(false);
            });

            mockStorage.listFiles.mockImplementation((path: string) => {
                if (path === '/test/root') {
                    return Promise.resolve(['restricted-dir']);
                }
                return Promise.resolve([]);
            });

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Skipped directory')
            );
        });

        it('should handle package.json files without file dependencies', async () => {
            const packageJsonContent = JSON.stringify({
                name: 'test-package',
                dependencies: {
                    'regular-dep': '^1.0.0',
                    'another-dep': '~2.1.0'
                },
                devDependencies: {
                    'dev-dep': '^3.0.0'
                }
            });

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.listFiles.mockResolvedValue(['package.json']);
            mockStorage.readFile.mockResolvedValue(packageJsonContent);

            const parsedJson = {
                name: 'test-package',
                dependencies: {
                    'regular-dep': '^1.0.0',
                    'another-dep': '~2.1.0'
                },
                devDependencies: {
                    'dev-dep': '^3.0.0'
                }
            };

            mockSafeJsonParse.mockReturnValue(parsedJson);
            mockValidatePackageJson.mockReturnValue(parsedJson);

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
        });

        it('should handle package.json files with missing dependency sections', async () => {
            const packageJsonContent = JSON.stringify({
                name: 'minimal-package'
            });

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.listFiles.mockResolvedValue(['package.json']);
            mockStorage.readFile.mockResolvedValue(packageJsonContent);

            const parsedJson = { name: 'minimal-package' };

            mockSafeJsonParse.mockReturnValue(parsedJson);
            mockValidatePackageJson.mockReturnValue(parsedJson);

            const result = await checkForFileDependencies(mockStorage, '/test/root');

            expect(result).toEqual([]);
        });

        it('should use current working directory as default', async () => {
            const originalCwd = process.cwd();

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.listFiles.mockResolvedValue([]);

            await checkForFileDependencies(mockStorage);

            expect(mockStorage.exists).toHaveBeenCalledWith(originalCwd);
        });
    });

    describe('logFileDependencyWarning', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should return early when no issues provided', () => {
            logFileDependencyWarning([]);

            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should log warning with default context', () => {
            const issues = [
                {
                    packagePath: 'packages/component',
                    dependencies: [
                        { name: 'local-utils', version: 'file:../utils', dependencyType: 'dependencies' as const }
                    ]
                }
            ];

            logFileDependencyWarning(issues);

            expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  WARNING: Found file: dependencies that should not be committed during operation:');
            expect(mockLogger.warn).toHaveBeenCalledWith('  📄 packages/component:');
            expect(mockLogger.warn).toHaveBeenCalledWith('    - local-utils: file:../utils (dependencies)');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
        });

        it('should log warning with custom context', () => {
            const issues = [
                {
                    packagePath: '.',
                    dependencies: [
                        { name: 'test-dep', version: 'file:./local', dependencyType: 'devDependencies' as const }
                    ]
                }
            ];

            logFileDependencyWarning(issues, 'commit');

            expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  WARNING: Found file: dependencies that should not be committed during commit:');
        });

        it('should handle multiple issues with multiple dependencies', () => {
            const issues = [
                {
                    packagePath: 'packages/component',
                    dependencies: [
                        { name: 'utils', version: 'file:../utils', dependencyType: 'dependencies' as const },
                        { name: 'shared', version: 'file:../shared', dependencyType: 'devDependencies' as const }
                    ]
                },
                {
                    packagePath: 'packages/tools',
                    dependencies: [
                        { name: 'common', version: 'file:../common', dependencyType: 'peerDependencies' as const }
                    ]
                }
            ];

            logFileDependencyWarning(issues, 'link check');

            expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  WARNING: Found file: dependencies that should not be committed during link check:');
            expect(mockLogger.warn).toHaveBeenCalledWith('  📄 packages/component:');
            expect(mockLogger.warn).toHaveBeenCalledWith('    - utils: file:../utils (dependencies)');
            expect(mockLogger.warn).toHaveBeenCalledWith('    - shared: file:../shared (devDependencies)');
            expect(mockLogger.warn).toHaveBeenCalledWith('  📄 packages/tools:');
            expect(mockLogger.warn).toHaveBeenCalledWith('    - common: file:../common (peerDependencies)');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
        });
    });

    describe('logFileDependencySuggestions', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should log suggestions with unlink capability enabled (default)', () => {
            logFileDependencySuggestions();

            expect(mockLogger.warn).toHaveBeenCalledWith('💡 To resolve this:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   1. Run "kodrdriv unlink" to restore registry versions');
            expect(mockLogger.warn).toHaveBeenCalledWith('   2. Complete your commit');
            expect(mockLogger.warn).toHaveBeenCalledWith('   3. Run "kodrdriv link" again for local development');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
            expect(mockLogger.warn).toHaveBeenCalledWith('   Or to bypass this check:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Add --skip-file-check flag to your command');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Or use git commit --no-verify to skip all hooks');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
        });

        it('should log suggestions with unlink capability explicitly enabled', () => {
            logFileDependencySuggestions(true);

            expect(mockLogger.warn).toHaveBeenCalledWith('💡 To resolve this:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   1. Run "kodrdriv unlink" to restore registry versions');
            expect(mockLogger.warn).toHaveBeenCalledWith('   2. Complete your commit');
            expect(mockLogger.warn).toHaveBeenCalledWith('   3. Run "kodrdriv link" again for local development');
        });

        it('should log suggestions with unlink capability disabled', () => {
            logFileDependencySuggestions(false);

            expect(mockLogger.warn).toHaveBeenCalledWith('💡 To resolve this:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   1. Manually restore registry versions in package.json files');
            expect(mockLogger.warn).toHaveBeenCalledWith('   2. Complete your commit');
            expect(mockLogger.warn).toHaveBeenCalledWith('   3. Re-link your local dependencies');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
            expect(mockLogger.warn).toHaveBeenCalledWith('   Or to bypass this check:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Add --skip-file-check flag to your command');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Or use git commit --no-verify to skip all hooks');
            expect(mockLogger.warn).toHaveBeenCalledWith('');
        });

        it('should log all bypass suggestions regardless of unlink capability', () => {
            logFileDependencySuggestions(false);

            expect(mockLogger.warn).toHaveBeenCalledWith('   Or to bypass this check:');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Add --skip-file-check flag to your command');
            expect(mockLogger.warn).toHaveBeenCalledWith('   - Or use git commit --no-verify to skip all hooks');
        });
    });
});
