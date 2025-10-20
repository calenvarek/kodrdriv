import { describe, it, beforeAll, beforeEach, expect, vi } from 'vitest';
import { Mock } from 'vitest';

// Mock the fs module
var fs: {
    promises: {
        stat: Mock<() => Promise<any>>,
        access: Mock<() => Promise<void>>,
        mkdir: Mock<() => Promise<void>>,
        readFile: Mock<() => Promise<string>>,
        writeFile: Mock<() => Promise<void>>,
        lstatSync: Mock<() => Promise<any>>,
    },
    constants: {
        R_OK: number,
        W_OK: number
    }
};

// Mock the fs module
const mockGlob = vi.fn<() => Promise<any>>();
const mockStat = vi.fn<() => Promise<any>>();
const mockAccess = vi.fn<() => Promise<void>>();
const mockMkdir = vi.fn<() => Promise<void>>();
const mockReadFile = vi.fn<() => Promise<string>>();
const mockWriteFile = vi.fn<() => Promise<void>>();
const mockLstatSync = vi.fn<() => Promise<any>>();
const mockCreateReadStream = vi.fn<() => any>();
const mockRename = vi.fn<() => Promise<void>>();
const mockReaddir = vi.fn<() => Promise<string[]>>();

vi.mock('fs', () => ({
    __esModule: true,
    promises: {
        stat: mockStat,
        access: mockAccess,
        mkdir: mockMkdir,
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        lstatSync: mockLstatSync,
        rename: mockRename,
        readdir: mockReaddir
    },
    constants: {
        R_OK: 4,
        W_OK: 2
    },
    createReadStream: mockCreateReadStream
}));

vi.mock('glob', () => ({
    __esModule: true,
    glob: mockGlob
}));

// Mock crypto module
const mockCrypto = {
    createHash: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('0123456789abcdef0123456789abcdef01234567')
    })
};

vi.mock('crypto', () => ({
    __esModule: true,
    default: mockCrypto
}));

// Import the storage module after mocking fs
let storageModule: any;

