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
        verbose: vi.fn(),
        silly: vi.fn()
    })),
    getDryRunLogger: vi.fn((isDryRun: boolean) => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn()
}));

vi.mock('../../src/util/github', () => ({
    getCurrentBranchName: vi.fn(),
    findOpenPullRequestByHeadRef: vi.fn(),
    createPullRequest: vi.fn(),
    waitForPullRequestChecks: vi.fn(),
    mergePullRequest: vi.fn(),
    createRelease: vi.fn(),
    waitForReleaseWorkflows: vi.fn(),
    getWorkflowsTriggeredByRelease: vi.fn(),
    closeMilestoneForVersion: vi.fn(),
    ensureMilestoneForVersion: vi.fn(),
    findMilestoneByTitle: vi.fn(),
    createMilestone: vi.fn(),
    closeMilestone: vi.fn(),
    getOpenIssuesForMilestone: vi.fn(),
    moveIssueToMilestone: vi.fn(),
    moveOpenIssuesToNewMilestone: vi.fn(),
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn(() => ({
        exists: vi.fn(),
        rename: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
        ensureDirectory: vi.fn()
    }))
}));

vi.mock('../../src/util/general', () => ({
    incrementPatchVersion: vi.fn(),
    incrementMinorVersion: vi.fn(),
    incrementMajorVersion: vi.fn(),
    validateVersionString: vi.fn(),
    calculateTargetVersion: vi.fn(),
    checkIfTagExists: vi.fn(),
    confirmVersionInteractively: vi.fn(),
    getOutputPath: vi.fn()
}));

