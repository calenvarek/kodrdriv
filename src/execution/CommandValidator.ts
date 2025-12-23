import { getLogger } from '../logging';

export interface ValidationResult {
    valid: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
}

/**
 * CommandValidator checks if commands are safe for parallel execution
 */
export class CommandValidator {
    private static logger = getLogger();

    /**
     * Validate a command for parallel execution
     */
    static validateForParallel(command: string, builtInCommand?: string): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        const recommendations: string[] = [];

        // Check for inherently unsafe operations
        const unsafePatterns = [
            { pattern: /git\s+checkout/, message: 'Branch switching is not safe for parallel execution' },
            { pattern: /git\s+switch/, message: 'Branch switching is not safe for parallel execution' },
            { pattern: /git\s+rebase/, message: 'Rebase operations should not run in parallel' },
            { pattern: /git\s+merge/, message: 'Merge operations should not run in parallel' },
            { pattern: /rm\s+-rf\s+\//, message: 'Dangerous deletion commands detected' },
            { pattern: /sudo/, message: 'Sudo commands should not run in parallel' },
            { pattern: /format/, message: 'Format commands may be destructive' }
        ];

        for (const { pattern, message } of unsafePatterns) {
            if (pattern.test(command)) {
                issues.push(message);
            }
        }

        // Check for potentially problematic operations
        const warningPatterns = [
            { pattern: /npm\s+(link|unlink)/, message: 'npm link/unlink may conflict in parallel execution' },
            { pattern: /npm\s+install/, message: 'npm install in parallel may cause lock file conflicts' },
            { pattern: /npm\s+ci/, message: 'npm ci in parallel may cause lock file conflicts' },
            { pattern: /package-lock\.json/, message: 'Operations modifying package-lock.json may conflict' },
            { pattern: /node_modules/, message: 'Operations in node_modules may conflict' }
        ];

        for (const { pattern, message } of warningPatterns) {
            if (pattern.test(command)) {
                warnings.push(message);
            }
        }

        // Built-in command specific checks
        if (builtInCommand === 'commit') {
            warnings.push('Parallel commits: Recommend max concurrency of 2 to avoid conflicts');
            recommendations.push('Use: --max-concurrency 2');
        }

        if (builtInCommand === 'publish') {
            warnings.push('Parallel publish: PR checks may take significant time');
            warnings.push('Version propagation happens automatically between dependency levels');
            recommendations.push('Use: --max-concurrency 2-3 for publish operations');
            recommendations.push('Monitor with: kodrdriv tree --status-parallel');
        }

        if (builtInCommand === 'link' || builtInCommand === 'unlink') {
            warnings.push('Link operations may have filesystem race conditions');
            recommendations.push('Consider sequential execution for link/unlink');
        }

        // Check for output redirection
        if (command.includes('>') || command.includes('>>')) {
            warnings.push('Output redirection in parallel may interleave output');
        }

        return {
            valid: issues.length === 0,
            issues,
            warnings,
            recommendations
        };
    }

    /**
     * Log validation results
     */
    static logValidation(result: ValidationResult): void {
        if (!result.valid) {
            this.logger.error('VALIDATOR_FAILED: Command validation failed for parallel execution | Error Count: ' + result.issues.length + ' | Impact: Cannot proceed safely');
            for (const issue of result.issues) {
                this.logger.error(`VALIDATOR_ERROR_DETAIL: Validation issue | Issue: ${issue}`);
            }
        }

        if (result.warnings.length > 0) {
            this.logger.warn('VALIDATOR_WARNINGS: Command validation warnings for parallel execution | Warning Count: ' + result.warnings.length + ' | Impact: May cause issues');
            for (const warning of result.warnings) {
                this.logger.warn(`VALIDATOR_WARNING_DETAIL: Validation warning | Warning: ${warning}`);
            }
        }

        if (result.recommendations.length > 0 && (this.logger as any).verbose) {
            this.logger.info('VALIDATOR_RECOMMENDATIONS: Command validation recommendations | Count: ' + result.recommendations.length + ' | Purpose: Improve parallel execution');
            for (const rec of result.recommendations) {
                this.logger.info(`VALIDATOR_RECOMMENDATION_DETAIL: ${rec}`);
            }
        }
    }

    /**
     * Get recommended concurrency for a command type
     */
    static getRecommendedConcurrency(builtInCommand?: string, cpuCount: number = 4, command?: string): number {
        // If command is provided, check for memory-intensive patterns
        if (command) {
            const memoryIntensivePatterns = [
                { pattern: /npm\s+test/, message: 'Test execution is memory intensive' },
                { pattern: /npm\s+run\s+test/, message: 'Test execution is memory intensive' },
                { pattern: /vitest/, message: 'Vitest execution is memory intensive' },
                { pattern: /coverage/, message: 'Coverage generation is memory intensive' },
                { pattern: /npm\s+run\s+precommit/, message: 'Precommit tasks (build+lint+test) are resource intensive' }
            ];

            for (const { pattern } of memoryIntensivePatterns) {
                if (pattern.test(command)) {
                    // Return lower concurrency for memory intensive tasks: 25% of CPUs, min 2, max 4
                    const recommended = Math.max(2, Math.min(4, Math.floor(cpuCount * 0.25)));
                    return Math.min(recommended, cpuCount);
                }
            }
        }

        switch (builtInCommand) {
            case 'commit':
                // Lower concurrency for commit to reduce conflicts
                return Math.min(2, cpuCount);

            case 'publish':
                // Moderate concurrency for publish (long-running)
                return Math.max(2, Math.floor(cpuCount / 2));

            case 'link':
            case 'unlink':
                // Very conservative for link operations
                return 1; // Sequential recommended

            default:
                // Full concurrency for general commands
                return cpuCount;
        }
    }
}
