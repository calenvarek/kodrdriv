#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import { ChatCompletionMessageParam } from 'openai/resources';
import { getLogger } from '../logging';
import { Config } from '../types';
import { createCompletion } from '../util/openai';
import * as ReviewPrompt from '../prompt/review';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as ReleaseNotes from '../content/releaseNotes';
import * as Issues from '../content/issues';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedReviewFilename, getTimestampedReviewNotesFilename } from '../util/general';
import { create as createStorage } from '../util/storage';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import fs from 'fs/promises';

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
    let reviewNote = runConfig.review?.note;

    // If no review note was provided via CLI arg or STDIN, open the user's editor to capture it.
    if (!reviewNote || !reviewNote.trim()) {
        const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

        // Create a temporary file for the user to edit.
        const tmpDir = os.tmpdir();
        const tmpFilePath = path.join(tmpDir, `kodrdriv_review_${Date.now()}.md`);

        // Pre-populate the file with a helpful header so users know what to do.
        const templateContent = [
            '# Kodrdriv Review Note',
            '',
            '# Please enter your review note below. Lines starting with "#" will be ignored.',
            '# Save and close the editor when you are done.',
            '',
            '',
        ].join('\n');

        await fs.writeFile(tmpFilePath, templateContent, 'utf8');

        logger.info(`No review note provided – opening ${editor} to capture input...`);

        // Open the editor synchronously so execution resumes after the user closes it.
        const result = spawnSync(editor, [tmpFilePath], { stdio: 'inherit' });

        if (result.error) {
            throw new Error(`Failed to launch editor '${editor}': ${result.error.message}`);
        }

        // Read the file back in, stripping comment lines and whitespace.
        const fileContent = (await fs.readFile(tmpFilePath, 'utf8'))
            .split('\n')
            .filter(line => !line.trim().startsWith('#'))
            .join('\n')
            .trim();

        // Clean up the temporary file (best-effort – ignore errors).
        try {
            await fs.unlink(tmpFilePath);
        } catch {
            /* ignore */
        }

        if (!fileContent) {
            throw new Error('Review note is empty – aborting. Provide a note as an argument, via STDIN, or through the editor.');
        }

        reviewNote = fileContent;

        // If the original runConfig.review object exists, update it so downstream code has the note.
        if (runConfig.review) {
            runConfig.review.note = reviewNote;
        }
    }

    logger.info('📝 Starting review analysis...');
    logger.debug('Review note: %s', reviewNote);
    logger.debug('Review note length: %d characters', reviewNote.length);

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
    logger.debug('Context summary:');
    logger.debug('  - Review note: %d chars', reviewNote.length);
    logger.debug('  - Log context: %d chars', logContext.length);
    logger.debug('  - Diff context: %d chars', diffContext.length);
    logger.debug('  - Release notes context: %d chars', releaseNotesContext.length);
    logger.debug('  - Issues context: %d chars', issuesContext.length);
    logger.debug('  - User context: %d chars', runConfig.review?.context?.length || 0);

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    const promptContent = {
        notes: reviewNote,
    };
    const promptContext = {
        context: runConfig.review?.context,
        logContext,
        diffContext,
        releaseNotesContext,
        issuesContext,
    };
    const prompt = await ReviewPrompt.createPrompt(promptConfig, promptContent, promptContext);

    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    // Save timestamped copy of review notes and context to output directory
    try {
        // Save the original review note
        const reviewNotesFilename = getTimestampedReviewNotesFilename();
        const reviewNotesPath = getOutputPath(outputDirectory, reviewNotesFilename);

        let reviewNotesContent = `# Review Notes\n\n${reviewNote}\n\n`;

        // Add all context sections if they exist
        if (logContext.trim()) {
            reviewNotesContent += `# Commit History Context\n\n${logContext}\n\n`;
        }
        if (diffContext.trim()) {
            reviewNotesContent += `# Recent Diffs Context\n\n${diffContext}\n\n`;
        }
        if (releaseNotesContext.trim()) {
            reviewNotesContent += `# Release Notes Context\n\n${releaseNotesContext}\n\n`;
        }
        if (issuesContext.trim()) {
            reviewNotesContent += `# GitHub Issues Context\n\n${issuesContext}\n\n`;
        }
        if (runConfig.review?.context?.trim()) {
            reviewNotesContent += `# User Context\n\n${runConfig.review.context}\n\n`;
        }

        await storage.writeFile(reviewNotesPath, reviewNotesContent, 'utf-8');
        logger.debug('Saved timestamped review notes and context: %s', reviewNotesPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped review notes: %s', error.message);
    }

    const request: Request = Formatter.create({ logger }).formatPrompt(runConfig.model as Model, prompt);

    const analysisResult = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        responseFormat: { type: 'json_object' },
        debug: runConfig.debug,
        debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('review-analysis')),
        debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('review-analysis')),
    }) as Issues.ReviewResult;

    logger.info('✅ Analysis completed');
    logger.debug('Analysis result summary: %s', analysisResult.summary);
    logger.debug('Total issues found: %d', analysisResult.totalIssues);
    logger.debug('Issues array length: %d', analysisResult.issues?.length || 0);
    if (analysisResult.issues && analysisResult.issues.length > 0) {
        analysisResult.issues.forEach((issue, index) => {
            logger.debug('  Issue %d: [%s] %s', index + 1, issue.priority, issue.title);
        });
    }

    // Save timestamped copy of analysis result to output directory
    try {
        const reviewFilename = getTimestampedReviewFilename();
        const reviewPath = getOutputPath(outputDirectory, reviewFilename);

        // Format the analysis result as markdown
        const reviewContent = `# Review Analysis Result\n\n` +
            `## Summary\n${analysisResult.summary}\n\n` +
            `## Total Issues Found\n${analysisResult.totalIssues}\n\n` +
            `## Issues\n\n${JSON.stringify(analysisResult.issues, null, 2)}\n\n` +
            `---\n\n*Analysis completed at ${new Date().toISOString()}*`;

        await storage.writeFile(reviewPath, reviewContent, 'utf-8');
        logger.debug('Saved timestamped review analysis: %s', reviewPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped review analysis: %s', error.message);
    }

    // Handle GitHub issue creation using the issues module
    const senditMode = runConfig.review?.sendit || false;
    return await Issues.handleIssueCreation(analysisResult, senditMode);
}; 