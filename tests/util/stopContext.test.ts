import { describe, it, expect, beforeEach, vi } from 'vitest';
import { filterContent, isStopContextEnabled } from '../../src/util/stopContext';
import { StopContextConfig } from '../../src/types';
import * as logging from '../../src/logging';

// Create mock logger functions
const mockWarn = vi.fn();
const mockVerbose = vi.fn();

// Mock the logger
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        warn: mockWarn,
        verbose: mockVerbose,
        level: 'info',
    }),
}));

describe('stopContext', () => {
    beforeEach(() => {
        mockWarn.mockClear();
        mockVerbose.mockClear();
    });

    describe('filterContent', () => {
        it('should return original text when config is undefined', () => {
            const text = 'This is a test message';
            const result = filterContent(text, undefined);

            expect(result.filtered).toBe(text);
            expect(result.matchCount).toBe(0);
            expect(result.originalLength).toBe(text.length);
            expect(result.filteredLength).toBe(text.length);
        });

        it('should return original text when filtering is disabled', () => {
            const text = 'This is a test message';
            const config: StopContextConfig = {
                enabled: false,
                strings: ['test'],
            };
            const result = filterContent(text, config);

            expect(result.filtered).toBe(text);
            expect(result.matchCount).toBe(0);
        });

        it('should return original text when no filters are configured', () => {
            const text = 'This is a test message';
            const config: StopContextConfig = {
                enabled: true,
                strings: [],
                patterns: [],
            };
            const result = filterContent(text, config);

            expect(result.filtered).toBe(text);
            expect(result.matchCount).toBe(0);
        });

        describe('literal string filtering', () => {
            it('should filter a single string (case insensitive by default)', () => {
                const text = 'This is a SECRET message';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('This is a [REDACTED] message');
                expect(result.matchCount).toBe(1);
                expect(result.matches[0].type).toBe('string');
                expect(result.matches[0].matched).toBe('SECRET');
            });

            it('should filter multiple occurrences of the same string', () => {
                const text = 'Secret message with secret data and SECRET info';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('[REDACTED] message with [REDACTED] data and [REDACTED] info');
                expect(result.matchCount).toBe(3);
            });

            it('should filter multiple different strings', () => {
                const text = 'Project Alpha in repository Beta';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['Alpha', 'Beta'],
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Project [REDACTED] in repository [REDACTED]');
                expect(result.matchCount).toBe(2);
            });

            it('should respect case sensitivity when enabled', () => {
                const text = 'Secret message with SECRET data';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['SECRET'],
                    caseSensitive: true,
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Secret message with [REDACTED] data');
                expect(result.matchCount).toBe(1);
            });

            it('should use default replacement when not specified', () => {
                const text = 'This is a SECRET message';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('This is a [REDACTED] message');
            });

            it('should handle special regex characters in strings', () => {
                const text = 'Price is $100.50';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['$100.50'],
                    replacement: '[AMOUNT]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Price is [AMOUNT]');
                expect(result.matchCount).toBe(1);
            });
        });

        describe('regex pattern filtering', () => {
            it('should filter using a regex pattern', () => {
                const text = 'User john.doe@example.com sent email';
                const config: StopContextConfig = {
                    enabled: true,
                    patterns: [
                        {
                            regex: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
                            flags: 'g',
                        },
                    ],
                    replacement: '[EMAIL]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('User [EMAIL] sent email');
                expect(result.matchCount).toBe(1);
                expect(result.matches[0].type).toBe('pattern');
            });

            it('should filter multiple pattern matches', () => {
                const text = 'Contact user-123 or admin-456 for help';
                const config: StopContextConfig = {
                    enabled: true,
                    patterns: [
                        {
                            regex: '\\b\\w+-\\d+\\b',
                            flags: 'g',
                        },
                    ],
                    replacement: '[USER]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Contact [USER] or [USER] for help');
                expect(result.matchCount).toBe(2);
            });

            it('should apply pattern flags correctly', () => {
                const text = 'Project-A and project-b are different';
                const config: StopContextConfig = {
                    enabled: true,
                    patterns: [
                        {
                            regex: 'project-[ab]',
                            flags: 'gi', // case insensitive + global
                        },
                    ],
                    replacement: '[PROJECT]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('[PROJECT] and [PROJECT] are different');
                expect(result.matchCount).toBe(2);
            });

            it('should handle invalid regex patterns gracefully', () => {
                const text = 'This is a test message';
                const config: StopContextConfig = {
                    enabled: true,
                    patterns: [
                        {
                            regex: '[invalid(regex',
                            flags: 'g',
                        },
                    ],
                };
                const result = filterContent(text, config);

                // Should return original text and log warning
                expect(result.filtered).toBe(text);
                expect(result.matchCount).toBe(0);
            });
        });

        describe('combined filtering', () => {
            it('should apply both string and pattern filters', () => {
                const text = 'Project Alpha (user-123) in repository Beta';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['Alpha', 'Beta'],
                    patterns: [
                        {
                            regex: '\\buser-\\d+\\b',
                            flags: 'g',
                        },
                    ],
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Project [REDACTED] ([REDACTED]) in repository [REDACTED]');
                expect(result.matchCount).toBe(3);
            });

            it('should filter strings and patterns independently', () => {
                const text = 'Secret info for user-123';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['Secret'],
                    patterns: [
                        {
                            regex: 'user-\\d+',
                            flags: 'g',
                        },
                    ],
                    replacement: '[X]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('[X] info for [X]');
                expect(result.matchCount).toBe(2);
                expect(result.matches.some(m => m.type === 'string')).toBe(true);
                expect(result.matches.some(m => m.type === 'pattern')).toBe(true);
            });
        });

        describe('warnings and logging', () => {
            it('should warn when filters are applied (warnOnFilter default)', () => {
                const text = 'This is a SECRET message';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                };

                filterContent(text, config);

                expect(mockWarn).toHaveBeenCalledWith(
                    expect.stringContaining('STOP_CONTEXT_FILTERED')
                );
            });

            it('should not warn when warnOnFilter is false', () => {
                const text = 'This is a SECRET message';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                    warnOnFilter: false,
                };

                filterContent(text, config);

                expect(mockWarn).not.toHaveBeenCalled();
            });

            it('should warn when high percentage of content is filtered', () => {
                const text = 'SECRET SECRET SECRET okay';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['SECRET'],
                    replacement: 'X',
                };

                const result = filterContent(text, config);

                // Should warn about high filter percentage (>50%)
                expect(mockWarn).toHaveBeenCalledWith(
                    expect.stringContaining('STOP_CONTEXT_HIGH_FILTER')
                );
            });
        });

        describe('edge cases', () => {
            it('should handle empty text', () => {
                const text = '';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('');
                expect(result.matchCount).toBe(0);
            });

            it('should handle text with no matches', () => {
                const text = 'This is a normal message';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['secret'],
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe(text);
                expect(result.matchCount).toBe(0);
            });

            it('should handle overlapping patterns correctly', () => {
                const text = 'abcabc';
                const config: StopContextConfig = {
                    enabled: true,
                    patterns: [
                        {
                            regex: 'abc',
                            flags: 'g',
                        },
                    ],
                    replacement: 'X',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('XX');
                expect(result.matchCount).toBe(2);
            });

            it('should handle unicode characters', () => {
                const text = 'Project 🔥 Alpha 🚀';
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['Alpha'],
                    replacement: '[REDACTED]',
                };
                const result = filterContent(text, config);

                expect(result.filtered).toBe('Project 🔥 [REDACTED] 🚀');
                expect(result.matchCount).toBe(1);
            });

            it('should handle very long strings efficiently', () => {
                const longText = 'normal '.repeat(1000) + 'SECRET ' + 'normal '.repeat(1000);
                const config: StopContextConfig = {
                    enabled: true,
                    strings: ['SECRET'],
                    replacement: '[X]',
                };
                const result = filterContent(longText, config);

                expect(result.matchCount).toBe(1);
                expect(result.filtered).toContain('[X]');
                expect(result.filtered).not.toContain('SECRET');
            });
        });
    });

    describe('isStopContextEnabled', () => {
        it('should return false when config is undefined', () => {
            expect(isStopContextEnabled(undefined)).toBe(false);
        });

        it('should return false when explicitly disabled', () => {
            const config: StopContextConfig = {
                enabled: false,
                strings: ['test'],
            };
            expect(isStopContextEnabled(config)).toBe(false);
        });

        it('should return false when no filters are configured', () => {
            const config: StopContextConfig = {
                enabled: true,
                strings: [],
                patterns: [],
            };
            expect(isStopContextEnabled(config)).toBe(false);
        });

        it('should return true when strings are configured', () => {
            const config: StopContextConfig = {
                enabled: true,
                strings: ['test'],
            };
            expect(isStopContextEnabled(config)).toBe(true);
        });

        it('should return true when patterns are configured', () => {
            const config: StopContextConfig = {
                enabled: true,
                patterns: [{ regex: 'test', flags: 'g' }],
            };
            expect(isStopContextEnabled(config)).toBe(true);
        });

        it('should return true when enabled is not explicitly set but filters exist', () => {
            const config: StopContextConfig = {
                strings: ['test'],
            };
            expect(isStopContextEnabled(config)).toBe(true);
        });
    });
});

