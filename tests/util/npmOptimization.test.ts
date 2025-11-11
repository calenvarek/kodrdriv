import { describe, test, expect, beforeEach, vi, MockedFunction } from 'vitest';
import {
    isNpmInstallNeeded,
    optimizedNpmInstall,
    tryNpmCi,
    smartNpmInstall
} from '../../src/util/npmOptimizations';

// Mock modules with inline definitions
const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
};

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => mockLogger)
}));

vi.mock('@eldrforge/git-tools', () => ({
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

vi.mock('../../src/util/performance', () => ({
    PerformanceTimer: {
        start: vi.fn(() => ({
            end: vi.fn().mockReturnValue(1000)
        }))
    }
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn()
}));

// Helper function to create a mock storage utility
const createMockStorage = (overrides: any = {}) => ({
    exists: vi.fn(),
    isDirectory: vi.fn(),
    isFile: vi.fn(),
    isReadable: vi.fn(),
    isWritable: vi.fn(),
    isFileReadable: vi.fn(),
    isDirectoryWritable: vi.fn(),
    isDirectoryReadable: vi.fn(),
    createDirectory: vi.fn(),
    ensureDirectory: vi.fn(),
    readFile: vi.fn(),
    readStream: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    deleteFile: vi.fn(),
    forEachFileIn: vi.fn(),
    hashFile: vi.fn(),
    listFiles: vi.fn(),
    removeDirectory: vi.fn(),
    ...overrides
});

describe('npmOptimizations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isNpmInstallNeeded', () => {
        test('should return needed=true when no package-lock.json exists', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(false)
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: true,
                reason: 'No package-lock.json found'
            });
            expect(mockStorage.exists).toHaveBeenCalledWith('package-lock.json');
        });

        test('should return needed=true when no node_modules exists', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn()
                    .mockResolvedValueOnce(true)  // package-lock.json exists
                    .mockResolvedValueOnce(false) // node_modules doesn't exist
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: true,
                reason: 'No node_modules directory found'
            });
            expect(mockStorage.exists).toHaveBeenCalledWith('node_modules');
        });

        test('should return needed=true when node_modules is empty', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn()
                    .mockResolvedValueOnce(true) // package-lock.json exists
                    .mockResolvedValueOnce(true), // node_modules exists
                listFiles: vi.fn().mockResolvedValueOnce(['package.json']) // only 1 file
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: true,
                reason: 'node_modules appears empty or incomplete'
            });
            expect(mockStorage.listFiles).toHaveBeenCalledWith('node_modules');
        });

        test('should return needed=false when no package.json exists', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn()
                    .mockResolvedValueOnce(true) // package-lock.json exists
                    .mockResolvedValueOnce(true) // node_modules exists
                    .mockResolvedValueOnce(false), // package.json doesn't exist
                listFiles: vi.fn().mockResolvedValueOnce(['.bin', '.package-lock.json', 'lodash', 'react'])
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: false,
                reason: 'No package.json found'
            });
        });

        test('should return needed=false when dependencies appear up to date', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn()
                    .mockResolvedValueOnce(true) // package-lock.json exists
                    .mockResolvedValueOnce(true) // node_modules exists
                    .mockResolvedValueOnce(true), // package.json exists
                listFiles: vi.fn().mockResolvedValueOnce(['.bin', '.package-lock.json', 'lodash', 'react'])
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: false,
                reason: 'Dependencies appear to be up to date'
            });
        });

        test('should return needed=true when storage operations fail', async () => {
            const mockStorage = createMockStorage({
                exists: vi.fn().mockRejectedValueOnce(new Error('Storage error'))
            });

            const result = await isNpmInstallNeeded(mockStorage);

            expect(result).toEqual({
                needed: true,
                reason: 'Could not verify dependency status, installing to be safe'
            });

            expect(mockLogger.debug).toHaveBeenCalledWith('Failed to check npm install status: Storage error');
        });
    });

    describe('optimizedNpmInstall', () => {
        test('should run install when needed', async () => {
            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await optimizedNpmInstall({ skipIfNotNeeded: false });

            expect(result.skipped).toBe(false);
            expect(result.duration).toBe(1000);
            expect(result.reason).toBe('Installation completed successfully');
            expect(mockRun).toHaveBeenCalledWith('npm install --silent --prefer-offline --no-audit --no-fund');
        });

        test('should use verbose flag when verbose is true', async () => {
            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await optimizedNpmInstall({ skipIfNotNeeded: false, verbose: true });

            expect(mockRun).toHaveBeenCalledWith('npm install --prefer-offline --no-audit --no-fund');
        });

        test('should not use cache when useCache is false', async () => {
            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await optimizedNpmInstall({ skipIfNotNeeded: false, useCache: false });

            expect(mockRun).toHaveBeenCalledWith('npm install --silent --no-audit --no-fund');
        });

        test('should throw error when npm install fails', async () => {
            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockRejectedValueOnce(new Error('npm install failed'));

            await expect(optimizedNpmInstall({ skipIfNotNeeded: false }))
                .rejects.toThrow('Failed to run optimized npm install: npm install failed');
        });
    });

    describe('tryNpmCi', () => {
        test('should return success=false when no package-lock.json exists', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(false)
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);

            const result = await tryNpmCi();

            expect(result).toEqual({ success: false });
            expect(mockRun).not.toHaveBeenCalled();
        });

        test('should run npm ci successfully when package-lock.json exists', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(true)
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await tryNpmCi();

            expect(result).toEqual({ success: true, duration: 1000 });
            expect(mockRun).toHaveBeenCalledWith('npm ci --silent --no-audit --no-fund');
        });

        test('should return success=false when npm ci fails', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(true) // package-lock.json exists
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockRejectedValueOnce(new Error('npm ci failed'));

            const result = await tryNpmCi();

            expect(result).toEqual({ success: false });

            expect(mockLogger.verbose).toHaveBeenCalledWith('npm ci failed, will fall back to npm install: npm ci failed');
        });
    });

    describe('smartNpmInstall', () => {
        test('should use npm ci when preferCi is true and ci succeeds', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(true) // package-lock.json for ci
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' }); // npm ci succeeds

            const result = await smartNpmInstall({ preferCi: true });

            expect(result).toEqual({
                duration: 1000,
                method: 'npm ci',
                skipped: false
            });
            expect(mockRun).toHaveBeenCalledWith('npm ci --silent --no-audit --no-fund');
        });

        test('should skip npm ci when preferCi is false', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(false) // no package-lock.json for install check
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await smartNpmInstall({ preferCi: false });

            expect(result.method).toBe('npm install');
            // Should only be called once for npm install, not for npm ci
            expect(mockRun).toHaveBeenCalledTimes(1);
        });

        test('should respect verbose option', async () => {
            const { create } = await import('../../src/util/storage');
            const mockCreate = vi.mocked(create);
            const mockStorage = createMockStorage({
                exists: vi.fn().mockResolvedValueOnce(false) // no package-lock.json for install check
            });
            mockCreate.mockReturnValueOnce(mockStorage);

            const { run } = await import('@eldrforge/git-tools');
            const mockRun = vi.mocked(run);
            mockRun.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await smartNpmInstall({ preferCi: false, verbose: true });

            expect(mockRun).toHaveBeenCalledWith('npm install --prefer-offline --no-audit --no-fund');
        });
    });
});
