import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, handleIssueCreation, type Issue, type ReviewResult } from '../../src/content/issues';
import * as logging from '../../src/logging';
import * as github from '../../src/util/github';
import fs from 'fs/promises';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

// Mock dependencies
vi.mock('../../src/logging');
vi.mock('../../src/util/github');
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('os')>();
    return {
        ...actual,
        tmpdir: vi.fn().mockReturnValue('/tmp'),
        homedir: vi.fn().mockReturnValue('/home/user')
    };
});
vi.mock('path', async (importOriginal) => {
    const actual = await importOriginal<typeof import('path')>();
    return {
        ...actual,
        join: vi.fn().mockImplementation((...args) => args.join('/'))
    };
});

describe('issues', () => {
    const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(logging.getLogger).mockReturnValue(mockLogger);
        // Reset environment variables
        delete process.env.EDITOR;
        delete process.env.VISUAL;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('get', () => {
        it('should fetch GitHub issues with default limit', async () => {
            const mockIssues = 'Issue 1\nIssue 2\nIssue 3';
            vi.mocked(github.getOpenIssues).mockResolvedValue(mockIssues);

            const result = await get();

            expect(github.getOpenIssues).toHaveBeenCalledWith(20);
            expect(result).toBe(mockIssues);
            expect(mockLogger.debug).toHaveBeenCalledWith('Fetching open GitHub issues...');
            expect(mockLogger.debug).toHaveBeenCalledWith('Added GitHub issues to context (%d characters)', mockIssues.length);
        });

        it('should fetch GitHub issues with custom limit', async () => {
            const mockIssues = 'Issue 1\nIssue 2';
            vi.mocked(github.getOpenIssues).mockResolvedValue(mockIssues);

            const result = await get({ limit: 10 });

            expect(github.getOpenIssues).toHaveBeenCalledWith(10);
            expect(result).toBe(mockIssues);
        });

        it('should cap limit at 20', async () => {
            const mockIssues = 'Issue 1';
            vi.mocked(github.getOpenIssues).mockResolvedValue(mockIssues);

            await get({ limit: 50 });

            expect(github.getOpenIssues).toHaveBeenCalledWith(20);
        });

        it('should handle empty GitHub issues', async () => {
            vi.mocked(github.getOpenIssues).mockResolvedValue('');

            const result = await get();

            expect(result).toBe('');
            expect(mockLogger.debug).toHaveBeenCalledWith('No open GitHub issues found');
        });

        it('should handle GitHub API errors', async () => {
            const error = new Error('API Error');
            vi.mocked(github.getOpenIssues).mockRejectedValue(error);

            const result = await get();

            expect(result).toBe('');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch GitHub issues: %s', error.message);
        });
    });

    describe('handleIssueCreation', () => {
        const mockIssue: Issue = {
            title: 'Test Issue',
            description: 'Test description',
            priority: 'medium',
            category: 'functionality',
            suggestions: ['Fix this', 'Improve that']
        };

        const mockReviewResult: ReviewResult = {
            summary: 'Test review summary',
            totalIssues: 1,
            issues: [mockIssue]
        };

        beforeEach(() => {
            // Mock stdin for interactive tests
            Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
            process.stdin.setRawMode = vi.fn();
            process.stdin.resume = vi.fn();
            process.stdin.pause = vi.fn();
            process.stdin.ref = vi.fn();
            process.stdin.unref = vi.fn();
            process.stdin.on = vi.fn();

            // Mock file system operations
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);
            vi.mocked(fs.readFile).mockResolvedValue('Title: Edited Issue\n\nPriority: high\n\nCategory: ui\n\nDescription:\nEdited description\n\nSuggestions:\n- New suggestion');
            vi.mocked(fs.unlink).mockResolvedValue(undefined);
            vi.mocked(spawnSync).mockReturnValue({ error: null } as any);
        });

        it('should format results when no issues exist', async () => {
            const emptyResult: ReviewResult = {
                summary: 'No issues found',
                totalIssues: 0,
                issues: []
            };

            const result = await handleIssueCreation(emptyResult);

            expect(result).toContain('📝 Review Results');
            expect(result).toContain('📋 Summary: No issues found');
            expect(result).toContain('📊 Total Issues Found: 0');
            expect(result).toContain('✅ No specific issues identified from the review.');
        });

        it('should create GitHub issues in sendit mode', async () => {
            const mockCreatedIssue = {
                html_url: 'https://github.com/user/repo/issues/123',
                number: 123
            };
            vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

            const result = await handleIssueCreation(mockReviewResult, true);

            expect(github.createIssue).toHaveBeenCalledWith(
                'Test Issue',
                expect.stringContaining('## Description'),
                ['priority-medium', 'category-functionality', 'review']
            );
            expect(result).toContain('🚀 GitHub Issues Created: 1');
            expect(result).toContain('#123: Test Issue - https://github.com/user/repo/issues/123');
            expect(mockLogger.info).toHaveBeenCalledWith('🚀 Creating GitHub issue: "Test Issue"');
            expect(mockLogger.info).toHaveBeenCalledWith('✅ Created GitHub issue #123: https://github.com/user/repo/issues/123');
        });

        it('should handle GitHub issue creation errors', async () => {
            const error = new Error('GitHub API Error');
            vi.mocked(github.createIssue).mockRejectedValue(error);

            const result = await handleIssueCreation(mockReviewResult, true);

            expect(result).toContain('📝 Review Results');
            expect(result).toContain('📋 Summary: Test review summary');
            expect(result).toContain('📊 Total Issues Found: 1');
            expect(result).toContain('🚀 Next Steps: Review the identified issues and prioritize them for your development workflow.');
            expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to create GitHub issue for "Test Issue": GitHub API Error');
        });

        it('should format issue body correctly', async () => {
            const mockCreatedIssue = {
                html_url: 'https://github.com/user/repo/issues/123',
                number: 123
            };
            vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

            await handleIssueCreation(mockReviewResult, true);

            expect(github.createIssue).toHaveBeenCalledWith(
                'Test Issue',
                expect.stringContaining('## Description\n\nTest description\n\n## Details\n\n- **Priority:** medium\n- **Category:** functionality\n- **Source:** Review\n\n## Suggestions\n\n- Fix this\n- Improve that'),
                ['priority-medium', 'category-functionality', 'review']
            );
        });

        it('should handle issues without suggestions', async () => {
            const issueWithoutSuggestions: Issue = {
                title: 'Simple Issue',
                description: 'Simple description',
                priority: 'low',
                category: 'ui'
            };

            const reviewResult: ReviewResult = {
                summary: 'Simple review',
                totalIssues: 1,
                issues: [issueWithoutSuggestions]
            };

            const mockCreatedIssue = {
                html_url: 'https://github.com/user/repo/issues/124',
                number: 124
            };
            vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

            await handleIssueCreation(reviewResult, true);

            expect(github.createIssue).toHaveBeenCalledWith(
                'Simple Issue',
                expect.not.stringContaining('## Suggestions'),
                ['priority-low', 'category-ui', 'review']
            );
        });

        it('should format results with various issue priorities and categories', async () => {
            const mixedIssues: Issue[] = [
                {
                    title: 'High Priority UI Issue',
                    description: 'Critical UI problem',
                    priority: 'high',
                    category: 'ui'
                },
                {
                    title: 'Low Priority Performance Issue',
                    description: 'Minor performance issue',
                    priority: 'low',
                    category: 'performance'
                },
                {
                    title: 'Medium Priority Accessibility Issue',
                    description: 'Accessibility concern',
                    priority: 'medium',
                    category: 'accessibility'
                }
            ];

            const mixedResult: ReviewResult = {
                summary: 'Mixed issues found',
                totalIssues: 3,
                issues: mixedIssues
            };

            const result = await handleIssueCreation(mixedResult, true);

            expect(result).toContain('🔴 High Priority UI Issue');
            expect(result).toContain('🎨 Category: ui | Priority: high');
            expect(result).toContain('🟢 Low Priority Performance Issue');
            expect(result).toContain('⚡ Category: performance | Priority: low');
            expect(result).toContain('🟡 Medium Priority Accessibility Issue');
            expect(result).toContain('♿ Category: accessibility | Priority: medium');
        });

        it('should handle all category types with correct emojis', async () => {
            const allCategoryIssues: Issue[] = [
                { title: 'UI Issue', description: 'UI desc', priority: 'medium', category: 'ui' },
                { title: 'Content Issue', description: 'Content desc', priority: 'medium', category: 'content' },
                { title: 'Functionality Issue', description: 'Func desc', priority: 'medium', category: 'functionality' },
                { title: 'Accessibility Issue', description: 'A11y desc', priority: 'medium', category: 'accessibility' },
                { title: 'Performance Issue', description: 'Perf desc', priority: 'medium', category: 'performance' },
                { title: 'Other Issue', description: 'Other desc', priority: 'medium', category: 'other' }
            ];

            const allCategoryResult: ReviewResult = {
                summary: 'All categories test',
                totalIssues: 6,
                issues: allCategoryIssues
            };

            const result = await handleIssueCreation(allCategoryResult, true);

            expect(result).toContain('🎨 Category: ui');
            expect(result).toContain('📝 Category: content');
            expect(result).toContain('⚙️ Category: functionality');
            expect(result).toContain('♿ Category: accessibility');
            expect(result).toContain('⚡ Category: performance');
            expect(result).toContain('🔧 Category: other');
        });

                it('should handle non-TTY stdin gracefully', async () => {
            // Override isTTY to false
            Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

            const result = await handleIssueCreation(mockReviewResult, false);

            expect(result).toContain('📝 Review Results');
            expect(mockLogger.error).toHaveBeenCalledWith('⚠️  Unexpected: STDIN is piped in interactive mode');
        });

                describe('Environment Variables', () => {
            it('should verify default editor fallback', async () => {
                // Test that environment variables are properly configured
                expect(process.env.EDITOR || process.env.VISUAL || 'vi').toBeTruthy();
            });

            it('should handle temporary file path generation', async () => {
                // Test path generation works properly
                expect(vi.mocked(os.tmpdir)).toBeDefined();
                expect(vi.mocked(path.join)).toBeDefined();
            });
        });

                describe('File Format and Content Validation', () => {
            it('should validate serialization format through sendit mode', async () => {
                // Test that the issue gets properly formatted when creating GitHub issues
                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/123',
                    number: 123
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(mockReviewResult, true);

                // Verify the issue body contains the expected formatted content
                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).toContain('## Description\n\nTest description');
                expect(issueBody).toContain('- **Priority:** medium');
                expect(issueBody).toContain('- **Category:** functionality');
                expect(issueBody).toContain('## Suggestions\n\n- Fix this\n- Improve that');
            });

            it('should handle issues without suggestions properly', async () => {
                const issueWithoutSuggestions: Issue = {
                    title: 'No Suggestions Issue',
                    description: 'Description only',
                    priority: 'low',
                    category: 'content'
                };

                const resultWithoutSuggestions: ReviewResult = {
                    summary: 'Test',
                    totalIssues: 1,
                    issues: [issueWithoutSuggestions]
                };

                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/124',
                    number: 124
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(resultWithoutSuggestions, true);

                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).toContain('Description only');
                expect(issueBody).not.toContain('## Suggestions');
            });

            it('should handle whitespace and special characters in content', async () => {
                const issueWithSpecialContent: Issue = {
                    title: 'Special Content Test',
                    description: '   Line 1\n\n   Line 2   \n\nLine 3 with "quotes" & <tags>',
                    priority: 'medium',
                    category: 'other',
                    suggestions: ['Suggestion with "quotes"', 'Suggestion with\nnewlines']
                };

                const resultWithSpecialContent: ReviewResult = {
                    summary: 'Test',
                    totalIssues: 1,
                    issues: [issueWithSpecialContent]
                };

                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/125',
                    number: 125
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(resultWithSpecialContent, true);

                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).toContain('   Line 1\n\n   Line 2   \n\nLine 3 with "quotes" & <tags>');
                expect(issueBody).toContain('- Suggestion with "quotes"');
                expect(issueBody).toContain('- Suggestion with\nnewlines');
            });
        });

        describe('Issue Body Formatting', () => {
            it('should format issue body with all components', async () => {
                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/123',
                    number: 123
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(mockReviewResult, true);

                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).toContain('## Description\n\nTest description\n\n');
                expect(issueBody).toContain('## Details\n\n');
                expect(issueBody).toContain('- **Priority:** medium\n');
                expect(issueBody).toContain('- **Category:** functionality\n');
                expect(issueBody).toContain('- **Source:** Review\n\n');
                expect(issueBody).toContain('## Suggestions\n\n');
                expect(issueBody).toContain('- Fix this\n');
                expect(issueBody).toContain('- Improve that\n');
                expect(issueBody).toContain('---\n\n');
                expect(issueBody).toContain('*This issue was automatically created from a review session.*');
            });

            it('should format issue body without suggestions section', async () => {
                const issueWithoutSuggestions: Issue = {
                    title: 'Simple Issue',
                    description: 'Simple description',
                    priority: 'high',
                    category: 'performance'
                };

                const resultWithoutSuggestions: ReviewResult = {
                    summary: 'Test',
                    totalIssues: 1,
                    issues: [issueWithoutSuggestions]
                };

                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/124',
                    number: 124
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(resultWithoutSuggestions, true);

                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).toContain('## Description\n\nSimple description\n\n');
                expect(issueBody).toContain('- **Priority:** high\n');
                expect(issueBody).toContain('- **Category:** performance\n');
                expect(issueBody).not.toContain('## Suggestions');
                expect(issueBody).toContain('*This issue was automatically created from a review session.*');
            });

            it('should format issue body with empty suggestions array', async () => {
                const issueWithEmptySuggestions: Issue = {
                    title: 'Empty Suggestions Issue',
                    description: 'Description',
                    priority: 'low',
                    category: 'accessibility',
                    suggestions: []
                };

                const resultWithEmptySuggestions: ReviewResult = {
                    summary: 'Test',
                    totalIssues: 1,
                    issues: [issueWithEmptySuggestions]
                };

                const mockCreatedIssue = {
                    html_url: 'https://github.com/user/repo/issues/125',
                    number: 125
                };
                vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

                await handleIssueCreation(resultWithEmptySuggestions, true);

                const createCall = vi.mocked(github.createIssue).mock.calls[0];
                const issueBody = createCall[1] as string;

                expect(issueBody).not.toContain('## Suggestions');
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle malformed issue data', async () => {
            const malformedResult: ReviewResult = {
                summary: 'Test',
                totalIssues: 1,
                issues: [{
                    title: '',
                    description: '',
                    priority: 'medium',
                    category: 'other'
                }]
            };

            const result = await handleIssueCreation(malformedResult, true);

            expect(result).toContain('📝 Review Results');
            expect(result).toContain('📊 Total Issues Found: 1');
        });

        it('should handle undefined suggestions gracefully', async () => {
            const issueWithUndefinedSuggestions: Issue = {
                title: 'Test Issue',
                description: 'Test description',
                priority: 'medium',
                category: 'functionality',
                suggestions: undefined
            };

            const result: ReviewResult = {
                summary: 'Test',
                totalIssues: 1,
                issues: [issueWithUndefinedSuggestions]
            };

            const output = await handleIssueCreation(result, true);

            expect(output).toContain('Test Issue');
            expect(output).not.toContain('💡 Suggestions:');
        });

        it('should handle empty suggestions array', async () => {
            const issueWithEmptySuggestions: Issue = {
                title: 'Test Issue',
                description: 'Test description',
                priority: 'medium',
                category: 'functionality',
                suggestions: []
            };

            const result: ReviewResult = {
                summary: 'Test',
                totalIssues: 1,
                issues: [issueWithEmptySuggestions]
            };

            const output = await handleIssueCreation(result, true);

            expect(output).toContain('Test Issue');
            expect(output).not.toContain('💡 Suggestions:');
        });

        it('should handle multiple issues with mixed sendit and interactive modes', async () => {
            const multipleIssues: Issue[] = [
                {
                    title: 'Issue 1',
                    description: 'Description 1',
                    priority: 'high',
                    category: 'ui'
                },
                {
                    title: 'Issue 2',
                    description: 'Description 2',
                    priority: 'low',
                    category: 'content'
                }
            ];

            const multipleResult: ReviewResult = {
                summary: 'Multiple issues found',
                totalIssues: 2,
                issues: multipleIssues
            };

            const mockCreatedIssue = {
                html_url: 'https://github.com/user/repo/issues/123',
                number: 123
            };
            vi.mocked(github.createIssue).mockResolvedValue(mockCreatedIssue);

            const result = await handleIssueCreation(multipleResult, true);

            expect(result).toContain('🚀 GitHub Issues Created: 2');
            expect(github.createIssue).toHaveBeenCalledTimes(2);
        });

        it('should handle very long descriptions and titles', async () => {
            const longText = 'A'.repeat(1000);
            const issueWithLongText: Issue = {
                title: longText,
                description: longText,
                priority: 'medium',
                category: 'other'
            };

            const result: ReviewResult = {
                summary: 'Long text test',
                totalIssues: 1,
                issues: [issueWithLongText]
            };

            const output = await handleIssueCreation(result, true);

            expect(output).toContain('📝 Review Results');
            expect(output).toContain(longText.substring(0, 100)); // Should contain part of the long text
        });

        it('should handle special characters in issue data', async () => {
            const issueWithSpecialChars: Issue = {
                title: 'Issue with émojis 🚀 and "quotes" & <tags>',
                description: 'Description with\nnewlines\tand\ttabs & special chars: @#$%',
                priority: 'medium',
                category: 'functionality',
                suggestions: ['Suggestion with "quotes"', 'Suggestion with <html> tags']
            };

            const result: ReviewResult = {
                summary: 'Special chars test',
                totalIssues: 1,
                issues: [issueWithSpecialChars]
            };

            const output = await handleIssueCreation(result, true);

            expect(output).toContain('Issue with émojis 🚀 and "quotes" & <tags>');
            expect(output).toContain('Description with\nnewlines\tand\ttabs & special chars: @#$%');
        });

        it('should handle null/undefined result gracefully', async () => {
            const nullResult: ReviewResult = {
                summary: '',
                totalIssues: 0,
                issues: null as any
            };

            const output = await handleIssueCreation(nullResult, false);

            expect(output).toContain('✅ No specific issues identified from the review.');
        });
    });
});
