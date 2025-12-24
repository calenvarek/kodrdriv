import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('@eldrforge/shared', () => ({
    createStorage: vi.fn().mockReturnValue({
        isFileReadable: vi.fn(),
        readFile: vi.fn()
    })
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        verbose: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    })
}));

vi.mock('glob', () => ({
    glob: vi.fn()
}));

describe('files', () => {
    let Files: any;
    let createStorage: any;
    let getLogger: any;
    let glob: any;

    beforeEach(async () => {
        // Import modules after mocking
        const sharedModule = await import('@eldrforge/shared');
        createStorage = sharedModule.createStorage;
        getLogger = await import('../../src/logging');
        glob = await import('glob');
        Files = await import('../../src/content/files');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('create', () => {
        it('should create files instance and collect content successfully', async () => {
            const mockFiles = ['src/index.ts', 'package.json', 'README.md'];
            const mockFileContents = {
                'src/index.ts': 'console.log("Hello World");',
                'package.json': '{"name": "test-project"}',
                'README.md': '# Test Project'
            };

            glob.glob.mockResolvedValue(mockFiles);

            const mockStorage = {
                isFileReadable: vi.fn().mockResolvedValue(true),
                readFile: vi.fn().mockImplementation((filePath: string) => {
                    const relativePath = filePath.replace(process.cwd() + '/', '');
                    return Promise.resolve(mockFileContents[relativePath as keyof typeof mockFileContents] || '');
                })
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: ['node_modules', '.git'],
                maxTotalBytes: 100 * 1024,
                workingDirectory: process.cwd()
            });

            const result = await files.get();

            expect(glob.glob).toHaveBeenCalledWith(
                expect.arrayContaining([
                    '**/*',
                    '!**/node_modules/**',
                    '!**/.git/**'
                ]),
                expect.objectContaining({
                    cwd: process.cwd(),
                    nodir: true,
                    dot: false
                })
            );

            expect(result).toContain('File Content Analysis');
            expect(result).toContain('=== src/index.ts ===');
            expect(result).toContain('console.log("Hello World")');
            expect(result).toContain('=== package.json ===');
            expect(result).toContain('{"name": "test-project"}');
        });

        it('should handle empty file list gracefully', async () => {
            glob.glob.mockResolvedValue([]);

            const mockStorage = {
                isFileReadable: vi.fn(),
                readFile: vi.fn()
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: ['node_modules'],
                maxTotalBytes: 100 * 1024
            });

            const result = await files.get();

            expect(result).toBe('No readable files found in working directory.');
        });

        it('should respect maxTotalBytes limit', async () => {
            const mockFiles = ['file1.ts', 'file2.ts', 'file3.ts'];
            const largeContent = 'x'.repeat(1000); // 1000 bytes each

            glob.glob.mockResolvedValue(mockFiles);

            const mockStorage = {
                isFileReadable: vi.fn().mockResolvedValue(true),
                readFile: vi.fn().mockResolvedValue(largeContent)
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: [],
                maxTotalBytes: 2000 // Only allow 2 files worth of content
            });

            const result = await files.get();

            // Should stop after reading 3 files but only include 2 in output due to size limit
            expect(mockStorage.readFile).toHaveBeenCalledTimes(3);
            expect(result).toContain('=== file1.ts ===');
            expect(result).toContain('=== file2.ts ===');
            expect(result).not.toContain('=== file3.ts ===');
        });

        it('should skip unreadable files', async () => {
            const mockFiles = ['readable.ts', 'unreadable.ts'];

            glob.glob.mockResolvedValue(mockFiles);

            const mockStorage = {
                isFileReadable: vi.fn().mockImplementation((filePath: string) => {
                    const readable = filePath.includes('readable.ts') && !filePath.includes('unreadable.ts');
                    return Promise.resolve(readable);
                }),
                readFile: vi.fn().mockImplementation((filePath: string) => {
                    if (filePath.includes('readable.ts') && !filePath.includes('unreadable.ts')) {
                        return Promise.resolve('file content');
                    }
                    throw new Error('File not readable');
                })
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: [],
                maxTotalBytes: 100 * 1024
            });

            const result = await files.get();

            expect(result).toContain('=== readable.ts ===');
            expect(result).not.toContain('=== unreadable.ts ===');
            expect(result).toContain('Files Skipped: 1');
        });

        it('should truncate large individual files', async () => {
            const mockFiles = ['large-file.ts'];
            const largeContent = 'x'.repeat(20000); // 20KB content

            glob.glob.mockResolvedValue(mockFiles);

            const mockStorage = {
                isFileReadable: vi.fn().mockResolvedValue(true),
                readFile: vi.fn().mockResolvedValue(largeContent)
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: [],
                maxTotalBytes: 100 * 1024
            });

            const result = await files.get();

            expect(result).toContain('=== large-file.ts ===');
            expect(result).toContain('[TRUNCATED: File was 20000 bytes');
            expect(result).not.toContain('x'.repeat(20000)); // Should not contain full content
        });

        it('should handle file read errors gracefully', async () => {
            const mockFiles = ['error-file.ts', 'good-file.ts'];

            glob.glob.mockResolvedValue(mockFiles);

            const mockStorage = {
                isFileReadable: vi.fn().mockResolvedValue(true),
                readFile: vi.fn().mockImplementation((filePath: string) => {
                    if (filePath.includes('error-file')) {
                        throw new Error('Read error');
                    }
                    return Promise.resolve('good content');
                })
            };

            createStorage.mockReturnValue(mockStorage);

            const files = await Files.create({
                excludedPatterns: [],
                maxTotalBytes: 100 * 1024
            });

            const result = await files.get();

            // Should skip the error file and continue with good file
            expect(result).toContain('=== good-file.ts ===');
            expect(result).toContain('good content');
            expect(result).not.toContain('=== error-file.ts ===');
        });
    });
});
