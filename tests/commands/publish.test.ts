import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock all dependencies
vi.mock('../../src/commands/commit', () => ({
    execute: vi.fn()
}));

vi.mock('../../src/commands/release', () => ({
    execute: vi.fn()
}));

vi.mock('../../src/content/diff', () => ({
    hasStagedChanges: vi.fn()
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }))
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn()
}));

vi.mock('../../src/util/github', () => ({
    getCurrentBranchName: vi.fn(),
    findOpenPullRequestByHeadRef: vi.fn(),
    createPullRequest: vi.fn(),
    waitForPullRequestChecks: vi.fn(),
    mergePullRequest: vi.fn(),
    createRelease: vi.fn()
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn(() => ({
        exists: vi.fn(),
        rename: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn()
    }))
}));

vi.mock('../../src/util/general', () => ({
    incrementPatchVersion: vi.fn()
}));

describe('publish command', () => {
    let Publish: any;
    let Commit: any;
    let Release: any;
    let Diff: any;
    let Child: any;
    let GitHub: any;
    let Storage: any;
    let General: any;
    let mockLogger: any;
    let mockStorage: any;

    beforeEach(async () => {
        // Import modules after mocking
        Commit = await import('../../src/commands/commit');
        Release = await import('../../src/commands/release');
        Diff = await import('../../src/content/diff');
        Child = await import('../../src/util/child');
        GitHub = await import('../../src/util/github');
        Storage = await import('../../src/util/storage');
        General = await import('../../src/util/general');
        Publish = await import('../../src/commands/publish');

        // Setup default mocks
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn()
        };

        mockStorage = {
            exists: vi.fn(),
            rename: vi.fn(),
            writeFile: vi.fn(),
            readFile: vi.fn()
        };

        Storage.create.mockReturnValue(mockStorage);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('execute', () => {
        const mockConfig = {
            model: 'gpt-4o-mini'
        };

        it('should execute complete publish workflow when no existing PR is found', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes\n\nNew features...';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValueOnce(true); // pnpm-workspace.yaml exists
            mockStorage.exists.mockResolvedValueOnce(false); // backup doesn't exist initially
            Diff.hasStagedChanges.mockResolvedValue(true);
            Commit.execute.mockResolvedValue('feat: update dependencies');
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'feat: update dependencies' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfig);

            // Assert - Verify the complete workflow
            expect(GitHub.getCurrentBranchName).toHaveBeenCalled();
            expect(GitHub.findOpenPullRequestByHeadRef).toHaveBeenCalledWith(mockBranchName);
            expect(mockStorage.rename).toHaveBeenCalledWith(
                expect.stringContaining('pnpm-workspace.yaml'),
                expect.stringContaining('pnpm-workspace.yaml.bak')
            );
            expect(Child.run).toHaveBeenCalledWith('pnpm update --latest');
            expect(Child.run).toHaveBeenCalledWith('git add package.json pnpm-lock.yaml');
            expect(Child.run).toHaveBeenCalledWith('pnpm run clean && pnpm run lint && pnpm run build && pnpm run test');
            expect(Diff.hasStagedChanges).toHaveBeenCalled();
            expect(Commit.execute).toHaveBeenCalledWith(mockConfig);
            expect(Child.run).toHaveBeenCalledWith('pnpm version patch');
            expect(Release.execute).toHaveBeenCalledWith(mockConfig);
            expect(mockStorage.writeFile).toHaveBeenCalledWith('RELEASE_NOTES.md', mockReleaseNotes, 'utf-8');
            expect(Child.run).toHaveBeenCalledWith('git push --follow-tags');
            expect(GitHub.createPullRequest).toHaveBeenCalledWith('feat: update dependencies', 'Automated release PR.', mockBranchName);
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(123);
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'squash');
            expect(Child.run).toHaveBeenCalledWith('git checkout main');
            expect(Child.run).toHaveBeenCalledWith('git pull origin main');
            expect(GitHub.createRelease).toHaveBeenCalledWith('v0.0.4', mockReleaseNotes);
            expect(Child.run).toHaveBeenCalledWith('git checkout -b release/0.0.5');
            expect(Child.run).toHaveBeenCalledWith('git push -u origin release/0.0.5');
        });

        it('should handle existing pull request and skip initial setup', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockExistingPR = {
                number: 456,
                html_url: 'https://github.com/owner/repo/pull/456'
            };
            const mockReleaseNotes = '# Release Notes\n\nExisting PR...';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockExistingPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfig);

            // Assert - Verify it skips initial setup but continues with PR workflow
            expect(GitHub.findOpenPullRequestByHeadRef).toHaveBeenCalledWith(mockBranchName);
            expect(mockStorage.rename).not.toHaveBeenCalled(); // Should skip workspace file operations
            expect(Child.run).not.toHaveBeenCalledWith('pnpm update --latest'); // Should skip dependency updates
            expect(Commit.execute).not.toHaveBeenCalled(); // Should skip commit
            expect(GitHub.createPullRequest).not.toHaveBeenCalled(); // Should skip PR creation
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(456);
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(456, 'squash');
            expect(GitHub.createRelease).toHaveBeenCalledWith('v0.0.4', mockReleaseNotes);
        });

        it('should skip commit when no staged changes are found', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false); // No workspace file
            Diff.hasStagedChanges.mockResolvedValue(false); // No staged changes
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump commit' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfig);

            // Assert
            expect(Diff.hasStagedChanges).toHaveBeenCalled();
            expect(Commit.execute).not.toHaveBeenCalled();
        });

        it('should handle case when pnpm-workspace.yaml does not exist', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false); // pnpm-workspace.yaml doesn't exist
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfig);

            // Assert
            expect(mockStorage.rename).not.toHaveBeenCalled();
            expect(Child.run).toHaveBeenCalledWith('pnpm update --latest');
        });

        it('should restore workspace file even if an error occurs', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            mockStorage.exists.mockResolvedValueOnce(true); // workspace file exists
            mockStorage.exists.mockResolvedValueOnce(true); // backup exists for restoration
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            Child.run.mockRejectedValue(new Error('Build failed'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Build failed');
            expect(mockStorage.rename).toHaveBeenCalledWith(
                expect.stringContaining('pnpm-workspace.yaml.bak'),
                expect.stringContaining('pnpm-workspace.yaml')
            );
        });

        it('should throw error when PR creation fails', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockReleaseNotes = '# Release Notes';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(null); // Simulate PR creation failure

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to create pull request.');
        });

        it('should handle pre-flight checks failure', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Child.run.mockImplementation((command: string) => {
                if (command === 'pnpm run clean && pnpm run lint && pnpm run build && pnpm run test') {
                    return Promise.reject(new Error('Tests failed'));
                }
                return Promise.resolve({ stdout: '' });
            });

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Tests failed');
        });

        it('should handle GitHub API errors during PR checks', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockRejectedValue(new Error('GitHub API error'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('GitHub API error');
        });

        it('should handle release creation failure', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockRejectedValue(new Error('Release creation failed'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Release creation failed');
        });

        it('should handle file operations errors gracefully', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';
            const mockReleaseNotes = '# Release Notes';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Child.run.mockImplementation((command: string) => {
                // Allow all commands to succeed until we get to the file write operation
                return Promise.resolve({ stdout: '' });
            });
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            mockStorage.writeFile.mockRejectedValue(new Error('File write failed'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('File write failed');
        });

        it('should use configured merge method when merging PR', async () => {
            // Arrange
            const mockConfigWithMergeMethod = {
                model: 'gpt-4o-mini',
                publish: {
                    mergeMethod: 'merge' as const
                }
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithMergeMethod);

            // Assert - Verify merge method is passed correctly
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'merge');
        });

        it('should use default squash merge method when no merge method is configured', async () => {
            // Arrange
            const mockConfigWithoutMergeMethod = {
                model: 'gpt-4o-mini'
                // No publish configuration
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithoutMergeMethod);

            // Assert - Verify default squash method is used
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'squash');
        });

        it('should use dependency update patterns when provided', async () => {
            // Arrange
            const mockConfigWithPatterns = {
                model: 'gpt-4o-mini',
                publish: {
                    dependencyUpdatePatterns: ['@company/*', '@myorg/*']
                }
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithPatterns);

            // Assert - Verify patterns are used in pnpm update command
            expect(Child.run).toHaveBeenCalledWith('pnpm update --latest @company/* @myorg/*');
        });

        it('should update all dependencies when no patterns are provided', async () => {
            // Arrange
            const mockConfigWithoutPatterns = {
                model: 'gpt-4o-mini',
                publish: {
                    mergeMethod: 'squash' as const
                    // No dependencyUpdatePatterns
                }
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithoutPatterns);

            // Assert - Verify fallback to update all dependencies
            expect(Child.run).toHaveBeenCalledWith('pnpm update --latest');
        });

        it('should handle empty dependency update patterns array', async () => {
            // Arrange
            const mockConfigWithEmptyPatterns = {
                model: 'gpt-4o-mini',
                publish: {
                    dependencyUpdatePatterns: []
                }
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotes = '# Release Notes';
            const mockPackageJson = '{"version": "0.0.4"}';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            mockStorage.exists.mockResolvedValue(false);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue(mockReleaseNotes);
            Child.run.mockImplementation((command: string) => {
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                return Promise.resolve({ stdout: '' });
            });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotes);
                }
                if (filename === 'package.json') {
                    return Promise.resolve(mockPackageJson);
                }
                return Promise.resolve('');
            });
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithEmptyPatterns);

            // Assert - Verify fallback to update all dependencies when empty array
            expect(Child.run).toHaveBeenCalledWith('pnpm update --latest');
        });
    });
}); 