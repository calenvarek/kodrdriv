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

export const execute = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });
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

            logger.info('Running pre-flight checks...');
            await run('pnpm run clean && pnpm run lint && pnpm run build && pnpm run test');

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