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

// Mock git-tools
vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn(),
    safeJsonParse: vi.fn((json) => JSON.parse(json)),
    validatePackageJson: vi.fn((json) => json),
}));

// Mock precommit optimizations
vi.mock('../../src/util/precommitOptimizations', () => ({
    optimizePrecommitCommand: vi.fn().mockResolvedValue({
        optimizedCommand: 'npm run lint && npm run build && npm run test',
        skipped: { clean: false, test: false },
        reasons: { clean: undefined, test: undefined }
    }),
    recordTestRun: vi.fn().mockResolvedValue(undefined)
}));

// Mock performance timer
vi.mock('../../src/util/performance', () => ({
    PerformanceTimer: {
        start: vi.fn().mockReturnValue({
            end: vi.fn().mockReturnValue(1000)
        })
    }
}));

describe('precommit command', () => {
    let Precommit: any;
    let Logging: any;
    let GitTools: any;
    let PrecommitOptimizations: any;
    let mockLogger: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        Logging = await import('../../src/logging');
        GitTools = await import('@eldrforge/git-tools');
        PrecommitOptimizations = await import('../../src/util/precommitOptimizations');
        Precommit = await import('../../src/commands/precommit');

        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        Logging.getLogger.mockReturnValue(mockLogger);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('execute', () => {
        it('should run precommit checks with default command', async () => {
            const config = { dryRun: false, verbose: false, debug: false };

            const result = await Precommit.execute(config);

            expect(GitTools.run).toHaveBeenCalled();
            expect(result).toContain('Precommit checks completed successfully');
        });

        it('should return dry run message when dryRun is true', async () => {
            const config = { dryRun: true, verbose: false, debug: false };

            const result = await Precommit.execute(config);

            expect(GitTools.run).not.toHaveBeenCalled();
            expect(result).toContain('DRY RUN');
        });

        it('should handle optimization failure gracefully', async () => {
            const config = { dryRun: false, verbose: false, debug: false };
            PrecommitOptimizations.optimizePrecommitCommand.mockRejectedValue(
                new Error('Optimization failed')
            );

            const result = await Precommit.execute(config);

            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Precommit optimization failed'));
            expect(GitTools.run).toHaveBeenCalled();
        });

        it('should handle optimization info when verbose is true', async () => {
            const config = { dryRun: false, verbose: true, debug: false };
            PrecommitOptimizations.optimizePrecommitCommand.mockResolvedValue({
                optimizedCommand: 'npm run lint && npm run build',
                skipped: { clean: true, test: false },
                reasons: { clean: 'No changes to clean', test: undefined }
            });

            const result = await Precommit.execute(config);

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Optimized'));
            expect(result).toContain('Precommit checks completed successfully');
        });

        it('should measure execution time', async () => {
            const config = { dryRun: false, verbose: false, debug: false };

            const result = await Precommit.execute(config);

            expect(result).toContain('completed successfully');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Running precommit checks'));
        });

        it('should handle execution with debug enabled', async () => {
            const config = { dryRun: false, verbose: false, debug: true };

            const result = await Precommit.execute(config);

            expect(GitTools.run).toHaveBeenCalled();
            expect(result).toContain('Precommit checks completed successfully');
        });
    });
});

