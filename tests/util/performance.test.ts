import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import path from 'path';
import {
    PerformanceTimer,
    batchReadPackageJsonFiles,
    findAllPackageJsonFiles,
    scanDirectoryForPackages,
    findPackagesByScope,
    collectAllDependencies,
    checkForFileDependencies,
    PackageJson,
    PackageJsonLocation
} from '../../src/util/performance';

// Mock the logger
const mockLogger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    silly: vi.fn(),
    warn: vi.fn()
};

// Mock the getLogger function
vi.mock('../../src/logging', () => ({
    getLogger: () => mockLogger
}));

// Mock storage interface
const createMockStorage = () => ({
    readFile: vi.fn(),
    exists: vi.fn(),
    isDirectory: vi.fn(),
    listFiles: vi.fn()
});

describe('PerformanceTimer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(1000);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with logger and current time', () => {
            const timer = new PerformanceTimer(mockLogger);
            expect(timer).toBeInstanceOf(PerformanceTimer);
        });
    });

    describe('start', () => {
        it('should log operation start and return timer instance', () => {
            const timer = PerformanceTimer.start(mockLogger, 'test operation');

            expect(mockLogger.verbose).toHaveBeenCalledWith('⏱️  Starting: test operation');
            expect(timer).toBeInstanceOf(PerformanceTimer);
        });
    });

    describe('end', () => {
        it('should log operation completion and return duration', () => {
            vi.spyOn(Date, 'now')
                .mockReturnValueOnce(1000) // start time
                .mockReturnValueOnce(1500); // end time

            const timer = new PerformanceTimer(mockLogger);
            const duration = timer.end('test operation');

            expect(duration).toBe(500);
            expect(mockLogger.verbose).toHaveBeenCalledWith('⏱️  Completed: test operation (500ms)');
        });
    });
});

describe('batchReadPackageJsonFiles', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
        mockStorage = createMockStorage();
        vi.clearAllMocks();
    });

    it('should read valid package.json files in parallel', async () => {
        const packageJsonPaths = ['/path/to/package1.json', '/path/to/package2.json'];
        const rootDir = '/root';

        const packageJson1 = { name: 'package1', dependencies: { lodash: '^4.0.0' } };
        const packageJson2 = { name: 'package2', devDependencies: { jest: '^29.0.0' } };

        mockStorage.readFile
            .mockResolvedValueOnce(JSON.stringify(packageJson1))
            .mockResolvedValueOnce(JSON.stringify(packageJson2));

        const result = await batchReadPackageJsonFiles(packageJsonPaths, mockStorage, rootDir);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            path: '/path/to/package1.json',
            packageJson: packageJson1,
            relativePath: '../path/to'
        });
        expect(result[1]).toEqual({
            path: '/path/to/package2.json',
            packageJson: packageJson2,
            relativePath: '../path/to'
        });
    });

    it('should handle invalid JSON gracefully', async () => {
        const packageJsonPaths = ['/path/to/valid.json', '/path/to/invalid.json'];
        const rootDir = '/root';

        mockStorage.readFile
            .mockResolvedValueOnce('{"name": "valid"}')
            .mockResolvedValueOnce('invalid json');

        const result = await batchReadPackageJsonFiles(packageJsonPaths, mockStorage, rootDir);

        expect(result).toHaveLength(1);
        expect(result[0].packageJson.name).toBe('valid');
        expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Skipped invalid package.json at /path/to/invalid.json')
        );
    });

    it('should handle file read errors', async () => {
        const packageJsonPaths = ['/path/to/missing.json'];
        const rootDir = '/root';

        mockStorage.readFile.mockRejectedValueOnce(new Error('File not found'));

        const result = await batchReadPackageJsonFiles(packageJsonPaths, mockStorage, rootDir);

        expect(result).toHaveLength(0);
        expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Skipped invalid package.json at /path/to/missing.json')
        );
    });

    it('should handle root directory correctly', async () => {
        const packageJsonPaths = ['/root/package.json'];
        const rootDir = '/root';

        mockStorage.readFile.mockResolvedValueOnce('{"name": "root-package"}');

        const result = await batchReadPackageJsonFiles(packageJsonPaths, mockStorage, rootDir);

        expect(result[0].relativePath).toBe('.');
    });
});