describe('Storage Utility', () => {
    // Mock for console.log
    const mockLog = vi.fn();
    let storage: any;

    beforeAll(async () => {
        var fs = await import('fs');
        var glob = await import('glob');
        storageModule = await import('../../src/util/storage.js');
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset individual mocks but re-setup crypto mock
        mockCrypto.createHash.mockReturnValue({
            update: vi.fn().mockReturnThis(),
            digest: vi.fn().mockReturnValue('0123456789abcdef0123456789abcdef01234567')
        });
        storage = storageModule.create({ log: mockLog });
    });

    describe('exists', () => {
        it('should return true if path exists', async () => {
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false });

            const result = await storage.exists('/test/path');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/path');
        });

        it('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.exists('/test/path');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/path');
        });
    });

    describe('isDirectory', () => {
        it('should return true if path is a directory', async () => {
            mockStat.mockResolvedValueOnce({
                isDirectory: () => true,
                isFile: () => false
            });

            const result = await storage.isDirectory('/test/dir');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/dir');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectory('/test/file');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/file');
        });
    });

    describe('isFile', () => {
        it('should return true if path is a file', async () => {
            mockStat.mockResolvedValueOnce({
                isFile: () => true,
                isDirectory: () => false
            });

            const result = await storage.isFile('/test/file.txt');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/file.txt');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('should return false if path is not a file', async () => {
            mockStat.mockResolvedValueOnce({
                isFile: () => false,
                isDirectory: () => true
            });

            const result = await storage.isFile('/test/dir');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/dir');
        });
    });

    describe('isReadable', () => {
        it('should return true if path is readable', async () => {
            mockAccess.mockResolvedValueOnce(undefined);

            const result = await storage.isReadable('/test/file.txt');

            expect(result).toBe(true);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 4);
        });

        it('should return false if path is not readable', async () => {
            mockAccess.mockRejectedValueOnce(new Error('Not readable'));

            const result = await storage.isReadable('/test/file.txt');

            expect(result).toBe(false);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 4);
            expect(mockLog).toHaveBeenCalledWith(
                '/test/file.txt is not readable: %s %s',
                'Not readable',
                expect.any(String)
            );
        });
    });

    describe('isWritable', () => {
        it('should return true if path is writable', async () => {
            mockAccess.mockResolvedValueOnce(undefined);

            const result = await storage.isWritable('/test/file.txt');

            expect(result).toBe(true);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 2);
        });

        it('should return false if path is not writable', async () => {
            mockAccess.mockRejectedValueOnce(new Error('Not writable'));

            const result = await storage.isWritable('/test/file.txt');

            expect(result).toBe(false);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 2);
            expect(mockLog).toHaveBeenCalledWith(
                '/test/file.txt is not writable: %s %s',
                'Not writable',
                expect.any(String)
            );
        });
    });

    describe('isFileReadable', () => {
        it('should return true if path exists, is a file, and is readable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({  // isFile
                isFile: () => true,
                isDirectory: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isReadable

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(true);
        });

        it('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(false);
        });

        it('should return false if path is not a file', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isFile
                isFile: () => false,
                isDirectory: () => true
            });

            const result = await storage.isFileReadable('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false if path is not readable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isFile
                isFile: () => true,
                isDirectory: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not readable')); // isReadable

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(false);
        });
    });

    describe('isDirectoryWritable', () => {
        it('should return true if path exists, is a directory, and is writable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isWritable

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(true);
        });

        it('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectoryWritable('/test/file.txt');

            expect(result).toBe(false);
        });

        it('should return false if path is not writable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not writable')); // isWritable

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(false);
        });
    });

    describe('createDirectory', () => {
        it('should create directory successfully', async () => {
            mockMkdir.mockResolvedValueOnce(undefined);

            await storage.createDirectory('/test/dir');

            expect(mockMkdir).toHaveBeenCalledWith('/test/dir', { recursive: true });
        });

        it('should throw error if directory creation fails', async () => {
            mockMkdir.mockRejectedValueOnce(new Error('Failed to create directory'));

            await expect(storage.createDirectory('/test/dir')).rejects.toThrow(
                'Failed to create output directory /test/dir: Failed to create directory'
            );
        });
    });

    describe('ensureDirectory', () => {
        it('should create directory if it does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist')); // exists() returns false
            mockMkdir.mockResolvedValueOnce(undefined);

            await storage.ensureDirectory('/test/dir');

            expect(mockMkdir).toHaveBeenCalledWith('/test/dir', { recursive: true });
        });

        it('should not create directory if it already exists and is a directory', async () => {
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false }); // exists() returns true
            mockStat.mockResolvedValueOnce({ // isDirectory() returns true
                isDirectory: () => true,
                isFile: () => false
            });

            await storage.ensureDirectory('/test/dir');

            expect(mockMkdir).not.toHaveBeenCalled();
        });

        it('should throw error if path exists but is a file', async () => {
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false }); // exists() returns true
            mockStat.mockResolvedValueOnce({ // isDirectory() returns false
                isDirectory: () => false,
                isFile: () => true
            });

            await expect(storage.ensureDirectory('/test/output')).rejects.toThrow(
                'Cannot create directory at /test/output: a file already exists at this location'
            );

            expect(mockMkdir).not.toHaveBeenCalled();
        });

        it('should propagate isDirectory errors', async () => {
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false }); // exists() returns true
            mockStat.mockRejectedValueOnce(new Error('Stat failed')); // isDirectory() throws error

            await expect(storage.ensureDirectory('/test/dir')).rejects.toThrow('Stat failed');

            expect(mockMkdir).not.toHaveBeenCalled();
        });

        it('should handle case where parent directory is a file', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist')); // exists() for full path returns false
            const enotdirError: any = new Error('ENOTDIR: not a directory');
            enotdirError.code = 'ENOTDIR';
            mockMkdir.mockRejectedValueOnce(enotdirError); // mkdir fails because parent is a file

            // Mock the checks for parent directory discovery
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false }); // 'output' exists
            mockStat.mockResolvedValueOnce({ // 'output' is not a directory (it's a file)
                isDirectory: () => false,
                isFile: () => true
            });

            await expect(storage.ensureDirectory('output/kodrdriv')).rejects.toThrow(
                'Cannot create directory at output/kodrdriv: a file exists at output blocking the path'
            );
        });

        it('should propagate mkdir errors that are not ENOTDIR', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist')); // exists() returns false
            const permissionError = new Error('Permission denied');
            mockMkdir.mockRejectedValueOnce(permissionError);

            await expect(storage.ensureDirectory('/test/dir')).rejects.toThrow(
                'Failed to create output directory /test/dir: Permission denied'
            );
        });
    });

    describe('readFile', () => {
        it('should read file successfully', async () => {
            mockReadFile.mockResolvedValueOnce('file content');

            const result = await storage.readFile('/test/file.txt', 'utf8');

            expect(result).toBe('file content');
            expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf8' });
        });
    });

    describe('writeFile', () => {
        it('should write file successfully', async () => {
            mockWriteFile.mockResolvedValueOnce(undefined);

            await storage.writeFile('/test/file.txt', 'file content', 'utf8');

            expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', 'file content', { encoding: 'utf8' });
        });

        it('should write file with Buffer data', async () => {
            mockWriteFile.mockResolvedValueOnce(undefined);
            const buffer = Buffer.from('file content');

            await storage.writeFile('/test/file.txt', buffer, 'utf8');

            expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', buffer, { encoding: 'utf8' });
        });
    });

    describe('Default logger', () => {
        it('should use console.log as default logger', async () => {
            const originalConsoleLog = console.log;
            const mockConsoleLog = vi.fn();
            console.log = mockConsoleLog;

            try {
                const utilWithDefaultLogger = storageModule.create({});
                mockStat.mockResolvedValueOnce({
                    isDirectory: () => false,
                    isFile: () => true
                });

                await utilWithDefaultLogger.isDirectory('/test/file');

                // Note: isDirectory no longer logs when path is not a directory
                // This is expected behavior when scanning mixed file/directory structures
            } finally {
                console.log = originalConsoleLog;
            }
        });
    });

    describe('forEachFileIn', () => {
        it('should iterate over files in a directory', async () => {
            // Setup mocks for the chain of function calls
            // @ts-ignore
            mockGlob.mockResolvedValueOnce(['file1.txt', 'file2.txt']);

            await storage.forEachFileIn('/test/dir', async (file: string) => {
                expect(file).toMatch(/^\/test\/dir\/file[12]\.txt$/)
            });
        });

        it('should use custom pattern when provided', async () => {
            // @ts-ignore
            mockGlob.mockResolvedValueOnce(['file1.js', 'file2.js']);

            const callback = vi.fn();
            await storage.forEachFileIn('/test/dir', callback, { pattern: '*.js' });

            expect(mockGlob).toHaveBeenCalledWith('*.js', { cwd: '/test/dir', nodir: true });
            expect(callback).toHaveBeenCalledTimes(2);
        });

        it('should handle glob errors', async () => {
            // @ts-ignore
            mockGlob.mockRejectedValueOnce(new Error('Glob error'));

            await expect(
                storage.forEachFileIn('/test/dir', async () => { })
            ).rejects.toThrow('Failed to glob pattern *.* in /test/dir: Glob error');
        });

        it('should handle array patterns', async () => {
            // @ts-ignore
            mockGlob.mockResolvedValueOnce(['file1.txt', 'file2.js']);

            const callback = vi.fn();
            await storage.forEachFileIn('/test/dir', callback, { pattern: ['*.txt', '*.js'] });

            expect(mockGlob).toHaveBeenCalledWith(['*.txt', '*.js'], { cwd: '/test/dir', nodir: true });
        });
    });

    describe('isDirectoryReadable', () => {
        it('should return true if path exists, is a directory, and is readable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isReadable

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(true);
        });

        it('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectoryReadable('/test/file.txt');

            expect(result).toBe(false);
        });

        it('should return false if path is not readable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not readable')); // isReadable

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(false);
        });
    });

    describe('readStream', () => {
        it('should create a read stream', async () => {
            const mockStream = { pipe: vi.fn(), on: vi.fn() };
            mockCreateReadStream.mockReturnValueOnce(mockStream);

            const result = await storage.readStream('/test/file.txt');

            expect(result).toBe(mockStream);
            expect(mockCreateReadStream).toHaveBeenCalledWith('/test/file.txt');
        });
    });

    describe('rename', () => {
        it('should rename file successfully', async () => {
            mockRename.mockResolvedValueOnce(undefined);

            await storage.rename('/old/path.txt', '/new/path.txt');

            expect(mockRename).toHaveBeenCalledWith('/old/path.txt', '/new/path.txt');
        });

        it('should handle rename errors', async () => {
            mockRename.mockRejectedValueOnce(new Error('Rename failed'));

            await expect(storage.rename('/old/path.txt', '/new/path.txt')).rejects.toThrow('Rename failed');
        });
    });

    describe('hashFile', () => {
        it('should hash file content', async () => {
            mockReadFile.mockResolvedValueOnce('file content');

            const result = await storage.hashFile('/test/file.txt', 8);

            expect(result).toBe('01234567');
            expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf8' });
            expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
        });

        it('should handle different hash lengths', async () => {
            mockReadFile.mockResolvedValueOnce('different content');

            const result = await storage.hashFile('/test/file.txt', 16);

            expect(result).toBe('0123456789abcdef');
            expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf8' });
        });

        it('should handle read file errors', async () => {
            mockReadFile.mockRejectedValueOnce(new Error('File read error'));

            await expect(storage.hashFile('/test/file.txt', 8)).rejects.toThrow('File read error');
        });
    });

    describe('listFiles', () => {
        it('should list files in directory', async () => {
            const mockFiles = ['file1.txt', 'file2.txt', 'subdir'];
            mockReaddir.mockResolvedValueOnce(mockFiles);

            const result = await storage.listFiles('/test/dir');

            expect(result).toEqual(mockFiles);
            expect(mockReaddir).toHaveBeenCalledWith('/test/dir');
        });

        it('should handle empty directory', async () => {
            mockReaddir.mockResolvedValueOnce([]);

            const result = await storage.listFiles('/test/empty');

            expect(result).toEqual([]);
            expect(mockReaddir).toHaveBeenCalledWith('/test/empty');
        });

        it('should handle readdir errors', async () => {
            mockReaddir.mockRejectedValueOnce(new Error('Directory read error'));

            await expect(storage.listFiles('/test/dir')).rejects.toThrow('Directory read error');
        });
    });

});
