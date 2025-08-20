/**
 * Base class for all command-related errors
 */
export class CommandError extends Error {
    public readonly code: string;
    public readonly recoverable: boolean;
    public readonly originalCause?: Error;

    constructor(
        message: string,
        code: string,
        recoverable: boolean = false,
        cause?: Error
    ) {
        super(message);
        this.name = 'CommandError';
        this.code = code;
        this.recoverable = recoverable;
        this.originalCause = cause;
        // Also set the standard cause property for compatibility
        if (cause) {
            (this as any).cause = cause;
        }
    }
}

/**
 * Configuration-related errors (missing config, invalid settings, etc.)
 */
export class ConfigurationError extends CommandError {
    constructor(message: string, cause?: Error) {
        super(message, 'CONFIG_ERROR', false, cause);
        this.name = 'ConfigurationError';
    }
}

/**
 * Validation errors (invalid arguments, missing required data, etc.)
 */
export class ValidationError extends CommandError {
    constructor(message: string, cause?: Error) {
        super(message, 'VALIDATION_ERROR', false, cause);
        this.name = 'ValidationError';
    }
}

/**
 * User cancellation errors (user cancelled operation)
 */
export class UserCancellationError extends CommandError {
    constructor(message: string = 'Operation cancelled by user') {
        super(message, 'USER_CANCELLED', true);
        this.name = 'UserCancellationError';
    }
}

/**
 * External dependency errors (Git, NPM, file system, etc.)
 */
export class ExternalDependencyError extends CommandError {
    constructor(message: string, dependency: string, cause?: Error) {
        super(`${dependency}: ${message}`, 'EXTERNAL_DEPENDENCY_ERROR', false, cause);
        this.name = 'ExternalDependencyError';
    }
}

/**
 * File operation errors (read, write, permissions, etc.)
 */
export class FileOperationError extends CommandError {
    constructor(message: string, filePath: string, cause?: Error) {
        super(`File operation failed on ${filePath}: ${message}`, 'FILE_OPERATION_ERROR', false, cause);
        this.name = 'FileOperationError';
    }
}

/**
 * Pull request check failures with detailed information
 */
export class PullRequestCheckError extends CommandError {
    constructor(
        message: string,
        public readonly prNumber: number,
        public readonly failedChecks: Array<{
            name: string;
            conclusion: string;
            detailsUrl?: string;
            summary?: string;
            output?: {
                title?: string;
                summary?: string;
                text?: string;
            };
        }>,
        public readonly prUrl: string,
        public readonly currentBranch?: string
    ) {
        super(message, 'PR_CHECK_FAILED', true);
        this.name = 'PullRequestCheckError';
    }

    /**
     * Get specific instructions based on the type of failures
     */
    getRecoveryInstructions(): string[] {
        const instructions: string[] = [];
        const branchName = this.currentBranch || 'your current branch';

        // Analyze failure types for specific guidance
        const testFailures = this.failedChecks.filter(check =>
            check.name.toLowerCase().includes('test') ||
            check.name.toLowerCase().includes('ci') ||
            check.output?.title?.toLowerCase().includes('test')
        );

        const lintFailures = this.failedChecks.filter(check =>
            check.name.toLowerCase().includes('lint') ||
            check.name.toLowerCase().includes('style') ||
            check.output?.title?.toLowerCase().includes('lint')
        );

        const buildFailures = this.failedChecks.filter(check =>
            check.name.toLowerCase().includes('build') ||
            check.name.toLowerCase().includes('compile') ||
            check.output?.title?.toLowerCase().includes('build')
        );

        instructions.push('🔧 To fix these failures:');
        instructions.push('');

        // Specific instructions based on failure types
        if (testFailures.length > 0) {
            instructions.push('📋 Test Failures:');
            instructions.push('   • Run tests locally: `npm test` or `yarn test`');
            instructions.push('   • Fix failing tests or update test expectations');
            instructions.push('   • Consider running specific test files if identified in the failure details');
            instructions.push('');
        }

        if (lintFailures.length > 0) {
            instructions.push('🎨 Linting/Style Failures:');
            instructions.push('   • Run linter locally: `npm run lint` or `yarn lint`');
            instructions.push('   • Auto-fix where possible: `npm run lint:fix` or `yarn lint:fix`');
            instructions.push('   • Check code formatting: `npm run format` or `yarn format`');
            instructions.push('');
        }

        if (buildFailures.length > 0) {
            instructions.push('🏗️ Build Failures:');
            instructions.push('   • Run build locally: `npm run build` or `yarn build`');
            instructions.push('   • Check for TypeScript errors: `npx tsc --noEmit`');
            instructions.push('   • Review dependency issues and import paths');
            instructions.push('');
        }

        // General workflow instructions
        instructions.push('📤 After fixing the issues:');
        instructions.push(`   1. Stage your changes: \`git add .\``);
        instructions.push(`   2. Commit your fixes: \`git commit -m "fix: resolve PR check failures"\``);
        instructions.push(`   3. Push to ${branchName}: \`git push origin ${branchName}\``);
        instructions.push(`   4. The PR checks will automatically re-run`);
        instructions.push('');

        instructions.push('🔄 Re-running this command:');
        instructions.push('   • The kodrdriv publish command will automatically detect the existing PR');
        instructions.push('   • Simply run the same command again after pushing your fixes');
        instructions.push('   • You can also manually trigger checks by pushing an empty commit:');
        instructions.push(`     \`git commit --allow-empty -m "trigger checks" && git push origin ${branchName}\``);

        return instructions;
    }
}