describe('findAllPackageJsonFiles', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
        mockStorage = createMockStorage();
        vi.clearAllMocks();
    });

    it('should find package.json files recursively', async () => {
        const rootDir = '/project';

        // Mock directory structure
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory
            .mockResolvedValueOnce(true) // /project
            .mockResolvedValueOnce(true) // /project/packages
            .mockResolvedValueOnce(true); // /project/packages/utils

        mockStorage.listFiles
            .mockResolvedValueOnce(['packages', 'package.json']) // /project
            .mockResolvedValueOnce(['utils']) // /project/packages
            .mockResolvedValueOnce(['package.json']); // /project/packages/utils

        mockStorage.readFile
            .mockResolvedValueOnce('{"name": "root"}')
            .mockResolvedValueOnce('{"name": "utils"}');

        const result = await findAllPackageJsonFiles(rootDir, mockStorage);

        expect(result).toHaveLength(1);
        expect(result.map(r => r.packageJson.name)).toEqual(['root']);
    });

    it('should skip excluded directories', async () => {
        const rootDir = '/project';

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);
        mockStorage.listFiles.mockResolvedValueOnce(['node_modules', 'src', 'package.json']);

        mockStorage.readFile.mockResolvedValueOnce('{"name": "project"}');

        const result = await findAllPackageJsonFiles(rootDir, mockStorage);

        // Should only call isDirectory for 'src', not 'node_modules'
        expect(mockStorage.isDirectory).toHaveBeenCalledWith(path.join(rootDir, 'src'));
        expect(mockStorage.isDirectory).not.toHaveBeenCalledWith(path.join(rootDir, 'node_modules'));
    });

    it('should handle directory access errors', async () => {
        const rootDir = '/project';

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);
        mockStorage.listFiles.mockRejectedValueOnce(new Error('Permission denied'));

        const result = await findAllPackageJsonFiles(rootDir, mockStorage);

        expect(result).toHaveLength(0);
        expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Failed to scan directory')
        );
    });

    it('should limit recursion depth', async () => {
        const rootDir = '/project';

        // Create a very deep directory structure
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);
        mockStorage.listFiles.mockResolvedValue(['deep']);

        const result = await findAllPackageJsonFiles(rootDir, mockStorage);

        // Should not recurse beyond depth 5
        expect(mockStorage.listFiles).toHaveBeenCalledTimes(6); // 0, 1, 2, 3, 4, 5
    });
});

describe('scanDirectoryForPackages', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
        mockStorage = createMockStorage();
        vi.clearAllMocks();
        vi.spyOn(process, 'cwd').mockReturnValue('/current');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should scan directory and find packages', async () => {
        const rootDir = 'packages';

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory
            .mockResolvedValueOnce(true) // packages directory
            .mockResolvedValueOnce(true) // utils subdirectory
            .mockResolvedValueOnce(true); // tools subdirectory

        mockStorage.listFiles.mockResolvedValueOnce(['utils', 'tools']);
        mockStorage.readFile
            .mockResolvedValueOnce('{"name": "@myorg/utils"}')
            .mockResolvedValueOnce('{"name": "@myorg/tools"}');

        const result = await scanDirectoryForPackages(rootDir, mockStorage);

        expect(result.size).toBe(2);
        expect(result.get('@myorg/utils')).toBe('packages/utils');
        expect(result.get('@myorg/tools')).toBe('packages/tools');
    });

    it('should handle missing directory', async () => {
        const rootDir = 'nonexistent';

        mockStorage.exists.mockResolvedValue(false);

        const result = await scanDirectoryForPackages(rootDir, mockStorage);

        expect(result.size).toBe(0);
    });

    it('should skip directories without package.json', async () => {
        const rootDir = 'packages';

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory
            .mockResolvedValueOnce(true) // packages directory
            .mockResolvedValueOnce(true); // utils subdirectory

        mockStorage.listFiles.mockResolvedValueOnce(['utils']);

        const result = await scanDirectoryForPackages(rootDir, mockStorage);

        expect(result.size).toBe(0);
    });

    it('should skip packages without name', async () => {
        const rootDir = 'packages';

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true);

        mockStorage.listFiles.mockResolvedValueOnce(['utils']);
        mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');

        const result = await scanDirectoryForPackages(rootDir, mockStorage);

        expect(result.size).toBe(0);
    });
});

describe('findPackagesByScope', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
        mockStorage = createMockStorage();
        vi.clearAllMocks();
        vi.spyOn(process, 'cwd').mockReturnValue('/current');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should find packages by scope', async () => {
        const dependencies = {
            '@myorg/utils': '^1.0.0',
            '@myorg/tools': '^2.0.0',
            'lodash': '^4.0.0'
        };
        const scopeRoots = {
            '@myorg': 'packages'
        };

        // Mock scanDirectoryForPackages behavior
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true);

        mockStorage.listFiles.mockResolvedValueOnce(['utils', 'tools']);
        mockStorage.readFile
            .mockResolvedValueOnce('{"name": "@myorg/utils"}')
            .mockResolvedValueOnce('{"name": "@myorg/tools"}');

        const result = await findPackagesByScope(dependencies, scopeRoots, mockStorage);

        expect(result.size).toBe(2);
        expect(result.get('@myorg/utils')).toBe('packages/utils');
        expect(result.get('@myorg/tools')).toBe('packages/tools');
        expect(result.has('lodash')).toBe(false);
    });

    it('should handle multiple scopes', async () => {
        const dependencies = {
            '@myorg/utils': '^1.0.0',
            '@otherorg/helper': '^1.0.0'
        };
        const scopeRoots = {
            '@myorg': 'packages',
            '@otherorg': 'other-packages'
        };

        // Mock for @myorg scope
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);
        mockStorage.listFiles
            .mockResolvedValueOnce(['utils'])
            .mockResolvedValueOnce(['helper']);
        mockStorage.readFile
            .mockResolvedValueOnce('{"name": "@myorg/utils"}')
            .mockResolvedValueOnce('{"name": "@otherorg/helper"}');

        const result = await findPackagesByScope(dependencies, scopeRoots, mockStorage);

        expect(result.size).toBe(2);
        expect(result.get('@myorg/utils')).toBe('packages/utils');
        expect(result.get('@otherorg/helper')).toBe('other-packages/helper');
    });
});

