import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the logging module
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

// Mock the storage module
vi.mock('../../src/util/storage', () => ({
    create: vi.fn().mockReturnValue({
        readFile: vi.fn(),
        writeFile: vi.fn(),
        exists: vi.fn(),
    })
}));

// Mock the validation module
vi.mock('../../src/util/validation', () => ({
    safeJsonParse: vi.fn(),
    validatePackageJson: vi.fn(),
}));

// Mock the child process module
vi.mock('../../src/util/child', () => ({
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

// Mock the git utilities
vi.mock('../../src/util/git', () => ({
    localBranchExists: vi.fn(),
    remoteBranchExists: vi.fn(),
    safeSyncBranchWithRemote: vi.fn(),
    getCurrentBranch: vi.fn(),
}));

// Mock the GitHub utilities
vi.mock('../../src/util/github', () => ({
    ensureMilestoneForVersion: vi.fn(),
    closeMilestoneForVersion: vi.fn(),
    findMilestoneByTitle: vi.fn(),
    createMilestone: vi.fn(),
    closeMilestone: vi.fn(),
    getOpenIssuesForMilestone: vi.fn(),
    moveIssueToMilestone: vi.fn(),
    moveOpenIssuesToNewMilestone: vi.fn(),
}));

// Mock the commit command
vi.mock('../../src/commands/commit', () => ({
    execute: vi.fn(),
}));

// Mock fs/promises module
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
}));

