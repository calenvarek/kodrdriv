import { describe, it, expect, beforeEach, vi } from 'vitest';
import { filterContent } from '../../src/util/stopContext';
import { StopContextConfig } from '../../src/types';

// Mock the logger
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        warn: vi.fn(),
        verbose: vi.fn(),
        isVerbose: () => false,
    }),
}));

/**
 * Integration tests for stop-context filtering
 * These tests verify that filtering works correctly in realistic scenarios
 * that mirror actual command usage
 */

describe('stopContext Integration Tests', () => {
    describe('Commit Message Filtering', () => {
        it('should filter sensitive project names from commit messages', () => {
            const commitMessage = 'feat: Add authentication module from ProjectAlpha\n\nImplemented OAuth2 flow based on work in CompanyBeta repository';
            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectAlpha', 'CompanyBeta'],
                replacement: '[REDACTED]',
            };

            const result = filterContent(commitMessage, config);

            expect(result.filtered).toBe('feat: Add authentication module from [REDACTED]\n\nImplemented OAuth2 flow based on work in [REDACTED] repository');
            expect(result.matchCount).toBe(2);
        });

        it('should filter username patterns from commit messages', () => {
            const commitMessage = 'fix: Update user profile handling\n\nTested with user-12345 and admin-67890';
            const config: StopContextConfig = {
                enabled: true,
                patterns: [
                    {
                        regex: '\\b(user|admin)-\\d+\\b',
                        flags: 'gi',
                    },
                ],
                replacement: '[USER]',
            };

            const result = filterContent(commitMessage, config);

            expect(result.filtered).toBe('fix: Update user profile handling\n\nTested with [USER] and [USER]');
            expect(result.matchCount).toBe(2);
        });

        it('should filter directory paths from commit messages', () => {
            const commitMessage = 'chore: Update build script\n\nMoved files from /Users/john/projects/secret-project to production';
            const config: StopContextConfig = {
                enabled: true,
                patterns: [
                    {
                        regex: '/Users/\\w+/projects/[\\w-]+',
                        flags: 'g',
                    },
                ],
                replacement: '[PATH]',
            };

            const result = filterContent(commitMessage, config);

            expect(result.filtered).toBe('chore: Update build script\n\nMoved files from [PATH] to production');
            expect(result.matchCount).toBe(1);
        });
    });

    describe('Release Notes Filtering', () => {
        it('should filter sensitive information from release title and body', () => {
            const releaseTitle = 'Release v2.0.0 - Integration with ProjectX';
            const releaseBody = '## Features\n- Added ProjectX integration\n- Improved performance\n\n## Contributors\nThanks to the ProjectX team!';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectX'],
                replacement: '[PARTNER]',
            };

            const titleResult = filterContent(releaseTitle, config);
            const bodyResult = filterContent(releaseBody, config);

            expect(titleResult.filtered).toBe('Release v2.0.0 - Integration with [PARTNER]');
            expect(bodyResult.filtered).toContain('[PARTNER] integration');
            expect(bodyResult.filtered).toContain('[PARTNER] team');
            expect(titleResult.matchCount + bodyResult.matchCount).toBe(3);
        });

        it('should filter multiple sensitive patterns from release notes', () => {
            const releaseBody = `## What's New
- Integration with internal-api-v2
- Support for @secret-org/packages
- Deployment to internal.company.com

Contact: admin@internal.company.com`;

            const config: StopContextConfig = {
                enabled: true,
                strings: ['internal-api-v2'],
                patterns: [
                    {
                        regex: '@secret-org/[\\w-]+',
                        flags: 'g',
                    },
                    {
                        regex: '\\b[\\w.]+@internal\\.company\\.com\\b',
                        flags: 'gi',
                    },
                    {
                        regex: 'internal\\.company\\.com',
                        flags: 'gi',
                    },
                ],
                replacement: '[FILTERED]',
            };

            const result = filterContent(releaseBody, config);

            expect(result.filtered).not.toContain('internal-api-v2');
            expect(result.filtered).not.toContain('@secret-org/');
            expect(result.filtered).not.toContain('internal.company.com');
            expect(result.filtered).not.toContain('admin@internal.company.com');
            expect(result.matchCount).toBeGreaterThan(0);
        });
    });

    describe('GitHub Issue Filtering', () => {
        it('should filter sensitive information from issue titles and bodies', () => {
            const issueTitle = 'Bug in ProjectAlpha integration module';
            const issueBody = 'When integrating with ProjectAlpha API, we encounter errors.\n\nSteps to reproduce:\n1. Connect to ProjectAlpha\n2. Call the sync endpoint';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectAlpha'],
                replacement: '[EXTERNAL]',
            };

            const titleResult = filterContent(issueTitle, config);
            const bodyResult = filterContent(issueBody, config);

            expect(titleResult.filtered).toBe('Bug in [EXTERNAL] integration module');
            expect(bodyResult.filtered).toContain('[EXTERNAL] API');
            expect(bodyResult.filtered).toContain('Connect to [EXTERNAL]');
            expect(titleResult.matchCount + bodyResult.matchCount).toBe(3);
        });

        it('should filter JIRA ticket references from issues', () => {
            const issueBody = 'This relates to PROJ-1234 and TEAM-5678 from our internal tracker';

            const config: StopContextConfig = {
                enabled: true,
                patterns: [
                    {
                        regex: '\\b[A-Z]{2,}-\\d+\\b',
                        flags: 'g',
                        description: 'JIRA ticket references',
                    },
                ],
                replacement: '[TICKET]',
            };

            const result = filterContent(issueBody, config);

            expect(result.filtered).toBe('This relates to [TICKET] and [TICKET] from our internal tracker');
            expect(result.matchCount).toBe(2);
        });
    });

    describe('Pull Request Filtering', () => {
        it('should filter sensitive information from PR titles', () => {
            const prTitle = 'Merge changes from secret-project-alpha';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['secret-project-alpha'],
                replacement: '[PROJECT]',
            };

            const result = filterContent(prTitle, config);

            expect(result.filtered).toBe('Merge changes from [PROJECT]');
            expect(result.matchCount).toBe(1);
        });

        it('should filter organization names from PR descriptions', () => {
            const prDescription = 'Automated release PR.\n\nThis PR includes changes from @internal-org packages.';

            const config: StopContextConfig = {
                enabled: true,
                patterns: [
                    {
                        regex: '@internal-org',
                        flags: 'g',
                    },
                ],
                replacement: '[ORG]',
            };

            const result = filterContent(prDescription, config);

            expect(result.filtered).toContain('[ORG] packages');
            expect(result.matchCount).toBe(1);
        });
    });

    describe('Real-World Scenarios', () => {
        it('should handle multi-line text with mixed sensitive content', () => {
            const text = `# Release Notes v1.5.0

## Features
- Integration with ProjectAlpha API
- Support for @secret-org/core package
- Deployment to internal.company.com

## Bug Fixes
- Fixed issue PROJ-1234
- Updated user-12345 permissions

## Contributors
Thanks to john.doe@company.com and the ProjectAlpha team!

Contact: admin@internal.company.com`;

            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectAlpha'],
                patterns: [
                    {
                        regex: '@secret-org/[\\w-]+',
                        flags: 'g',
                    },
                    {
                        regex: 'internal\\.company\\.com',
                        flags: 'gi',
                    },
                    {
                        regex: '\\b[A-Z]{2,}-\\d+\\b',
                        flags: 'g',
                    },
                    {
                        regex: 'user-\\d+',
                        flags: 'g',
                    },
                    {
                        regex: '\\b[\\w.]+@company\\.com\\b',
                        flags: 'gi',
                    },
                ],
                replacement: '[FILTERED]',
            };

            const result = filterContent(text, config);

            // Verify all sensitive content is filtered
            expect(result.filtered).not.toContain('ProjectAlpha');
            expect(result.filtered).not.toContain('@secret-org/');
            expect(result.filtered).not.toContain('internal.company.com');
            expect(result.filtered).not.toContain('PROJ-1234');
            expect(result.filtered).not.toContain('user-12345');
            expect(result.filtered).not.toContain('john.doe@company.com');
            expect(result.filtered).not.toContain('admin@internal.company.com');

            // Verify structure is maintained
            expect(result.filtered).toContain('# Release Notes v1.5.0');
            expect(result.filtered).toContain('## Features');
            expect(result.filtered).toContain('## Bug Fixes');
            expect(result.filtered).toContain('## Contributors');

            // Verify filtering happened
            expect(result.matchCount).toBeGreaterThan(5);
        });

        it('should handle empty or minimal filtering gracefully', () => {
            const text = 'Simple commit message with no sensitive content';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['NonExistent'],
                patterns: [
                    {
                        regex: 'NotInText',
                        flags: 'g',
                    },
                ],
            };

            const result = filterContent(text, config);

            expect(result.filtered).toBe(text);
            expect(result.matchCount).toBe(0);
            expect(result.originalLength).toBe(result.filteredLength);
        });

        it('should maintain text quality after heavy filtering', () => {
            const text = 'The ProjectA team worked with ProjectB on feature-X';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectA', 'ProjectB', 'feature-X'],
                replacement: '[REDACTED]',
            };

            const result = filterContent(text, config);

            // Should maintain sentence structure
            expect(result.filtered).toBe('The [REDACTED] team worked with [REDACTED] on [REDACTED]');
            expect(result.matchCount).toBe(3);

            // Should not have awkward spacing
            expect(result.filtered).not.toContain('  '); // double spaces
        });

        it('should handle case variations correctly', () => {
            const text = 'ProjectAlpha, projectalpha, PROJECTALPHA, and PrOjEcTaLpHa';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['projectalpha'],
                caseSensitive: false,
                replacement: '[X]',
            };

            const result = filterContent(text, config);

            expect(result.filtered).toBe('[X], [X], [X], and [X]');
            expect(result.matchCount).toBe(4);
        });

        it('should respect case sensitivity when enabled', () => {
            const text = 'ProjectAlpha, projectalpha, PROJECTALPHA';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['ProjectAlpha'],
                caseSensitive: true,
                replacement: '[X]',
            };

            const result = filterContent(text, config);

            expect(result.filtered).toBe('[X], projectalpha, PROJECTALPHA');
            expect(result.matchCount).toBe(1);
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle very long text efficiently', () => {
            const longText = 'normal text '.repeat(10000) + 'SECRET ' + 'normal text '.repeat(10000);

            const config: StopContextConfig = {
                enabled: true,
                strings: ['SECRET'],
                replacement: '[X]',
            };

            const startTime = Date.now();
            const result = filterContent(longText, config);
            const duration = Date.now() - startTime;

            expect(result.matchCount).toBe(1);
            expect(result.filtered).toContain('[X]');
            expect(result.filtered).not.toContain('SECRET');
            expect(duration).toBeLessThan(1000); // Should complete in under 1 second
        });

        it('should handle many filters efficiently', () => {
            const text = 'word1 word2 word3 word4 word5';

            const config: StopContextConfig = {
                enabled: true,
                strings: ['word1', 'word2', 'word3', 'word4', 'word5'],
                replacement: '[X]',
            };

            const result = filterContent(text, config);

            expect(result.filtered).toBe('[X] [X] [X] [X] [X]');
            expect(result.matchCount).toBe(5);
        });

        it('should handle overlapping filter matches', () => {
            const text = 'abcdefg';

            const config: StopContextConfig = {
                enabled: true,
                patterns: [
                    {
                        regex: 'abc',
                        flags: 'g',
                    },
                    {
                        regex: 'def',
                        flags: 'g',
                    },
                ],
                replacement: '[X]',
            };

            const result = filterContent(text, config);

            // After first filter: [X]defg
            // After second filter: [X][X]g
            expect(result.filtered).toBe('[X][X]g');
            expect(result.matchCount).toBe(2);
        });
    });
});

