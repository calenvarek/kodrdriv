import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Unlink from '../../src/commands/unlink';
import { Config } from '../../src/types';
import { KODRDRIV_DEFAULTS } from '../../src/constants';

// Mock the dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
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

vi.mock('fs', () => ({
    promises: {
        unlink: vi.fn(),
        rm: vi.fn(),
    },
}));

describe('Unlink Command', () => {
    let mockConfig: Config;
    let mockStorage: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        mockConfig = {
            ...KODRDRIV_DEFAULTS,
            link: {
                scopeRoots: { '@test': '../test-packages' },
                workspaceFile: 'pnpm-workspace.yaml',
                dryRun: false,
            },
        };

        mockStorage = {
            exists: vi.fn(),
            isDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            listFiles: vi.fn(),
        };

        const storageModule = await import('../../src/util/storage');
        vi.mocked(storageModule.create).mockReturnValue(mockStorage);
    });

    it('should throw error when package.json not found', async () => {
        mockStorage.exists.mockResolvedValue(false);

        await expect(Unlink.execute(mockConfig)).rejects.toThrow('package.json not found in current directory.');
    });

    it('should throw error when no scope roots configured', async () => {
        const configWithoutScopes = {
            ...mockConfig,
            link: {
                ...mockConfig.link,
                scopeRoots: {},
            },
        };

        mockStorage.exists.mockResolvedValue(true);
        mockStorage.readFile.mockResolvedValue('{"name": "test-package"}');

        await expect(Unlink.execute(configWithoutScopes)).rejects.toThrow('No scope roots configured');
    });

    it('should return message when no packages found for unlinking', async () => {
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.readFile.mockResolvedValue('{"name": "test-package"}');
        mockStorage.isDirectory.mockResolvedValue(false);
        mockStorage.listFiles.mockResolvedValue([]);

        const result = await Unlink.execute(mockConfig);

        expect(result).toBe('No packages found matching scope roots for unlinking.');
    });

    it('should handle dry run mode', async () => {
        const dryRunConfig = {
            ...mockConfig,
            dryRun: true,
        };

        // Mock file system calls in order
        mockStorage.exists.mockImplementation((path: string) => {
            // Package.json exists
            if (path.includes('package.json')) return Promise.resolve(true);
            // Workspace file exists
            if (path.includes('pnpm-workspace.yaml')) return Promise.resolve(true);
            // Test packages directory exists
            if (path.includes('test-packages')) return Promise.resolve(true);
            return Promise.resolve(false);
        });

        mockStorage.isDirectory.mockImplementation((path: string) => {
            if (path.includes('test-packages')) return Promise.resolve(true);
            if (path.includes('package-a')) return Promise.resolve(true);
            return Promise.resolve(false);
        });

        mockStorage.listFiles.mockImplementation((path: string) => {
            if (path.includes('test-packages')) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((path: string) => {
            if (path.endsWith('package.json') && !path.includes('package-a')) {
                // Main package.json
                return Promise.resolve('{"name": "test-package"}');
            }
            if (path.includes('package-a/package.json')) {
                // Package A's package.json with scope matching our config
                return Promise.resolve('{"name": "@test/package-a"}');
            }
            if (path.includes('pnpm-workspace.yaml')) {
                // Existing workspace file containing the package we want to unlink
                return Promise.resolve('packages:\n  - ../test-packages/package-a');
            }
            return Promise.resolve('');
        });

        const result = await Unlink.execute(dryRunConfig);

        expect(result).toContain('Successfully unlinked');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
    });
}); 