describe('development command', () => {
    let Development: any;
    let mockLogger: any;
    let mockStorage: any;
    let mockRun: any;
    let mockLocalBranchExists: any;
    let mockSafeSyncBranchWithRemote: any;
    let mockSafeJsonParse: any;
    let mockValidatePackageJson: any;
    let mockCommitExecute: any;
    let mockGetCurrentBranch: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Import modules after mocking
        const { getDryRunLogger } = await import('../../src/logging');
        const { create: createStorage } = await import('../../src/util/storage');
        const { run, runSecure, validateGitRef } = await import('../../src/util/child');
        const { localBranchExists, safeSyncBranchWithRemote, getCurrentBranch } = await import('../../src/util/git');
        const { safeJsonParse, validatePackageJson } = await import('../../src/util/validation');
        const { execute: commitExecute } = await import('../../src/commands/commit');
        Development = await import('../../src/commands/development');

        mockLogger = (getDryRunLogger as any)(false);
        mockStorage = (createStorage as any)();
        mockRun = run as any;
        mockLocalBranchExists = localBranchExists as any;
        mockSafeSyncBranchWithRemote = safeSyncBranchWithRemote as any;
        mockSafeJsonParse = safeJsonParse as any;
        mockValidatePackageJson = validatePackageJson as any;
        mockCommitExecute = commitExecute as any;
        mockGetCurrentBranch = getCurrentBranch as any;

        // Configure validateGitRef mock to return true for valid branch names
        (validateGitRef as any).mockReturnValue(true);

        // Configure runSecure mock to return expected structure for git commands
        (runSecure as any).mockResolvedValue({ stdout: '{"version": "1.0.0"}', stderr: '' });

        // Reset run mock to default behavior
        mockRun.mockImplementation((command: string) => {
            if (command.includes('git branch --show-current')) {
                return Promise.resolve({ stdout: 'main' });
            }
            if (command.includes('git show main:package.json')) {
                return Promise.resolve({ stdout: '{"version": "1.0.0"}' });
            }
            if (command.includes('git show working:package.json')) {
                return Promise.resolve({ stdout: '{"version": "1.0.0"}' });
            }
            return Promise.resolve({ stdout: '' });
        });

        // Reset getCurrentBranch mock to return 'main' by default
        mockGetCurrentBranch.mockResolvedValue('main');
    });

    describe('execute', () => {
        it('should handle dry run mode correctly', async () => {
            const runConfig = {
                dryRun: true,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            // In dry run mode, the actual git commands shouldn't be executed
            expect(mockRun).not.toHaveBeenCalledWith('git checkout -b working');
        });

        it('should create working branch from main when working branch does not exist', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            expect(mockRun).toHaveBeenCalledWith('git fetch origin');
            expect(mockRun).toHaveBeenCalledWith('git checkout -b working');
            expect(mockRun).toHaveBeenCalledWith('npm version prepatch --preid=dev');
        });

        it('should switch to working branch and merge main when working branch exists', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch exists
            mockLocalBranchExists.mockResolvedValueOnce(true);
            // Mock working branch version (lower than main, needs bump)
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "0.9.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '0.9.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '0.9.0' });
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Updated working branch with development version');
            expect(mockRun).toHaveBeenCalledWith('git fetch origin');
            expect(mockRun).toHaveBeenCalledWith('git checkout working');
            expect(mockRun).toHaveBeenCalledWith('npm version prepatch --preid=dev');
        });

        it('should do nothing when already on working branch with proper development version', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json with dev version
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.1.0-dev.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.1.0-dev.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.1.0-dev.0' });

            // Mock current branch as working
            mockGetCurrentBranch.mockResolvedValueOnce('working');

            // Mock fs.readFile for the early return logic
            const fs = await import('fs/promises');
            vi.mocked(fs.readFile).mockResolvedValueOnce('{"version": "1.1.0-dev.0"}' as any);
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch exists
            mockLocalBranchExists.mockResolvedValueOnce(true);
            // Mock working branch version (already ahead)
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.1.0-dev.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.1.0-dev.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.1.0-dev.0' });

            const result = await Development.execute(runConfig);

            expect(result).toBe('Updated working branch with development version');
        });


        it('should use correct development version for minor bump', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'minor' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            // Should create 1.1.0-dev.0 (minor bump) via npm version
            expect(mockRun).toHaveBeenCalledWith('npm version preminor --preid=dev');
        });

        it('should use correct development version for major bump', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'major' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            // Should create 2.0.0-dev.0 (major bump) via npm version
            expect(mockRun).toHaveBeenCalledWith('npm version premajor --preid=dev');
        });

        it('should use explicit version when provided', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: '3.5.0' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            // Should create 3.5.0-dev.0 (explicit version) via npm version
            expect(mockRun).toHaveBeenCalledWith('npm version 3.5.0-dev.0');
        });

        it('should throw error for invalid explicit version', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'invalid-version' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });

            await expect(Development.execute(runConfig)).rejects.toThrow(
                'Invalid target version: invalid-version. Expected "patch", "minor", "major", or a valid version string like "2.1.0"'
            );
        });
    });

    describe('milestone integration', () => {

        it('should skip milestone management when disabled', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch', noMilestones: true }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            await Development.execute(runConfig);

            // Should not call milestone management
            const GitHubModule = await import('../../src/util/github');
            expect(GitHubModule.ensureMilestoneForVersion).not.toHaveBeenCalled();
        });










        it('should handle working branch with version bump needed (unusual state)', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json with lower version
            mockStorage.readFile.mockResolvedValueOnce('{"version": "0.9.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '0.9.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '0.9.0' });

            // Mock current branch as working
            mockGetCurrentBranch.mockResolvedValueOnce('working');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch exists
            mockLocalBranchExists.mockResolvedValueOnce(true);
            // Mock working branch version (lower than main, needs bump)
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "0.9.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '0.9.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '0.9.0' });
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "0.9.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '0.9.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '0.9.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Updated working branch with development version');
            // Should create 1.0.1-dev.0 via npm version
            expect(mockRun).toHaveBeenCalledWith('npm version prepatch --preid=dev');
        });

        it('should handle explicit version with v prefix', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'v3.5.0' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValueOnce('main');
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote success
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({ success: true });
            // Mock successful package.json update
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock commit execution
            mockCommitExecute.mockResolvedValueOnce('Committed development version');

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            // Should create 3.5.0-dev.0 (explicit version with v prefix removed) via npm version
            expect(mockRun).toHaveBeenCalledWith('npm version 3.5.0-dev.0');
        });

        it('should merge development into working when on development branch', async () => {
            const runConfig = {
                dryRun: false
            };

            // Reset mocks to ensure clean state
            mockRun.mockReset();
            mockGetCurrentBranch.mockReset();
            mockLocalBranchExists.mockReset();

            // Mock current branch as development - must be consistent!
            mockGetCurrentBranch.mockResolvedValue('development');

            // Mock working branch exists
            mockLocalBranchExists.mockResolvedValue(true);

            // Mock git status and other commands
            mockRun.mockImplementation((command: string) => {
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' }); // No changes
                }
                if (command === 'git fetch origin') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command.startsWith('git checkout')) {
                    return Promise.resolve({ stdout: '' });
                }
                if (command.startsWith('git merge')) {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'npm install') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            const result = await Development.execute(runConfig);

            expect(result).toBe('Merged development into working and ready for development');
            expect(mockRun).toHaveBeenCalledWith('git fetch origin');
            expect(mockRun).toHaveBeenCalledWith('git checkout working');
            expect(mockRun).toHaveBeenCalledWith('git merge development --no-ff -m "Merge development into working for continued development"');
            expect(mockRun).toHaveBeenCalledWith('npm install');
            // Should NOT switch back to development branch (this was the bug)
            expect(mockRun).not.toHaveBeenCalledWith('git checkout development');
        });

        it('should handle merge conflicts when merging development into working', async () => {
            const runConfig = {
                dryRun: false
            };

            // Mock current branch as main (so it goes through regular merge logic)
            mockGetCurrentBranch.mockResolvedValueOnce('main');

            // Mock working branch exists
            mockLocalBranchExists.mockResolvedValueOnce(true);

            // Mock development branch exists for the merge step
            mockLocalBranchExists.mockResolvedValueOnce(true);

            // Mock merge conflict
            mockRun.mockImplementation((command: string) => {
                if (command.includes('git merge development')) {
                    const error = new Error('CONFLICT (content): Merge conflict in package.json');
                    throw error;
                }
                return Promise.resolve({ stdout: '' });
            });

            await expect(Development.execute(runConfig)).rejects.toThrow(
                'Merge conflicts detected when merging development into working. Please resolve conflicts manually.'
            );
        });

    });

    describe('utility functions', () => {
        it('should parse version strings correctly', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Reset mocks
            mockRun.mockReset();
            mockGetCurrentBranch.mockReset();
            mockLocalBranchExists.mockReset();
            mockStorage.readFile.mockReset();
            mockSafeJsonParse.mockReset();
            mockValidatePackageJson.mockReset();

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValue('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValue({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValue({ version: '1.0.0' });

            // Mock current branch as main
            mockGetCurrentBranch.mockResolvedValue('main');

            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValue(false);

            // Mock all run commands
            mockRun.mockImplementation((command: string) => {
                if (command === 'git fetch origin') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git checkout -b working') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command.includes('npm version')) {
                    return Promise.resolve({ stdout: 'v1.1.0-dev.0' });
                }
                return Promise.resolve({ stdout: '' });
            });

            const result = await Development.execute(runConfig);

            expect(result).toBe('Created working branch with development version');
            expect(mockRun).toHaveBeenCalledWith('git checkout -b working');
        });


    });
});

