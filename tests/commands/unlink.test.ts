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

    it('should remove overrides from pnpm-workspace.yaml', async () => {
        // Arrange
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === testPackagesPath) return Promise.resolve(['package-a', 'package-b']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-b', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-b' }));
            }
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve("overrides:\n  '@test/package-a': 'link:../test-packages/package-a'\n  '@other/package': '1.0.0'\n");
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toContain('Successfully unlinked 1 sibling packages');
        expect(result).toContain('@test/package-a');

        const writeFileCall = mockStorage.writeFile.mock.calls[0];
        expect(writeFileCall[0]).toContain('pnpm-workspace.yaml');
        const writtenContent = writeFileCall[1];
        expect(writtenContent).not.toContain('@test/package-a');
        expect(writtenContent).toContain("'@other/package': 1.0.0");
        expect(Child.run).toHaveBeenCalledWith('pnpm install');
    });

    it('should return message when no packages found for unlinking', async () => {
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.readFile.mockResolvedValue('{"name": "test-package"}');
        mockStorage.isDirectory.mockResolvedValue(false);
        mockStorage.listFiles.mockResolvedValue([]);

        const result = await Unlink.execute(mockConfig);

        expect(result).toBe('No packages found matching scope roots for unlinking.');
    });

    it('should handle dry run mode correctly', async () => {
        const dryRunConfig = { ...mockConfig, dryRun: true };
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
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve("overrides:\n  '@test/package-a': 'link:../test-packages/package-a'\n");
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(dryRunConfig);

        // Assert
        expect(result).toContain('Successfully unlinked 1 sibling packages');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
        expect(Child.run).not.toHaveBeenCalled();
    });

    it('should correctly remove all overrides if all are unlinked', async () => {
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
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve("overrides:\n  '@test/package-a': 'link:../test-packages/package-a'\n");
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls[0];
        expect(writeFileCall[1].trim()).toBe('{}');
        expect(Child.run).toHaveBeenCalledWith('pnpm install');
    });

    it('should preserve other properties in pnpm-workspace.yaml when unlinking', async () => {
        // Arrange
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === testPackagesPath) return Promise.resolve(['package-a']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve(
                    `packages:
  - 'packages/*'
overrides:
  '@test/package-a': 'link:../test-packages/package-a'
  '@another/unrelated': 2.0.0`
                );
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls[0];
        expect(writeFileCall[0]).toContain('pnpm-workspace.yaml');
        const writtenContent = writeFileCall[1];
        expect(writtenContent).toContain('packages:');
        expect(writtenContent).toContain(`  - 'packages/*'`);
        expect(writtenContent).not.toContain('@test/package-a');
        expect(writtenContent).toContain(`'@another/unrelated': 2.0.0`);
        expect(Child.run).toHaveBeenCalledWith('pnpm install');
    });

    it('should do nothing if pnpm-workspace.yaml has no overrides', async () => {
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
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve(
                    `packages:
  - 'packages/*'`
                );
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toBe('No overrides found in workspace file. Nothing to do.');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
        expect(Child.run).not.toHaveBeenCalled();
    });

    it('should do nothing if no overrides match scope roots', async () => {
        // Arrange
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');
        mockStorage.listFiles.mockResolvedValue(['package-a']); // finds @test/package-a
        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
            }
            if (filePath === path.join(testPackagesPath, 'package-a', 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: '@test/package-a' }));
            }
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve(
                    `overrides:
  '@another/package': '1.0.0'
  '@unrelated/package': 'link:../some-other-place'`
                );
            }
            return Promise.resolve('');
        });

        // Act
        const result = await Unlink.execute(mockConfig);

        // Assert
        expect(result).toBe('No linked packages found in workspace file that match scope roots.');
        expect(mockStorage.writeFile).not.toHaveBeenCalled();
        expect(Child.run).not.toHaveBeenCalled();
    });

    it('should throw error for invalid pnpm-workspace.yaml', async () => {
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
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve("invalid: yaml:");
            }
            return Promise.resolve('');
        });

        // Act & Assert
        await expect(Unlink.execute(mockConfig)).rejects.toThrow('Failed to parse existing workspace file');
    });

    it('should throw error for invalid package.json', async () => {
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.readFile.mockResolvedValue('not a valid json');

        await expect(Unlink.execute(mockConfig)).rejects.toThrow('Failed to parse package.json');
    });

    it('should skip packages with invalid package.json during scan', async () => {
        // Arrange
        mockStorage.exists.mockResolvedValue(true);
        mockStorage.isDirectory.mockResolvedValue(true);

        const testPackagesPath = path.resolve(process.cwd(), '../test-packages');

        mockStorage.listFiles.mockImplementation((filePath: string) => {
            if (filePath === testPackagesPath) return Promise.resolve(['package-a', 'package-b', 'package-c']);
            return Promise.resolve([]);
        });

        mockStorage.readFile.mockImplementation((filePath: string) => {
            if (filePath === path.join(process.cwd(), 'package.json')) {
                return Promise.resolve(JSON.stringify({ name: 'test-package' }));
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
            if (filePath.includes('pnpm-workspace.yaml')) {
                return Promise.resolve(`overrides:
  '@test/package-a': 'link:../test-packages/package-a'
  '@test/package-c': 'link:../test-packages/package-c'
`);
            }
            return Promise.resolve('');
        });

        // Act
        await Unlink.execute(mockConfig);

        // Assert
        const writeFileCall = mockStorage.writeFile.mock.calls[0];
        const writtenContent = writeFileCall[1];
        expect(writtenContent.trim()).toBe('{}');
        // The real test is that no error was thrown, and only valid packages were unlinked
    });
}); 