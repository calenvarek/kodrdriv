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
}));

// Mock the git utilities
vi.mock('../../src/util/git', () => ({
    localBranchExists: vi.fn(),
    remoteBranchExists: vi.fn(),
    safeSyncBranchWithRemote: vi.fn(),
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

    beforeEach(async () => {
        vi.clearAllMocks();

        // Import modules after mocking
        const { getDryRunLogger } = await import('../../src/logging');
        const { create: createStorage } = await import('../../src/util/storage');
        const { run } = await import('../../src/util/child');
        const { localBranchExists, safeSyncBranchWithRemote } = await import('../../src/util/git');
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            expect(mockRun).toHaveBeenCalledWith('git checkout main');
            expect(mockRun).toHaveBeenCalledWith('git checkout -b working');
            expect(mockRun).toHaveBeenCalledWith('npm install');
            expect(mockCommitExecute).toHaveBeenCalled();
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            expect(mockRun).toHaveBeenCalledWith('git checkout main');
            expect(mockRun).toHaveBeenCalledWith('git checkout working');
            expect(mockRun).toHaveBeenCalledWith('git merge main --no-ff -m "Merge main into working for development"');
            expect(mockStorage.writeFile).toHaveBeenCalledWith('package.json', expect.stringContaining('"version": "1.0.1-dev.0"'), 'utf-8');
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
            mockRun.mockResolvedValueOnce({ stdout: 'working' });
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

            expect(result).toBe('Already on working branch with development version');
        });

        it('should handle git sync errors gracefully', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch' }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
            // Mock main package.json version
            mockRun.mockResolvedValueOnce({ stdout: '{"version": "1.0.0"}' });
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });
            // Mock working branch doesn't exist
            mockLocalBranchExists.mockResolvedValueOnce(false);
            // Mock sync with remote failure with conflict
            mockSafeSyncBranchWithRemote.mockResolvedValueOnce({
                success: false,
                conflictResolutionRequired: true,
                error: 'Branch has diverged'
            });

            await expect(Development.execute(runConfig)).rejects.toThrow(
                'Main branch has diverged from remote and requires manual conflict resolution: Branch has diverged'
            );
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            // Should create 1.1.0-dev.0 (minor bump)
            expect(mockStorage.writeFile).toHaveBeenCalledWith('package.json', expect.stringContaining('"version": "1.1.0-dev.0"'), 'utf-8');
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            // Should create 2.0.0-dev.0 (major bump)
            expect(mockStorage.writeFile).toHaveBeenCalledWith('package.json', expect.stringContaining('"version": "2.0.0-dev.0"'), 'utf-8');
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
            // Should create 3.5.0-dev.0 (explicit version)
            expect(mockStorage.writeFile).toHaveBeenCalledWith('package.json', expect.stringContaining('"version": "3.5.0-dev.0"'), 'utf-8');
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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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
        it('should create and manage milestones when enabled', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch', noMilestones: false }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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

            // Should call milestone management with new version (1.0.1) and old version (1.0.0)
            const GitHubModule = await import('../../src/util/github');
            expect(GitHubModule.ensureMilestoneForVersion).toHaveBeenCalledWith('1.0.1', '1.0.0');
        });

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
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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

        it('should continue if milestone management fails', async () => {
            const runConfig = {
                dryRun: false,
                development: { targetVersion: 'patch', noMilestones: false }
            };

            // Mock current working directory package.json
            mockStorage.readFile.mockResolvedValueOnce('{"version": "1.0.0"}');
            mockSafeJsonParse.mockReturnValueOnce({ version: '1.0.0' });
            mockValidatePackageJson.mockReturnValueOnce({ version: '1.0.0' });

            // Mock current branch as main
            mockRun.mockResolvedValueOnce({ stdout: 'main' });
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

            // Mock milestone management failure
            const GitHubModule = await import('../../src/util/github');
            (GitHubModule.ensureMilestoneForVersion as any).mockRejectedValueOnce(new Error('GitHub API error'));

            const result = await Development.execute(runConfig);

            // Should still complete successfully despite milestone failure
            expect(result).toBe('Created working branch with development version');
            expect(GitHubModule.ensureMilestoneForVersion).toHaveBeenCalledWith('1.0.1', '1.0.0');
        });
    });
});