describe('collectAllDependencies', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should collect all types of dependencies', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: {
                    name: 'project',
                    dependencies: { 'dep1': '^1.0.0' },
                    devDependencies: { 'dev1': '^2.0.0' },
                    peerDependencies: { 'peer1': '^3.0.0' }
                }
            },
            {
                path: '/project/packages/utils/package.json',
                relativePath: 'packages/utils',
                packageJson: {
                    name: 'utils',
                    dependencies: { 'dep2': '^1.0.0' },
                    devDependencies: { 'dev2': '^2.0.0' }
                }
            }
        ];

        const result = collectAllDependencies(packageJsonFiles);

        expect(result).toEqual({
            'dep1': '^1.0.0',
            'dev1': '^2.0.0',
            'peer1': '^3.0.0',
            'dep2': '^1.0.0',
            'dev2': '^2.0.0'
        });
    });

    it('should handle packages without dependencies', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: { name: 'project' }
            }
        ];

        const result = collectAllDependencies(packageJsonFiles);

        expect(result).toEqual({});
    });

    it('should handle duplicate dependencies', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package1.json',
                relativePath: 'package1',
                packageJson: {
                    name: 'package1',
                    dependencies: { 'lodash': '^4.0.0' }
                }
            },
            {
                path: '/project/package2.json',
                relativePath: 'package2',
                packageJson: {
                    name: 'package2',
                    dependencies: { 'lodash': '^4.1.0' }
                }
            }
        ];

        const result = collectAllDependencies(packageJsonFiles);

        // Later packages should override earlier ones
        expect(result.lodash).toBe('^4.1.0');
    });
});

describe('checkForFileDependencies', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should detect file: dependencies and log warnings', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: {
                    name: 'project',
                    dependencies: {
                        '@myorg/utils': 'file:../utils',
                        'lodash': '^4.0.0'
                    },
                    devDependencies: {
                        '@myorg/tools': 'file:../tools'
                    }
                }
            },
            {
                path: '/project/clean/package.json',
                relativePath: 'clean',
                packageJson: {
                    name: 'clean',
                    dependencies: {
                        'lodash': '^4.0.0'
                    }
                }
            }
        ];

        checkForFileDependencies(packageJsonFiles);

        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_WARNING: Found file: dependencies that should not be committed | Count: 1 | Impact: May cause build issues');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_PACKAGE: Package with file dependencies | Path: .');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_DETAIL: File dependency detected | Dependency: @myorg/utils: file:../utils');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_DETAIL: File dependency detected | Dependency: @myorg/tools: file:../tools');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_RESOLUTION: Action required before committing | Command: kodrdriv unlink | Purpose: Restore registry versions');
    });

    it('should not log warnings when no file: dependencies exist', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: {
                    name: 'project',
                    dependencies: {
                        'lodash': '^4.0.0'
                    }
                }
            }
        ];

        checkForFileDependencies(packageJsonFiles);

        expect(mockLogger.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('WARNING: Found file: dependencies')
        );
    });

    it('should handle packages without dependencies', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: { name: 'project' }
            }
        ];

        checkForFileDependencies(packageJsonFiles);

        expect(mockLogger.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('WARNING: Found file: dependencies')
        );
    });

    it('should check all dependency types for file: paths', () => {
        const packageJsonFiles: PackageJsonLocation[] = [
            {
                path: '/project/package.json',
                relativePath: '.',
                packageJson: {
                    name: 'project',
                    dependencies: { 'dep1': 'file:../dep1' },
                    devDependencies: { 'dev1': 'file:../dev1' },
                    peerDependencies: { 'peer1': 'file:../peer1' }
                }
            }
        ];

        checkForFileDependencies(packageJsonFiles);

        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_DETAIL: File dependency detected | Dependency: dep1: file:../dep1');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_DETAIL: File dependency detected | Dependency: dev1: file:../dev1');
        expect(mockLogger.warn).toHaveBeenCalledWith('FILE_DEPS_DETAIL: File dependency detected | Dependency: peer1: file:../peer1');
    });
});
