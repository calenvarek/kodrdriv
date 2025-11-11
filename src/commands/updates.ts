#!/usr/bin/env node
/**
 * Updates command - Run npm-check-updates with scoped patterns
 *
 * This command provides a convenient way to update dependencies matching specific scopes:
 * - Can target specific scopes like "@fjell" or "@getdidthey"
 * - Works at both project level and tree level (across multiple packages)
 * - Uses npm-check-updates to update matching packages
 *
 * Examples:
 *   kodrdriv updates @fjell           # Update @fjell/* packages in current project
 *   kodrdriv tree updates @fjell      # Update @fjell/* packages across all projects in tree
 *   kodrdriv updates @getdidthey      # Update @getdidthey/* packages in current project
 */

import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { run } from '@eldrforge/git-tools';

/**
 * Execute the updates command
 */
export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    // Get scope from either the updates config or tree packageArgument (for tree mode)
    const scope = runConfig.updates?.scope || runConfig.tree?.packageArgument;

    if (!scope) {
        throw new Error('Scope parameter is required. Usage: kodrdriv updates <scope> or kodrdriv tree updates <scope>');
    }

    // Validate that scope looks like a valid npm scope (starts with @)
    if (!scope.startsWith('@')) {
        throw new Error(`Invalid scope "${scope}". Scope must start with @ (e.g., "@fjell")`);
    }

    logger.info(`🔄 Running npm-check-updates for scope: ${scope}`);

    // Build the npm-check-updates command
    const ncuCommand = `npx npm-check-updates '/${scope.replace('@', '^@')}//' -u`;

    logger.info(`📦 Executing: ${ncuCommand}`);

    try {
        if (isDryRun) {
            logger.info(`Would run: ${ncuCommand}`);
            return `Would update dependencies matching ${scope} scope`;
        }

        // Execute npm-check-updates
        const result = await run(ncuCommand);

        if (result.stdout) {
            logger.info('✅ npm-check-updates output:');
            result.stdout.split('\n').forEach(line => {
                if (line.trim()) {
                    logger.info(`   ${line}`);
                }
            });
        }

        if (result.stderr) {
            logger.info('⚠️  npm-check-updates warnings:');
            result.stderr.split('\n').forEach(line => {
                if (line.trim()) {
                    logger.info(`   ${line}`);
                }
            });
        }

        logger.info(`✅ Successfully updated dependencies matching ${scope} scope`);
        return `Updated dependencies matching ${scope} scope`;

    } catch (error: any) {
        logger.error(`Failed to run npm-check-updates for ${scope}:`, error.message);
        throw new Error(`Failed to update dependencies: ${error.message}`);
    }
};