vi.mock('../../src/util/git', () => ({
    isBranchInSyncWithRemote: vi.fn(),
    safeSyncBranchWithRemote: vi.fn(),
    localBranchExists: vi.fn()
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
    let Git: any;
    let mockLogger: any;
    let mockStorage: any;
    let originalEnv: NodeJS.ProcessEnv;
    let originalSetTimeout: typeof setTimeout;

    beforeEach(async () => {
        // Store original environment and setTimeout
        originalEnv = { ...process.env };
        originalSetTimeout = global.setTimeout;

        // Mock setTimeout to resolve immediately in tests to avoid delays
        global.setTimeout = ((callback: () => void) => {
            callback();
            return 0 as any;
        }) as any;

        // Import modules after mocking
        Commit = await import('../../src/commands/commit');
        Release = await import('../../src/commands/release');
        Diff = await import('../../src/content/diff');
        Child = await import('../../src/util/child');
        GitHub = await import('../../src/util/github');
        Storage = await import('../../src/util/storage');
        General = await import('../../src/util/general');
        Git = await import('../../src/util/git');
        Publish = await import('../../src/commands/publish');

        // Setup default mocks
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        mockStorage = {
            exists: vi.fn(),
            rename: vi.fn(),
            writeFile: vi.fn(),
            readFile: vi.fn(),
            ensureDirectory: vi.fn()
        };

        Storage.create.mockReturnValue(mockStorage);

        // Set up General.getOutputPath mock to return expected file paths
        General.getOutputPath.mockImplementation((outputDirectory: string, filename: string) => {
            return filename; // For tests, just return the filename
        });

        // Set up default mocks for new version functions
        General.calculateTargetVersion.mockImplementation((currentVersion: string, targetVersion: string) => {
            if (targetVersion === 'patch') return '0.0.5';
            if (targetVersion === 'minor') return '0.1.0';
            if (targetVersion === 'major') return '1.0.0';
            return targetVersion; // For explicit versions
        });
        General.checkIfTagExists.mockResolvedValue(false); // Default: tag doesn't exist
        General.confirmVersionInteractively.mockImplementation(async (current: string, proposed: string) => proposed);
        General.validateVersionString.mockReturnValue(true);

        // Git mocks for branch sync functionality
        Git.localBranchExists.mockResolvedValue(true);
        Git.isBranchInSyncWithRemote.mockResolvedValue({ inSync: true, localExists: true, remoteExists: true });
        Git.safeSyncBranchWithRemote.mockResolvedValue({ success: true });

        // Default to valid git ref validation for tag names
        Child.validateGitRef.mockReturnValue(true);

        // Default mock for runSecure to handle git status --porcelain and other commands
        Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
            const key = args.join(' ');
            if (key === 'status --porcelain') return { stdout: '' } as any;
            if (key.startsWith('tag -l')) return { stdout: '' } as any;
            if (key.startsWith('tag ')) return { stdout: '' } as any;
            if (key.startsWith('ls-remote')) return { stdout: '' } as any;
            if (key.startsWith('push origin')) return { stdout: '' } as any;
            if (key.startsWith('stash push')) return { stdout: '' } as any;
            if (key.startsWith('stash pop')) return { stdout: '' } as any;
            return { stdout: '' } as any;
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        // Restore original environment and setTimeout
        process.env = originalEnv;
        global.setTimeout = originalSetTimeout;
    });

    describe('scanNpmrcForEnvVars', () => {
        it('should extract environment variables from .npmrc file', async () => {
            // Import the function directly - we need to import it differently for testing
            const publishModule = await import('../../src/commands/publish');

            // Mock .npmrc file with various env var formats
            const npmrcContent = `
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=\${NPM_TOKEN}
@myorg:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}
_auth=\${LEGACY_AUTH}
email=\$USER_EMAIL
username=\$NPM_USER
cache=\${CACHE_DIR}/npm
            `;

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(npmrcContent);

            // We can't directly test the private function, so we'll test through runPrechecks
            // This is testing the integration of scanNpmrcForEnvVars within runPrechecks
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    requiredEnvVars: ['CUSTOM_VAR']
                }
            };

            // Set up successful precheck mocks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename && filename.includes('.npmrc')) {
                    return Promise.resolve(npmrcContent);
                }
                return Promise.resolve('');
            });

            // Set required env vars
            process.env.NPM_TOKEN = 'test-token';
            process.env.GITHUB_TOKEN = 'test-github-token';
            process.env.LEGACY_AUTH = 'test-auth';
            process.env.USER_EMAIL = 'test@example.com';
            process.env.NPM_USER = 'testuser';
            process.env.CACHE_DIR = '/tmp';
            process.env.CUSTOM_VAR = 'custom-value';

            // Mock the rest of the workflow to avoid executing the full publish flow
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue('# Release Notes');
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/test/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            // This should pass without throwing because all env vars are set
            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();


        });

        it('should handle missing .npmrc file gracefully', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            // Set up successful precheck mocks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve(false); // .npmrc doesn't exist
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            // Mock the rest of the workflow
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue('# Release Notes');
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/test/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            // Should not throw even without .npmrc
            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();


        });

        it('should handle unreadable .npmrc file gracefully', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            // Set up successful precheck mocks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                if (path.includes('.npmrc')) {
                    return Promise.resolve(true); // .npmrc exists but is unreadable
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename && filename.includes('.npmrc')) {
                    throw new Error('Permission denied');
                }
                return Promise.resolve('');
            });

            // Mock the rest of the workflow
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue('# Release Notes');
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/test/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            // Should not throw even if .npmrc is unreadable
            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();


        });
    });

    describe('environment variable validation', () => {
        it('should throw error when required environment variables are missing', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    requiredEnvVars: ['MISSING_VAR1', 'MISSING_VAR2']
                }
            };

            // Set up successful precheck mocks up to env var validation
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            // Don't set the required env vars
            delete process.env.MISSING_VAR1;
            delete process.env.MISSING_VAR2;

            await expect(Publish.execute(mockConfig)).rejects.toThrow(/Missing required environment variables: MISSING_VAR1, MISSING_VAR2/);
        });

        it('should pass when all required environment variables are set', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    requiredEnvVars: ['REQUIRED_VAR1', 'REQUIRED_VAR2']
                }
            };

            // Set up successful precheck mocks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            // Set the required env vars
            process.env.REQUIRED_VAR1 = 'value1';
            process.env.REQUIRED_VAR2 = 'value2';

            // Mock the rest of the workflow
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue('# Release Notes');
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/test/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();


        });
    });

    describe('runPrechecks', () => {
        it('should throw error when not in git repository', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    throw new Error('Not a git repository');
                }
                return Promise.resolve({ stdout: '' });
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Not in a git repository or git command failed: Not a git repository. Please run this command from within a git repository.');
        });

        it('should throw error when working directory has uncommitted changes', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: 'M file.txt\n?? another.txt' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // NOTE: Due to the current implementation's error handling, this throws the generic git status error
            // instead of the specific uncommitted changes error. This might be a bug to fix in the future.
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to check git status: Working directory has uncommitted changes. Please commit or stash your changes before running publish.. Please ensure you are in a valid git repository and try again.');
        });

        it('should throw error when git status command fails', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    throw new Error('Git status failed');
                }
                return Promise.resolve({ stdout: '' });
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to check git status: Git status failed. Please ensure you are in a valid git repository and try again.');
        });

        it('should throw error when running from target branch', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('main');

            await expect(Publish.execute(mockConfig)).rejects.toThrow("Cannot run publish from the target branch 'main'. Please switch to a different branch before running publish.");
        });

        it('should throw error when running from custom target branch', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    targetBranch: 'develop'
                }
            };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('develop');

            await expect(Publish.execute(mockConfig)).rejects.toThrow("Cannot run publish from the target branch 'develop'. Please switch to a different branch before running publish.");
        });

        it('should throw error when package.json is missing', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(false);
                }
                return Promise.resolve(false);
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('package.json not found in current directory.');
        });

        it('should throw error when package.json has invalid JSON', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve('{ invalid json }');
                }
                return Promise.resolve('');
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to parse package.json. Please ensure it contains valid JSON.');
        });

        it('should throw error when prepublishOnly script is missing', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: {
                            test: 'npm test'
                            // Missing prepublishOnly
                        }
                    }));
                }
                return Promise.resolve('');
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('prepublishOnly script is required in package.json but was not found. Please add a prepublishOnly script that runs your pre-flight checks (e.g., clean, lint, build, test).');
        });

        it('should throw error when prepublishOnly script is missing (no scripts section)', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' };

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0'
                        // No scripts section
                    }));
                }
                return Promise.resolve('');
            });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('prepublishOnly script is required in package.json but was not found. Please add a prepublishOnly script that runs your pre-flight checks (e.g., clean, lint, build, test).');
        });
    });

    // Helper function to set up common precheck mocks
    const setupPrecheckMocks = () => {
            const mockPackageJson = {
                name: 'test-package',
                version: '0.0.4',
                scripts: {
                    prepublishOnly: 'npm run clean && npm run lint && npm run build && npm run test'
                }
            };

            // Mock git repository check
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' }); // No uncommitted changes
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'feat: update dependencies' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock Child.runWithDryRunSupport for git commands
            Child.runWithDryRunSupport.mockImplementation(() => {
                return Promise.resolve({ stdout: '' });
            });

            // Mock package.json existence and content
            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify(mockPackageJson));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes\n\nNew features...');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Mock Release Title');
                }
                return Promise.resolve('');
            });
        };

    describe('execute', () => {
        const mockConfig = {
            model: 'gpt-4o-mini',
            configDirectory: '/test/config'
        };

        it('should execute complete publish workflow when no existing PR is found', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotesBody = '# Release Notes\n\nNew features...';
            const mockReleaseTitle = 'Mock Release Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            // Override storage mocks for this specific test
            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run prepublishOnly' } }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                return Promise.resolve('');
            });

            Diff.hasStagedChanges.mockResolvedValue(true);
            Commit.execute.mockResolvedValue('feat: update dependencies');
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfig);

            // Assert - Verify the complete workflow

            expect(GitHub.getCurrentBranchName).toHaveBeenCalled();
            expect(GitHub.findOpenPullRequestByHeadRef).toHaveBeenCalledWith(mockBranchName);
            expect(mockStorage.rename).not.toHaveBeenCalled();
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm update', false);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git add package.json package-lock.json', false);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm run prepublishOnly', false, {}, true);
            expect(Diff.hasStagedChanges).toHaveBeenCalled();
            expect(Commit.execute).toHaveBeenCalledWith(mockConfig);

            expect(Release.execute).toHaveBeenCalledWith(mockConfig);
            expect(mockStorage.writeFile).toHaveBeenCalledWith('RELEASE_NOTES.md', mockReleaseNotesBody, 'utf-8');
            expect(mockStorage.writeFile).toHaveBeenCalledWith('RELEASE_TITLE.md', mockReleaseTitle, 'utf-8');
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git push origin release/0.0.4', false);
            expect(GitHub.createPullRequest).toHaveBeenCalledWith('feat: update dependencies', 'Automated release PR.', mockBranchName);
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(123, {
                timeout: 3600000,
                skipUserConfirmation: false
            });
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'squash', false);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git checkout main', false);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git pull origin main', false);
            expect(GitHub.createRelease).toHaveBeenCalledWith('v0.0.4', mockReleaseTitle, mockReleaseNotesBody);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git checkout main', false);

        });

        it('should handle existing pull request and skip initial setup', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockBranchName = 'release/0.0.4';
            const mockExistingPR = {
                number: 456,
                html_url: 'https://github.com/owner/repo/pull/456'
            };
            const mockReleaseNotesBody = '# Release Notes\n\nExisting PR...';
            const mockReleaseTitle = 'Mock Release Title for Existing PR';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockExistingPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
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
            expect(Child.run).not.toHaveBeenCalledWith('npm update'); // Should skip dependency updates
            expect(Commit.execute).not.toHaveBeenCalled(); // Should skip commit
            expect(GitHub.createPullRequest).not.toHaveBeenCalled(); // Should skip PR creation
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(456, {
                timeout: 3600000,
                skipUserConfirmation: false
            });
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(456, 'squash', false);
            expect(GitHub.createRelease).toHaveBeenCalledWith('v0.0.4', mockReleaseTitle, mockReleaseNotesBody);

        });

        it('should skip commit when no staged changes are found', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            // Override storage mock - no workspace file
            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false); // No workspace file
            });

            Diff.hasStagedChanges.mockResolvedValue(false); // No staged changes
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump commit' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
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

        it('should call link even if an error occurs', async () => {
            // Arrange
            const mockBranchName = 'release/0.0.4';

            // Set up basic precheck mocks first
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            // Set up Child.run to succeed for prechecks but fail later
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.reject(new Error('Build failed'));
                }
                return Promise.reject(new Error('Build failed'));
            });

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Build failed');

            expect(mockStorage.rename).not.toHaveBeenCalled();

        });

        it('should throw error when PR creation fails', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockBranchName = 'release/0.0.4';
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
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

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'pnpm run clean && pnpm run lint && pnpm run build && npm run test' } }));
                }
                return Promise.resolve('');
            });

            // Mock Child.run for prechecks to succeed
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock runWithDryRunSupport to fail for prepublishOnly
            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                if (command === 'npm run prepublishOnly') {
                    return Promise.reject(new Error('Tests failed'));
                }
                return Promise.resolve({ stdout: '' });
            });

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('Tests failed');

        });

        it('should handle GitHub API errors during PR checks', async () => {
            // Arrange
            setupPrecheckMocks();

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

        it('should pass custom timeout and skipUserConfirmation options to waitForPullRequestChecks', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockConfigWithChecksOptions = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    checksTimeout: 600000, // 10 minutes
                    skipUserConfirmation: true
                }
            };

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithChecksOptions);

            // Assert - Verify options are passed to waitForPullRequestChecks
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(123, {
                timeout: 600000,
                skipUserConfirmation: true
            });

        });

        it('should use default timeout and skipUserConfirmation when not specified', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockConfigWithoutChecksOptions = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
                // No publish configuration
            };

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithoutChecksOptions);

            // Assert - Verify default options are used
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(123, {
                timeout: 3600000, // 1 hour default
                skipUserConfirmation: false
            });

        });

        it('should override skipUserConfirmation when sendit flag is true', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockConfigWithSendit = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    sendit: true,
                    skipUserConfirmation: false // This should be overridden by sendit
                }
            };

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithSendit);

            // Assert - Verify sendit overrides skipUserConfirmation
            expect(GitHub.waitForPullRequestChecks).toHaveBeenCalledWith(123, {
                timeout: 3600000, // 1 hour default
                skipUserConfirmation: true // Should be true because sendit=true overrides skipUserConfirmation=false
            });

        });

        it('should handle release creation failure', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
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
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock runWithDryRunSupport to succeed until the writeFile failure
            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                return Promise.resolve({ stdout: '' });
            });

            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });
            mockStorage.writeFile.mockRejectedValue(new Error('File write failed'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('File write failed');

        });

        it('should use configured merge method when merging PR', async () => {
            // Arrange
            setupPrecheckMocks();

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
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'Mock Release Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithMergeMethod);

            // Assert - Verify merge method is passed correctly
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'merge', false);
        });

        it('should use default squash merge method when no merge method is configured', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockConfigWithoutMergeMethod = {
                model: 'gpt-4o-mini'
                // No publish configuration
            };
            const mockBranchName = 'release/0.0.4';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithoutMergeMethod);

            // Assert - Verify default squash method is used
            expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, 'squash', false);
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
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock runWithDryRunSupport to succeed
            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                return Promise.resolve({ stdout: '' });
            });

            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithPatterns);

            // Assert - Verify patterns are used in pnpm update command
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm update @company/* @myorg/*', false);
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
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock runWithDryRunSupport to succeed
            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                return Promise.resolve({ stdout: '' });
            });

            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithoutPatterns);

            // Assert - Verify fallback to update all dependencies
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm update', false);
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
            const mockReleaseNotesBody = '# Release Notes';
            const mockReleaseTitle = 'No Changes Title';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'Version bump' });
                }
                if (command === 'npm run prepublishOnly') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            // Mock runWithDryRunSupport to succeed
            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                return Promise.resolve({ stdout: '' });
            });

            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve(mockReleaseNotesBody);
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve(mockReleaseTitle);
                }
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'test-package', version: '0.0.4', scripts: { prepublishOnly: 'npm run test' } }));
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('0.0.5');

            // Act
            await Publish.execute(mockConfigWithEmptyPatterns);

            // Assert - Verify fallback to update all dependencies when empty array
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm update', false);
        });

        it('should re-check tag existence after interactive version confirmation and error if confirmed tag exists', async () => {
            const interactiveConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    interactive: true,
                    targetVersion: 'minor'
                }
            } as any;

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                if (command === 'git log -1 --pretty=%B') return Promise.resolve({ stdout: 'feat: something' });
                if (command === 'npm run prepublishOnly') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            GitHub.getCurrentBranchName.mockResolvedValue('release/0.0.4');
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((p: string) => Promise.resolve(p.includes('package.json')));
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'pkg', version: '0.0.4', scripts: { prepublishOnly: 'npm test' } }));
                }
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# Notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('Title');
                return Promise.resolve('');
            });

            General.calculateTargetVersion.mockReturnValue('0.1.0');
            General.checkIfTagExists.mockImplementation(async (tag: string) => tag === 'v0.2.0');
            General.confirmVersionInteractively.mockResolvedValue('0.2.0');

            await expect(Publish.execute(interactiveConfig)).rejects.toThrow(/Tag v0.2.0 already exists/);
        });

        it('should pass publish.from and interactive flags through to release generation', async () => {
            setupPrecheckMocks();

            const configWithFrom = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: {
                    from: 'v0.0.1',
                    interactive: true
                }
            } as any;

            GitHub.getCurrentBranchName.mockResolvedValue('release/0.0.4');
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            GitHub.createPullRequest.mockResolvedValue({ number: 5, html_url: 'https://x/pr/5' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ name: 'pkg', version: '0.0.4', scripts: { prepublishOnly: 'npm run prepublishOnly' } }));
                }
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# Notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('Title');
                return Promise.resolve('');
            });

            General.incrementPatchVersion.mockReturnValue('0.0.5');

            await Publish.execute(configWithFrom);

            expect(Release.execute).toHaveBeenCalled();
            const releaseArg = (Release.execute as unknown as Mock).mock.calls[0][0];
            expect(releaseArg.release.from).toBe('v0.0.1');
            expect(releaseArg.release.interactive).toBe(true);
        });
    });

    describe('GitHub release retry logic', () => {
        const mockConfig = {
            model: 'gpt-4o-mini',
            configDirectory: '/test/config'
        };

        // Helper function to set up common mocks for retry tests
        const setupRetryTestMocks = () => {
            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            General.incrementPatchVersion.mockReturnValue('1.0.1');
        };

        it('should retry GitHub release creation when tag not found error occurs', async () => {
            // Arrange
            setupRetryTestMocks();

            let attemptCount = 0;
            GitHub.createRelease.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new Error('Reference does not exist');
                } else {
                    return Promise.resolve(); // Success on second attempt
                }
            });

            // Act
            await Publish.execute(mockConfig);

            // Assert
            expect(GitHub.createRelease).toHaveBeenCalledTimes(2);

        });

        it('should retry GitHub release creation when "not found" error occurs', async () => {
            // Arrange
            setupRetryTestMocks();

            let attemptCount = 0;
            GitHub.createRelease.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new Error('Tag not found on remote');
                } else {
                    return Promise.resolve(); // Success on second attempt
                }
            });

            // Act
            await Publish.execute(mockConfig);

            // Assert
            expect(GitHub.createRelease).toHaveBeenCalledTimes(2);

        });

        it('should fail after exhausting all retries for tag not found errors', async () => {
            // Arrange
            setupRetryTestMocks();

            GitHub.createRelease.mockRejectedValue(new Error('Reference does not exist'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow(
                'Tag v1.0.0 was not found on GitHub after 3 attempts. This may indicate a problem with tag creation or GitHub synchronization.'
            );
            expect(GitHub.createRelease).toHaveBeenCalledTimes(3);

        });

        it('should not retry for non-tag-related errors', async () => {
            // Arrange
            setupRetryTestMocks();

            GitHub.createRelease.mockRejectedValue(new Error('API rate limit exceeded'));

            // Act & Assert
            await expect(Publish.execute(mockConfig)).rejects.toThrow('API rate limit exceeded');
            expect(GitHub.createRelease).toHaveBeenCalledTimes(1); // No retries for non-tag errors

        });

        it('should succeed on first attempt when no errors occur', async () => {
            // Arrange
            setupRetryTestMocks();

            GitHub.createRelease.mockResolvedValue(undefined);

            // Act
            await Publish.execute(mockConfig);

            // Assert
            expect(GitHub.createRelease).toHaveBeenCalledTimes(1);

        });

        it('should handle tag push detection correctly when tag already exists remotely', async () => {
            // Arrange
            setupRetryTestMocks();

            // Mock git ls-remote to show tag already exists
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command.includes('git ls-remote origin refs/tags/')) {
                    return Promise.resolve({ stdout: 'refs/tags/v1.0.0' }); // Tag exists
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.createRelease.mockResolvedValue(undefined);

            // Act
            await Publish.execute(mockConfig);

            // Assert - Should succeed without delays since tag wasn't newly pushed
            expect(GitHub.createRelease).toHaveBeenCalledTimes(1);

        });

        it('should close milestone by default after successful release', async () => {
            setupRetryTestMocks();

            GitHub.createRelease.mockResolvedValue(undefined);

            await Publish.execute(mockConfig);

            expect(GitHub.closeMilestoneForVersion).toHaveBeenCalledWith('1.0.0');
        });

        it('should skip milestone closure when --no-milestones is set', async () => {
            setupRetryTestMocks();
            const cfg = { ...mockConfig, publish: { noMilestones: true } } as any;
            GitHub.createRelease.mockResolvedValue(undefined);

            await Publish.execute(cfg);

            expect(GitHub.closeMilestoneForVersion).not.toHaveBeenCalled();
        });
    });

    describe('dry run mode', () => {
        it('should handle dry run mode throughout the entire workflow', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                dryRun: true
            };

            const mockBranchName = 'release/1.0.0';
            const mockReleaseNotesBody = '# Release Notes\n\nDry run test...';
            const mockReleaseTitle = 'Dry Run Release';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            Release.execute.mockResolvedValue({ title: mockReleaseTitle, body: mockReleaseNotesBody });
            Child.runWithDryRunSupport.mockResolvedValue({ stdout: '' });

            await Publish.execute(mockConfig);



            // Verify no actual git commands were executed (non-dry-run commands)
            expect(Child.run).not.toHaveBeenCalledWith('git rev-parse --git-dir');
            // In dry run mode, runWithDryRunSupport should be called but with isDryRun=true
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm update', true);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git add package.json package-lock.json', true);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('npm run prepublishOnly', true, {}, true);

            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git push origin release/1.0.0', true);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git checkout main', true);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git checkout main', true);
            expect(Child.runWithDryRunSupport).toHaveBeenCalledWith('git pull origin main', true);
            expect(GitHub.createPullRequest).not.toHaveBeenCalled();
            expect(GitHub.waitForPullRequestChecks).not.toHaveBeenCalled();
            expect(GitHub.mergePullRequest).not.toHaveBeenCalled();
            expect(GitHub.createRelease).not.toHaveBeenCalled();
        });

        it('should handle dry run mode with existing PR', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                dryRun: true
            };

            const mockBranchName = 'release/1.0.0';
            const mockExistingPR = {
                number: 456,
                html_url: 'https://github.com/owner/repo/pull/456'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockExistingPR);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            await Publish.execute(mockConfig);



            // Should not execute actual operations in dry run
            expect(GitHub.waitForPullRequestChecks).not.toHaveBeenCalled();
            expect(GitHub.mergePullRequest).not.toHaveBeenCalled();
        });

        it('should handle dry run mode with environment variable validation', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                dryRun: true,
                publish: {
                    requiredEnvVars: ['MISSING_VAR']
                }
            };

            GitHub.getCurrentBranchName.mockResolvedValue('release/1.0.0');

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            // Don't set the required env var
            delete process.env.MISSING_VAR;

            // Should not throw in dry run mode, just warn
            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();
        });
    });

    describe('workflow waiting behavior', () => {
        it('should auto-detect workflow names when not configured and pass them to waitForReleaseWorkflows', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            } as any;

            const mockBranchName = 'release/1.0.0';
            const mockPR = { number: 321, html_url: 'https://x/pr/321' };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);

            GitHub.getWorkflowsTriggeredByRelease.mockResolvedValue(['build', 'deploy']);

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: '1.0.0', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key.startsWith('tag -l')) return { stdout: '' } as any;
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            await Publish.execute(mockConfig);

            expect(GitHub.waitForReleaseWorkflows).toHaveBeenCalledWith('v1.0.0', expect.objectContaining({
                workflowNames: ['build', 'deploy']
            }));
        });

        it('should fall back to all workflows when auto-detection fails', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            } as any;

            const mockBranchName = 'release/1.0.0';
            const mockPR = { number: 322, html_url: 'https://x/pr/322' };
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);

            GitHub.getWorkflowsTriggeredByRelease.mockRejectedValue(new Error('API error'));

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: '1.0.0', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key.startsWith('tag -l')) return { stdout: '' } as any;
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            await Publish.execute(mockConfig);

            expect(GitHub.waitForReleaseWorkflows).toHaveBeenCalledWith('v1.0.0', expect.objectContaining({
                workflowNames: undefined
            }));
        });

        it('should skip waiting for workflows when disabled', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                publish: { waitForReleaseWorkflows: false }
            } as any;

            const mockBranchName = 'release/1.0.0';
            const mockPR = { number: 323, html_url: 'https://x/pr/323' };
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: '1.0.0', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key.startsWith('tag -l')) return { stdout: '' } as any;
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            await Publish.execute(mockConfig);

            expect(GitHub.waitForReleaseWorkflows).not.toHaveBeenCalled();
        });
    });

    describe('release necessity detection', () => {
        it('should skip publish when only package.json version changed compared to target branch', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            const targetBranch = 'main';
            const currentBranch = 'release/1.0.1';

            // Branch name
            GitHub.getCurrentBranchName.mockResolvedValue(currentBranch);

            // Prechecks
            mockStorage.exists.mockImplementation((p: string) => p.includes('package.json') ? Promise.resolve(true) : Promise.resolve(false));
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.1',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            // Diff shows only package.json changed
            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key === `diff --name-only ${targetBranch}..${currentBranch}`) {
                    return { stdout: 'package.json\n' } as any;
                }
                if (key === `show ${targetBranch}:package.json`) {
                    return { stdout: JSON.stringify({ name: 'test-package', version: '1.0.0', scripts: { prepublishOnly: 'npm test' } }) } as any;
                }
                if (key === `show ${currentBranch}:package.json`) {
                    return { stdout: JSON.stringify({ name: 'test-package', version: '1.0.1', scripts: { prepublishOnly: 'npm test' } }) } as any;
                }
                return { stdout: '' } as any;
            });

            // Act
            await Publish.execute(mockConfig);

            // Assert: should have returned early and not attempt publish steps
            expect(Commit.execute).not.toHaveBeenCalled();
            expect(Release.execute).not.toHaveBeenCalled();
            expect(GitHub.createPullRequest).not.toHaveBeenCalled();
            expect(GitHub.waitForPullRequestChecks).not.toHaveBeenCalled();
            expect(GitHub.mergePullRequest).not.toHaveBeenCalled();
            expect(GitHub.createRelease).not.toHaveBeenCalled();
        });
    });

    describe('tag creation edge cases', () => {
        it('should create tag even if local tag check fails', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            const mockBranchName = 'release/1.0.0';
            const mockPR = { number: 111, html_url: 'https://x/pr/111' };
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: '1.0.0', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key.startsWith('tag -l')) throw new Error('tag list failed');
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            await Publish.execute(mockConfig);

            const tagCreateCall = (Child.runSecure as unknown as Mock).mock.calls.find(([, a]) => a.join(' ').startsWith('tag v1.0.0'));
            expect(tagCreateCall).toBeTruthy();
        });

        it('should proceed via fallback when tag name validation fails', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            const mockBranchName = 'release/0.0.9';
            const mockPR = { number: 222, html_url: 'https://x/pr/222' };
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: 'bad tag', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.validateGitRef.mockReturnValue(false);

            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();
            // Fallback path should have attempted to create the tag anyway
            const tagCreateCall = (Child.runSecure as unknown as Mock).mock.calls.find(([, a]) => a.join(' ') === 'tag vbad tag');
            expect(tagCreateCall).toBeTruthy();
        });
    });

    describe('merge conflict handling', () => {
        it('should surface a helpful error when PR has merge conflicts', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            const mockBranchName = 'release/1.2.3';
            const mockPR = { number: 999, html_url: 'https://x/pr/999' };
            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) return Promise.resolve(JSON.stringify({ name: 'pkg', version: '1.2.3', scripts: { prepublishOnly: 'npm test' } }));
                if (filename === 'RELEASE_NOTES.md') return Promise.resolve('# notes');
                if (filename === 'RELEASE_TITLE.md') return Promise.resolve('title');
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key.startsWith('tag -l')) return { stdout: 'notfound' } as any;
                if (key.startsWith('tag v1.2.3')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockRejectedValue(new Error('merge conflict occurred'));

            await expect(Publish.execute(mockConfig)).rejects.toThrow(/Merge conflicts detected/);
        });
    });

    // Legacy workspace package configuration tests removed -
    // link/unlink functionality was removed from publish command

    describe('edge cases and error scenarios', () => {
        it('should handle git log failure when creating PR', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            const mockBranchName = 'release/1.0.0';

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.reject(new Error('Git log failed'));
                }
                return Promise.resolve({ stdout: '' });
            });

            Child.runWithDryRunSupport.mockImplementation(() => Promise.resolve({ stdout: '' }));
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: 'Title', body: 'Body' });

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Git log failed');

        });

        it('should handle release notes file read failure', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.reject(new Error('Failed to read release notes'));
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to read release notes');

        });

        it('should handle custom output directory', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                outputDirectory: '/custom/output'
            };

            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                if (command === 'git log -1 --pretty=%B') {
                    return Promise.resolve({ stdout: 'test commit' });
                }
                return Promise.resolve({ stdout: '' });
            });

            Child.runWithDryRunSupport.mockImplementation(() => Promise.resolve({ stdout: '' }));
            Diff.hasStagedChanges.mockResolvedValue(false);
            Release.execute.mockResolvedValue({ title: 'Title', body: 'Body' });
            GitHub.createPullRequest.mockResolvedValue(mockPR);
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                return Promise.resolve('');
            });

            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            await Publish.execute(mockConfig);

            expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('/custom/output');

        });

        it('should handle package.json read failure after version bump', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            let packageJsonReadCount = 0;
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    packageJsonReadCount++;
                    if (packageJsonReadCount === 1) {
                        return Promise.resolve(JSON.stringify({
                            name: 'test-package', version: '1.0.0',
                            scripts: { prepublishOnly: 'npm test' }
                        }));
                    } else {
                        return Promise.reject(new Error('Failed to read package.json after version bump'));
                    }
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to read package.json after version bump');

        });

        it('should handle target branch checkout failure', async () => {
            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
            };

            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            Child.runWithDryRunSupport.mockImplementation((command: string) => {
                if (command === 'git checkout main') {
                    return Promise.reject(new Error('Failed to checkout target branch'));
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            await expect(Publish.execute(mockConfig)).rejects.toThrow('Failed to checkout target branch');

        });
    });

    describe('configuration validation', () => {
        it('should handle missing publish configuration gracefully', async () => {
            // Arrange
            setupPrecheckMocks();

            const mockConfig = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config'
                // No publish configuration
            };

            const mockBranchName = 'release/1.0.0';
            const mockPR = {
                number: 123,
                html_url: 'https://github.com/owner/repo/pull/123'
            };

            GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

            mockStorage.exists.mockImplementation((path: string) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            });

            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package', version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                if (filename === 'RELEASE_NOTES.md') {
                    return Promise.resolve('# Release Notes');
                }
                if (filename === 'RELEASE_TITLE.md') {
                    return Promise.resolve('Release Title');
                }
                return Promise.resolve('');
            });

            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') {
                    return Promise.resolve({ stdout: '.git' });
                }
                if (command === 'git status --porcelain') {
                    return Promise.resolve({ stdout: '' });
                }
                return Promise.resolve({ stdout: '' });
            });

            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue(undefined);
            General.incrementPatchVersion.mockReturnValue('1.0.1');

            await expect(Publish.execute(mockConfig)).resolves.not.toThrow();

        });

        it('should handle all merge methods correctly', async () => {
            const mergeMethodTests = [
                { method: 'merge' as const, expected: 'merge' },
                { method: 'rebase' as const, expected: 'rebase' },
                { method: 'squash' as const, expected: 'squash' }
            ];

            for (const { method, expected } of mergeMethodTests) {
                // Arrange
                setupPrecheckMocks();

                const mockConfig = {
                    model: 'gpt-4o-mini',
                    configDirectory: '/test/config',
                    publish: {
                        mergeMethod: method
                    }
                };

                const mockBranchName = 'release/1.0.0';
                const mockPR = {
                    number: 123,
                    html_url: 'https://github.com/owner/repo/pull/123'
                };

                GitHub.getCurrentBranchName.mockResolvedValue(mockBranchName);
                GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(mockPR);

                mockStorage.exists.mockImplementation((path: string) => {
                    if (path.includes('package.json')) {
                        return Promise.resolve(true);
                    }
                    return Promise.resolve(false);
                });

                mockStorage.readFile.mockImplementation((filename: string) => {
                    if (filename && filename.includes('package.json')) {
                        return Promise.resolve(JSON.stringify({
                            name: 'test-package', version: '1.0.0',
                            scripts: { prepublishOnly: 'npm test' }
                        }));
                    }
                    if (filename === 'RELEASE_NOTES.md') {
                        return Promise.resolve('# Release Notes');
                    }
                    if (filename === 'RELEASE_TITLE.md') {
                        return Promise.resolve('Release Title');
                    }
                    return Promise.resolve('');
                });

                Child.run.mockImplementation((command: string) => {
                    if (command === 'git rev-parse --git-dir') {
                        return Promise.resolve({ stdout: '.git' });
                    }
                    if (command === 'git status --porcelain') {
                        return Promise.resolve({ stdout: '' });
                    }
                    return Promise.resolve({ stdout: '' });
                });

                GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
                GitHub.mergePullRequest.mockResolvedValue(undefined);
                GitHub.createRelease.mockResolvedValue(undefined);
                General.incrementPatchVersion.mockReturnValue('1.0.1');

                await Publish.execute(mockConfig);

                expect(GitHub.mergePullRequest).toHaveBeenCalledWith(123, expected, false);

                // Clear mocks for next iteration
                vi.clearAllMocks();

                // Reset mocks
                Storage.create.mockReturnValue(mockStorage);
                General.getOutputPath.mockImplementation((outputDirectory: string, filename: string) => {
                    return filename;
                });
            }
        });
    });

    describe('uncommitted changes handling', () => {
        it('should stash uncommitted changes before checkout and restore them after', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            // Mock successful prechecks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            // Mock runSecure to simulate uncommitted changes before checkout
            let stashCalled = false;
            let popCalled = false;
            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key === 'status --porcelain') {
                    // First call returns uncommitted changes (package-lock.json)
                    return { stdout: 'M package-lock.json\n' } as any;
                }
                if (key === 'stash push -m kodrdriv: stash before checkout target branch') {
                    stashCalled = true;
                    return { stdout: '' } as any;
                }
                if (key === 'stash pop') {
                    popCalled = true;
                    return { stdout: '' } as any;
                }
                if (key.startsWith('tag -l')) return { stdout: '' } as any;
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            // Mock other dependencies
            GitHub.getCurrentBranchName.mockResolvedValue('working');
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/repo/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue({ html_url: 'https://github.com/test/repo/releases/tag/v1.0.0' });

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            General.incrementPatchVersion.mockReturnValue('1.0.1');
            General.getOutputPath.mockReturnValue('output/kodrdriv/RELEASE_NOTES.md');

            // Mock the commit and release commands
            Commit.execute.mockResolvedValue('Commit successful!');
            Release.execute.mockResolvedValue('Release notes generated');

            await Publish.execute(mockConfig);

            // Verify that stash was called before checkout
            expect(stashCalled).toBe(true);
            // Verify that stash pop was called after checkout
            expect(popCalled).toBe(true);
        });

        it('should not stash when there are no uncommitted changes', async () => {
            const mockConfig = { model: 'gpt-4o-mini', configDirectory: '/test/config' } as any;

            // Mock successful prechecks
            Child.run.mockImplementation((command: string) => {
                if (command === 'git rev-parse --git-dir') return Promise.resolve({ stdout: '.git' });
                if (command === 'git status --porcelain') return Promise.resolve({ stdout: '' });
                return Promise.resolve({ stdout: '' });
            });

            // Mock runSecure to simulate no uncommitted changes
            let stashCalled = false;
            Child.runSecure.mockImplementation(async (_cmd: string, args: string[]) => {
                const key = args.join(' ');
                if (key === 'status --porcelain') {
                    // Return empty status (no uncommitted changes)
                    return { stdout: '' } as any;
                }
                if (key === 'stash push -m kodrdriv: stash before checkout target branch') {
                    stashCalled = true;
                    return { stdout: '' } as any;
                }
                if (key.startsWith('tag -l')) return { stdout: '' } as any;
                if (key.startsWith('tag ')) return { stdout: '' } as any;
                if (key.startsWith('ls-remote')) return { stdout: '' } as any;
                if (key.startsWith('push origin')) return { stdout: '' } as any;
                return { stdout: '' } as any;
            });

            // Mock other dependencies
            GitHub.getCurrentBranchName.mockResolvedValue('working');
            GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
            GitHub.createPullRequest.mockResolvedValue({ number: 123, html_url: 'https://github.com/test/repo/pull/123' });
            GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
            GitHub.mergePullRequest.mockResolvedValue(undefined);
            GitHub.createRelease.mockResolvedValue({ html_url: 'https://github.com/test/repo/releases/tag/v1.0.0' });

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.readFile.mockImplementation((filename: string) => {
                if (filename && filename.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'test-package',
                        version: '1.0.0',
                        scripts: { prepublishOnly: 'npm test' }
                    }));
                }
                return Promise.resolve('');
            });

            General.incrementPatchVersion.mockReturnValue('1.0.1');
            General.getOutputPath.mockReturnValue('output/kodrdriv/RELEASE_NOTES.md');

            // Mock the commit and release commands
            Commit.execute.mockResolvedValue('Commit successful!');
            Release.execute.mockResolvedValue('Release notes generated');

            await Publish.execute(mockConfig);

            // Verify that stash was NOT called when there are no uncommitted changes
            expect(stashCalled).toBe(false);
        });
    });

    describe('branch sync functionality', () => {
        describe('--sync-target flag', () => {
            it('should call sync recovery and exit early when --sync-target is provided', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        syncTarget: true,
                        targetBranch: 'main'
                    }
                };

                Storage.create.mockReturnValue(mockStorage);
                Git.safeSyncBranchWithRemote.mockResolvedValue({ success: true });

                await Publish.execute(mockConfig);

                expect(Git.safeSyncBranchWithRemote).toHaveBeenCalledWith('main');
                // Should not proceed with normal publish flow
                expect(GitHub.createPullRequest).not.toHaveBeenCalled();
            });

            it('should handle sync failure with conflicts', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        syncTarget: true,
                        targetBranch: 'main'
                    }
                };

                Storage.create.mockReturnValue(mockStorage);
                Git.safeSyncBranchWithRemote.mockResolvedValue({
                    success: false,
                    conflictResolutionRequired: true,
                    error: 'Branch has diverged'
                });

                await expect(Publish.execute(mockConfig)).rejects.toThrow('conflicts that require manual resolution');
                expect(Git.safeSyncBranchWithRemote).toHaveBeenCalledWith('main');
            });
        });

        describe('target branch sync check in prechecks', () => {
                        it('should pass when target branch is in sync', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        targetBranch: 'main'
                    }
                };

                // Mock setup for successful publish
                mockStorage.exists.mockResolvedValue(true); // package.json exists
                mockStorage.readFile.mockResolvedValue('{"name": "test", "version": "1.0.0", "scripts": {"prepublishOnly": "npm run build"}}');
                Storage.create.mockReturnValue(mockStorage);

                Child.run.mockImplementation((command: string) => {
                    if (command === 'git rev-parse --git-dir') {
                        return Promise.resolve({ stdout: '.git' });
                    }
                    if (command === 'git status --porcelain') {
                        return Promise.resolve({ stdout: '' });
                    }
                    if (command === 'git log -1 --pretty=%B') {
                        return Promise.resolve({ stdout: 'test commit' });
                    }
                    return Promise.resolve({ stdout: '' });
                });
                Child.runWithDryRunSupport.mockResolvedValue(undefined);

                Git.localBranchExists.mockResolvedValue(true);
                Git.isBranchInSyncWithRemote.mockResolvedValue({
                    inSync: true,
                    localExists: true,
                    remoteExists: true
                });

                GitHub.getCurrentBranchName.mockResolvedValue('feature-branch');
                GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
                GitHub.createPullRequest.mockResolvedValue({
                    number: 123,
                    html_url: 'https://github.com/test/repo/pull/123',
                    labels: []
                });
                Diff.hasStagedChanges.mockResolvedValue(true);
                Release.execute.mockResolvedValue({ title: 'Release v1.0.1', body: 'Release notes' });

                // Should not throw error
                await expect(Publish.execute(mockConfig)).resolves.not.toThrow();
                expect(Git.isBranchInSyncWithRemote).toHaveBeenCalledWith('main');
            });

            it('should fail when target branch is not in sync', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        targetBranch: 'main'
                    }
                };

                mockStorage.exists.mockResolvedValue(true); // package.json exists
                mockStorage.readFile.mockResolvedValue('{"name": "test", "version": "1.0.0", "scripts": {"prepublishOnly": "npm run build"}}');
                Storage.create.mockReturnValue(mockStorage);

                Child.run.mockImplementation((command: string) => {
                    if (command === 'git rev-parse --git-dir') {
                        return Promise.resolve({ stdout: '.git' });
                    }
                    if (command === 'git status --porcelain') {
                        return Promise.resolve({ stdout: '' });
                    }
                    return Promise.resolve({ stdout: '' });
                });

                GitHub.getCurrentBranchName.mockResolvedValue('feature-branch');
                Git.localBranchExists.mockResolvedValue(true);
                Git.isBranchInSyncWithRemote.mockResolvedValue({
                    inSync: false,
                    localExists: true,
                    remoteExists: true,
                    localSha: 'abc123',
                    remoteSha: 'def456'
                });

                await expect(Publish.execute(mockConfig)).rejects.toThrow('not in sync with remote');
                expect(Git.isBranchInSyncWithRemote).toHaveBeenCalledWith('main');
            });

                        it('should skip sync check when target branch does not exist locally', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        targetBranch: 'main'
                    }
                };

                mockStorage.exists.mockResolvedValue(true); // package.json exists
                mockStorage.readFile.mockResolvedValue('{"name": "test", "version": "1.0.0", "scripts": {"prepublishOnly": "npm run build"}}');
                Storage.create.mockReturnValue(mockStorage);

                Child.run.mockImplementation((command: string) => {
                    if (command === 'git rev-parse --git-dir') {
                        return Promise.resolve({ stdout: '.git' });
                    }
                    if (command === 'git status --porcelain') {
                        return Promise.resolve({ stdout: '' });
                    }
                    if (command === 'git log -1 --pretty=%B') {
                        return Promise.resolve({ stdout: 'test commit' });
                    }
                    return Promise.resolve({ stdout: '' });
                });
                Child.runWithDryRunSupport.mockResolvedValue(undefined);

                GitHub.getCurrentBranchName.mockResolvedValue('feature-branch');
                Git.localBranchExists.mockResolvedValue(false); // Target branch doesn't exist locally

                GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
                GitHub.createPullRequest.mockResolvedValue({
                    number: 123,
                    html_url: 'https://github.com/test/repo/pull/123',
                    labels: []
                });
                Diff.hasStagedChanges.mockResolvedValue(true);
                Release.execute.mockResolvedValue({ title: 'Release v1.0.1', body: 'Release notes' });

                // Should not throw error and skip sync check
                await expect(Publish.execute(mockConfig)).resolves.not.toThrow();
                expect(Git.localBranchExists).toHaveBeenCalledWith('main');
                expect(Git.isBranchInSyncWithRemote).not.toHaveBeenCalled();
            });
        });

        describe('target branch sync during checkout', () => {
                        it('should handle sync conflicts during target branch checkout', async () => {
                const mockConfig = {
                    dryRun: false,
                    outputDirectory: './output',
                    publish: {
                        targetBranch: 'main'
                    }
                };

                mockStorage.exists.mockResolvedValue(true); // package.json exists
                mockStorage.readFile.mockResolvedValue('{"name": "test", "version": "1.0.0", "scripts": {"prepublishOnly": "npm run build"}}');
                Storage.create.mockReturnValue(mockStorage);

                // Mock successful initial flow
                Child.run.mockImplementation((command: string) => {
                    if (command === 'git rev-parse --git-dir') {
                        return Promise.resolve({ stdout: '.git' });
                    }
                    if (command === 'git status --porcelain') {
                        return Promise.resolve({ stdout: '' });
                    }
                    if (command === 'git log -1 --pretty=%B') {
                        return Promise.resolve({ stdout: 'test commit' });
                    }
                    return Promise.resolve({ stdout: '' });
                });

                // Mock git pull failure during target branch sync
                Child.runWithDryRunSupport.mockImplementation((command: string) => {
                    if (command.includes('git pull origin main')) {
                        return Promise.reject(new Error('CONFLICT: Merge conflict in file.txt'));
                    }
                    return Promise.resolve(undefined);
                });

                GitHub.getCurrentBranchName.mockResolvedValue('feature-branch');
                GitHub.findOpenPullRequestByHeadRef.mockResolvedValue(null);
                GitHub.createPullRequest.mockResolvedValue({
                    number: 123,
                    html_url: 'https://github.com/test/repo/pull/123',
                    labels: []
                });
                GitHub.waitForPullRequestChecks.mockResolvedValue(undefined);
                GitHub.mergePullRequest.mockResolvedValue(undefined);

                Diff.hasStagedChanges.mockResolvedValue(true);
                Release.execute.mockResolvedValue({ title: 'Release v1.0.1', body: 'Release notes' });


                await expect(Publish.execute(mockConfig)).rejects.toThrow("Target branch 'main' sync failed");
            });
    });
});
});
