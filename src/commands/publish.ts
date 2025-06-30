import path from 'path';
import * as Commit from './commit';
import * as Diff from '../content/diff';
import * as Release from './release';
import { getLogger } from '../logging';
import { Config, PullRequest } from '../types';
import { run } from '../util/child';
import * as GitHub from '../util/github';
import { create as createStorage } from '../util/storage';
import { incrementPatchVersion } from '../util/general';

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';
const PNPM_WORKSPACE_BACKUP_FILE = 'pnpm-workspace.yaml.bak';

const scanNpmrcForEnvVars = async (storage: any): Promise<string[]> => {
    const npmrcPath = path.join(process.cwd(), '.npmrc');
    const envVars: string[] = [];

    if (await storage.exists(npmrcPath)) {
        try {
            const npmrcContent = await storage.readFile(npmrcPath, 'utf-8');
            // Match environment variable patterns like ${VAR_NAME} or $VAR_NAME
            const envVarMatches = npmrcContent.match(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g);

            if (envVarMatches) {
                for (const match of envVarMatches) {
                    // Extract variable name from ${VAR_NAME} or $VAR_NAME format
                    const varName = match.replace(/\$\{|\}|\$/g, '');
                    if (varName && !envVars.includes(varName)) {
                        envVars.push(varName);
                    }
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            // If we can't read .npmrc, that's okay - just continue
        }
    }

    return envVars;
};

const validateEnvironmentVariables = (requiredEnvVars: string[]): void => {
    const logger = getLogger();
    const missingEnvVars: string[] = [];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingEnvVars.push(envVar);
        }
    }

    if (missingEnvVars.length > 0) {
        logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}. Please set these environment variables before running publish.`);
    }
};

const runPrechecks = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    logger.info('Running prechecks...');

    // Check if we're in a git repository
    try {
        await run('git rev-parse --git-dir');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        throw new Error('Not in a git repository. Please run this command from within a git repository.');
    }

    // Check for uncommitted changes
    logger.info('Checking for uncommitted changes...');
    try {
        const { stdout } = await run('git status --porcelain');
        if (stdout.trim()) {
            throw new Error('Working directory has uncommitted changes. Please commit or stash your changes before running publish.');
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        throw new Error('Failed to check git status. Please ensure you are in a valid git repository.');
    }

    // Check if we're on a release branch
    logger.info('Checking current branch...');
    const currentBranch = await GitHub.getCurrentBranchName();
    if (!currentBranch.startsWith('release/')) {
        throw new Error(`Current branch '${currentBranch}' is not a release branch. Please switch to a release branch (e.g., release/1.0.0) before running publish.`);
    }

    // Check if prepublishOnly script exists in package.json
    logger.info('Checking for prepublishOnly script...');
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    if (!await storage.exists(packageJsonPath)) {
        throw new Error('package.json not found in current directory.');
    }

    let packageJson;
    try {
        const packageJsonContents = await storage.readFile(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(packageJsonContents);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        throw new Error('Failed to parse package.json. Please ensure it contains valid JSON.');
    }

    if (!packageJson.scripts?.prepublishOnly) {
        throw new Error('prepublishOnly script is required in package.json but was not found. Please add a prepublishOnly script that runs your pre-flight checks (e.g., clean, lint, build, test).');
    }

    // Check required environment variables
    logger.info('Checking required environment variables...');
    const coreRequiredEnvVars = runConfig.publish?.requiredEnvVars || [];
    const npmrcEnvVars = await scanNpmrcForEnvVars(storage);
    const allRequiredEnvVars = [...new Set([...coreRequiredEnvVars, ...npmrcEnvVars])];

    if (allRequiredEnvVars.length > 0) {
        logger.info(`Required environment variables: ${allRequiredEnvVars.join(', ')}`);
        validateEnvironmentVariables(allRequiredEnvVars);
    } else {
        logger.info('No required environment variables specified.');
    }

    logger.info('All prechecks passed.');
};

export const execute = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    // Run prechecks before starting any work
    await runPrechecks(runConfig);

    logger.info('Starting release process...');

    const workspaceFile = path.join(process.cwd(), PNPM_WORKSPACE_FILE);
    const workspaceBackupFile = path.join(process.cwd(), PNPM_WORKSPACE_BACKUP_FILE);

    const restoreWorkspaceFile = async () => {
        if (await storage.exists(workspaceBackupFile)) {
            logger.info('Restoring pnpm-workspace.yaml...');
            await storage.rename(workspaceBackupFile, workspaceFile);
        }
    };

    try {
        const branchName = await GitHub.getCurrentBranchName();
        let pr: PullRequest | null = await GitHub.findOpenPullRequestByHeadRef(branchName);

        if (pr) {
            logger.info(`Found existing pull request for branch ${branchName}: ${pr.html_url}`);
        } else {
            logger.info('No open pull request found, starting new release publishing process...');
            // 1. Prepare for release
            logger.info('Preparing for release: switching from workspace to remote dependencies.');

            if (await storage.exists(workspaceFile)) {
                logger.info('Renaming pnpm-workspace.yaml to prevent workspace-protocol resolution');
                await storage.rename(workspaceFile, workspaceBackupFile);
            } else {
                logger.info('pnpm-workspace.yaml not found, skipping rename.');
            }

            logger.info('Updating dependencies to latest versions from registry');
            const updatePatterns = runConfig.publish?.dependencyUpdatePatterns;
            if (updatePatterns && updatePatterns.length > 0) {
                logger.info(`Updating dependencies matching patterns: ${updatePatterns.join(', ')}`);
                const patternsArg = updatePatterns.join(' ');
                await run(`pnpm update --latest ${patternsArg}`);
            } else {
                logger.info('No dependency update patterns specified, updating all dependencies');
                await run('pnpm update --latest');
            }

            logger.info('Staging changes for release commit');
            await run('git add package.json pnpm-lock.yaml');

            logger.info('Running prepublishOnly script...');
            await run('pnpm run prepublishOnly');

            logger.info('Checking for staged changes...');
            if (await Diff.hasStagedChanges()) {
                logger.info('Staged changes found, creating commit...');
                await Commit.execute(runConfig);
            } else {
                logger.info('No changes to commit, skipping commit.');
            }

            logger.info('Bumping version...');
            await run('pnpm version patch');

            logger.info('Generating release notes...');
            const releaseNotes = await Release.execute(runConfig);
            await storage.writeFile('RELEASE_NOTES.md', releaseNotes, 'utf-8');
            logger.info('Release notes generated and saved to RELEASE_NOTES.md.');

            logger.info('Pushing to origin...');
            await run('git push --follow-tags');

            logger.info('Creating pull request...');
            const { stdout: commitTitle } = await run('git log -1 --pretty=%B');
            pr = await GitHub.createPullRequest(commitTitle, 'Automated release PR.', branchName);
            if (!pr) {
                throw new Error('Failed to create pull request.');
            }
            logger.info(`Pull request created: ${pr.html_url}`);
        }

        logger.info(`Waiting for PR #${pr.number} checks to complete...`);
        await GitHub.waitForPullRequestChecks(pr.number);

        const mergeMethod = runConfig.publish?.mergeMethod || 'squash';
        await GitHub.mergePullRequest(pr.number, mergeMethod);

        logger.info('Checking out main branch...');
        await run('git checkout main');
        await run('git pull origin main');

        logger.info('Creating GitHub release...');
        const packageJsonContents = await storage.readFile('package.json', 'utf-8');
        const { version } = JSON.parse(packageJsonContents);
        const tagName = `v${version}`;
        const releaseNotesContent = await storage.readFile('RELEASE_NOTES.md', 'utf-8');
        await GitHub.createRelease(tagName, releaseNotesContent);

        logger.info('Creating new release branch...');
        const nextVersion = incrementPatchVersion(version);
        const newBranchName = `release/${nextVersion}`;
        await run(`git checkout -b ${newBranchName}`);
        await run(`git push -u origin ${newBranchName}`);
        logger.info(`Branch ${newBranchName} created and pushed to origin.`);

        logger.info('Preparation complete.');
    } finally {
        await restoreWorkspaceFile();
    }
}; 