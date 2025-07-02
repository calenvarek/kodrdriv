#!/usr/bin/env node
import { Model, Request } from '@riotprompt/riotprompt';
import { ChatCompletionMessageParam } from 'openai/resources';
import { getLogger } from '../logging';
import { Config } from '../types';
import { createCompletion } from '../util/openai';
import * as Prompts from '../prompt/prompts';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as ReleaseNotes from '../content/releaseNotes';
import * as Issues from '../content/issues';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename } from '../util/general';
import { create as createStorage } from '../util/storage';

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Show configuration even in dry-run mode
    logger.debug('Review context configuration:');
    logger.debug('  Include commit history: %s', runConfig.review?.includeCommitHistory);
    logger.debug('  Include recent diffs: %s', runConfig.review?.includeRecentDiffs);
    logger.debug('  Include release notes: %s', runConfig.review?.includeReleaseNotes);
    logger.debug('  Include GitHub issues: %s', runConfig.review?.includeGithubIssues);
    logger.debug('  Commit history limit: %d', runConfig.review?.commitHistoryLimit);
    logger.debug('  Diff history limit: %d', runConfig.review?.diffHistoryLimit);
    logger.debug('  Release notes limit: %d', runConfig.review?.releaseNotesLimit);
    logger.debug('  GitHub issues limit: %d', runConfig.review?.githubIssuesLimit);
    logger.debug('  Sendit mode (auto-create issues): %s', runConfig.review?.sendit);

    if (isDryRun) {
        logger.info('DRY RUN: Would analyze provided note for review');
        logger.info('DRY RUN: Would gather additional context based on configuration above');
        logger.info('DRY RUN: Would analyze note and identify issues');

        if (runConfig.review?.sendit) {
            logger.info('DRY RUN: Would automatically create GitHub issues (sendit mode enabled)');
        } else {
            logger.info('DRY RUN: Would prompt for confirmation before creating GitHub issues');
        }

        // Show what exclusion patterns would be used in dry-run mode
        if (runConfig.review?.includeRecentDiffs) {
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const reviewExcluded = Diff.getReviewExcludedPatterns(basePatterns);
            logger.info('DRY RUN: Would use %d exclusion patterns for diff context', reviewExcluded.length);
            logger.debug('DRY RUN: Sample exclusions: %s', reviewExcluded.slice(0, 15).join(', ') +
                (reviewExcluded.length > 15 ? '...' : ''));
        }

        return 'DRY RUN: Review command would analyze note, gather context, and create GitHub issues';
    }

    // Get the review note from configuration
    const reviewNote = runConfig.review?.note;
    if (!reviewNote || !reviewNote.trim()) {
        throw new Error('No review note provided. Use --note "your review text" to provide note for analysis.');
    }

    logger.info('📝 Starting review analysis...');
    logger.debug('Review note: %s', reviewNote);

    // Gather additional context based on configuration
    let logContext = '';
    let diffContext = '';
    let releaseNotesContext = '';
    let issuesContext = '';

    // Fetch commit history if enabled
    if (runConfig.review?.includeCommitHistory) {
        try {
            logger.debug('Fetching recent commit history...');
            const log = await Log.create({
                limit: runConfig.review.commitHistoryLimit
            });
            const logContent = await log.get();
            if (logContent.trim()) {
                logContext += `\n\n[Recent Commit History]\n${logContent}`;
                logger.debug('Added commit history to context (%d characters)', logContent.length);
            }
        } catch (error: any) {
            logger.warn('Failed to fetch commit history: %s', error.message);
        }
    }

    // Fetch recent diffs if enabled
    if (runConfig.review?.includeRecentDiffs) {
        try {
            logger.debug('Fetching recent commit diffs...');
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const recentDiffs = await Diff.getRecentDiffsForReview({
                limit: runConfig.review.diffHistoryLimit,
                baseExcludedPatterns: basePatterns
            });
            diffContext += recentDiffs;
        } catch (error: any) {
            logger.warn('Failed to fetch recent diffs: %s', error.message);
        }
    }

    // Fetch release notes if enabled
    if (runConfig.review?.includeReleaseNotes) {
        try {
            logger.debug('Fetching recent release notes from GitHub...');
            const releaseNotesContent = await ReleaseNotes.get({
                limit: runConfig.review.releaseNotesLimit || 3
            });
            if (releaseNotesContent.trim()) {
                releaseNotesContext += `\n\n[Recent Release Notes]\n${releaseNotesContent}`;
                logger.debug('Added release notes to context (%d characters)', releaseNotesContent.length);
            }
        } catch (error: any) {
            logger.warn('Failed to fetch release notes: %s', error.message);
        }
    }

    // Fetch GitHub issues if enabled
    if (runConfig.review?.includeGithubIssues) {
        try {
            logger.debug('Fetching open GitHub issues...');
            issuesContext = await Issues.get({
                limit: runConfig.review.githubIssuesLimit || 20
            });
            logger.debug('Added GitHub issues to context (%d characters)', issuesContext.length);
        } catch (error: any) {
            logger.warn('Failed to fetch GitHub issues: %s', error.message);
        }
    }

    // Analyze review note for issues using OpenAI
    logger.info('🤖 Analyzing review note for project issues...');
    const prompts = Prompts.create(runConfig.model as Model, runConfig);


    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const analysisPrompt = await prompts.createReviewPrompt({ notes: reviewNote }, { context: runConfig.review?.context, logContext, diffContext, releaseNotesContext, issuesContext });
    const request: Request = prompts.format(analysisPrompt);

    const analysisResult = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        responseFormat: { type: 'json_object' },
        debug: runConfig.debug,
        debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('review-analysis')),
        debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('review-analysis')),
    }) as Issues.ReviewResult;

    logger.info('✅ Analysis completed');

    // Handle GitHub issue creation using the issues module
    const senditMode = runConfig.review?.sendit || false;
    return await Issues.handleIssueCreation(analysisResult, senditMode);
}; 