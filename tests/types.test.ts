import { describe, it, expect } from 'vitest';
import {
    ConfigSchema,
    SecureConfigSchema,
    CommandConfigSchema,
    type Config,
    type SecureConfig,
    type CommandConfig,
    type MergeMethod,
    type PullRequest,
    type ReleaseSummary,
    type ReleaseConfig,
    type ReviewConfig,
    type AudioReviewConfig,
    type AudioCommitConfig,
    type PublishConfig
} from '../src/types';

describe('ConfigSchema', () => {
    it('should validate empty config', () => {
        const result = ConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('should validate basic config with all optional fields', () => {
        const validConfig = {
            dryRun: true,
            verbose: false,
            debug: true,
            overrides: false,
            model: 'gpt-4',
            contextDirectories: ['src', 'tests'],
            outputDirectory: './output',
            preferencesDirectory: './preferences',
            excludedPatterns: ['*.log', 'node_modules']
        };

        const result = ConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(validConfig);
        }
    });

    it('should validate commit config', () => {
        const config = {
            commit: {
                add: true,
                cached: false,
                sendit: true,
                messageLimit: 100,
                context: 'feature',
                direction: 'forward'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate commit config with model', () => {
        const config = {
            commit: {
                add: true,
                model: 'gpt-4o'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.commit?.model).toBe('gpt-4o');
        }
    });

    it('should validate audioCommit config', () => {
        const config = {
            audioCommit: {
                maxRecordingTime: 60,
                audioDevice: 'default',
                file: 'recording.wav',
                keepTemp: true
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate release config', () => {
        const config = {
            release: {
                from: 'v1.0.0',
                to: 'v2.0.0',
                messageLimit: 50,
                context: 'major release',
                focus: 'breaking changes'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate release config with model', () => {
        const config = {
            release: {
                from: 'v1.0.0',
                to: 'v2.0.0',
                model: 'gpt-4-turbo'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.release?.model).toBe('gpt-4-turbo');
        }
    });

    it('should validate review config', () => {
        const config = {
            review: {
                includeCommitHistory: true,
                includeRecentDiffs: false,
                includeReleaseNotes: true,
                includeGithubIssues: false,
                commitHistoryLimit: 20,
                diffHistoryLimit: 10,
                releaseNotesLimit: 5,
                githubIssuesLimit: 15,
                context: 'code review',
                sendit: false,
                note: 'Additional review notes'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate review config with model', () => {
        const config = {
            review: {
                includeCommitHistory: true,
                model: 'gpt-3.5-turbo'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.review?.model).toBe('gpt-3.5-turbo');
        }
    });

    it('should validate audioReview config', () => {
        const config = {
            audioReview: {
                includeCommitHistory: true,
                includeRecentDiffs: true,
                includeReleaseNotes: false,
                includeGithubIssues: true,
                commitHistoryLimit: 25,
                diffHistoryLimit: 15,
                releaseNotesLimit: 8,
                githubIssuesLimit: 12,
                context: 'audio review',
                sendit: true,
                maxRecordingTime: 120,
                audioDevice: 'mic1',
                file: 'review.mp3',
                directory: './audio',
                keepTemp: false
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate publish config', () => {
        const config = {
            publish: {
                mergeMethod: 'squash' as MergeMethod,
                dependencyUpdatePatterns: ['@scope/*', 'react*'],
                requiredEnvVars: ['NODE_ENV', 'API_KEY'],
                targetBranch: 'main'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should validate link config', () => {
        const config = {
            link: {
                scopeRoots: {
                    '@myorg': '/path/to/packages',
                    '@utils': '/path/to/utils'
                },

                dryRun: true
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should reject invalid merge method', () => {
        const config = {
            publish: {
                mergeMethod: 'invalid-method'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });

    it('should reject invalid types', () => {
        const config = {
            dryRun: 'not-a-boolean',
            verbose: 123,
            contextDirectories: 'not-an-array',
            excludedPatterns: [123, 456]
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });

    it('should reject invalid nested config types', () => {
        const config = {
            commit: {
                add: 'not-a-boolean',
                messageLimit: 'not-a-number'
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });
});

describe('SecureConfigSchema', () => {
    it('should validate empty secure config', () => {
        const result = SecureConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('should validate secure config with API key', () => {
        const config = {
            openaiApiKey: 'sk-1234567890abcdef'
        };

        const result = SecureConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.openaiApiKey).toBe('sk-1234567890abcdef');
        }
    });

    it('should reject invalid API key type', () => {
        const config = {
            openaiApiKey: 12345
        };

        const result = SecureConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });
});

describe('CommandConfigSchema', () => {
    it('should validate empty command config', () => {
        const result = CommandConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('should validate command config with command name', () => {
        const config = {
            commandName: 'commit'
        };

        const result = CommandConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.commandName).toBe('commit');
        }
    });

    it('should reject invalid command name type', () => {
        const config = {
            commandName: 123
        };

        const result = CommandConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });
});

describe('Type definitions', () => {
    it('should have correct MergeMethod type', () => {
        const validMethods: MergeMethod[] = ['merge', 'squash', 'rebase'];
        expect(validMethods).toHaveLength(3);
        expect(validMethods).toContain('merge');
        expect(validMethods).toContain('squash');
        expect(validMethods).toContain('rebase');
    });

    it('should have correct PullRequest interface structure', () => {
        const pr: PullRequest = {
            html_url: 'https://github.com/user/repo/pull/123',
            number: 123,
            labels: [
                { name: 'bug' },
                { name: 'enhancement' }
            ]
        };

        expect(pr.html_url).toBe('https://github.com/user/repo/pull/123');
        expect(pr.number).toBe(123);
        expect(pr.labels).toHaveLength(2);
        expect(pr.labels?.[0].name).toBe('bug');
    });

    it('should have correct ReleaseSummary interface structure', () => {
        const summary: ReleaseSummary = {
            title: 'Release v1.0.0',
            body: 'This release includes bug fixes and new features.'
        };

        expect(summary.title).toBe('Release v1.0.0');
        expect(summary.body).toBe('This release includes bug fixes and new features.');
    });

    it('should have correct ReleaseConfig type structure', () => {
        const config: ReleaseConfig = {
            from: 'v1.0.0',
            to: 'v2.0.0',
            context: 'major release',
            focus: 'breaking changes'
        };

        expect(config.from).toBe('v1.0.0');
        expect(config.to).toBe('v2.0.0');
        expect(config.context).toBe('major release');
        expect(config.focus).toBe('breaking changes');
    });

    it('should have correct ReviewConfig type structure', () => {
        const config: ReviewConfig = {
            includeCommitHistory: true,
            includeRecentDiffs: false,
            includeReleaseNotes: true,
            includeGithubIssues: false,
            commitHistoryLimit: 20,
            diffHistoryLimit: 10,
            releaseNotesLimit: 5,
            githubIssuesLimit: 15,
            context: 'code review',
            sendit: false,
            note: 'Additional notes'
        };

        expect(config.includeCommitHistory).toBe(true);
        expect(config.commitHistoryLimit).toBe(20);
        expect(config.context).toBe('code review');
        expect(config.note).toBe('Additional notes');
    });

    it('should have correct AudioReviewConfig type structure', () => {
        const config: AudioReviewConfig = {
            includeCommitHistory: true,
            maxRecordingTime: 120,
            audioDevice: 'default',
            file: 'review.mp3',
            directory: './audio',
            keepTemp: false
        };

        expect(config.includeCommitHistory).toBe(true);
        expect(config.maxRecordingTime).toBe(120);
        expect(config.audioDevice).toBe('default');
        expect(config.file).toBe('review.mp3');
        expect(config.directory).toBe('./audio');
        expect(config.keepTemp).toBe(false);
    });

    it('should have correct AudioCommitConfig type structure', () => {
        const config: AudioCommitConfig = {
            maxRecordingTime: 60,
            audioDevice: 'mic1',
            file: 'commit.wav',
            keepTemp: true
        };

        expect(config.maxRecordingTime).toBe(60);
        expect(config.audioDevice).toBe('mic1');
        expect(config.file).toBe('commit.wav');
        expect(config.keepTemp).toBe(true);
    });

    it('should have correct PublishConfig type structure', () => {
        const config: PublishConfig = {
            mergeMethod: 'merge',
            targetBranch: 'main'
        };

        expect(config.mergeMethod).toBe('merge');
        expect(config.targetBranch).toBe('main');
    });
});

describe('Type inference', () => {
    it('should infer Config type from ConfigSchema', () => {
        const config: Config = {
            dryRun: true,
            verbose: false,
            model: 'gpt-4',
            commit: {
                add: true,
                sendit: false
            },
            // Required properties from Cardigantime.Config
            configDirectory: '/path/to/config',
            discoveredConfigDirs: ['/path/to/config'],
            resolvedConfigDirs: ['/path/to/config']
        };

        // This test mainly ensures TypeScript compilation works correctly
        expect(config.dryRun).toBe(true);
        expect(config.verbose).toBe(false);
        expect(config.model).toBe('gpt-4');
        expect(config.commit?.add).toBe(true);
        expect(config.commit?.sendit).toBe(false);
    });

    it('should infer SecureConfig type from SecureConfigSchema', () => {
        const config: SecureConfig = {
            openaiApiKey: 'sk-test-key'
        };

        expect(config.openaiApiKey).toBe('sk-test-key');
    });

    it('should infer CommandConfig type from CommandConfigSchema', () => {
        const config: CommandConfig = {
            commandName: 'review'
        };

        expect(config.commandName).toBe('review');
    });
});

describe('Edge cases and boundary conditions', () => {
    it('should handle very large numbers', () => {
        const config = {
            commit: {
                messageLimit: Number.MAX_SAFE_INTEGER
            }
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should handle empty arrays', () => {
        const config = {
            contextDirectories: [],
            excludedPatterns: []
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should handle empty strings', () => {
        const config = {
            model: '',
            outputDirectory: '',
            preferencesDirectory: ''
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should handle nested empty objects', () => {
        const config = {
            commit: {},
            release: {},
            review: {},
            audioReview: {},
            audioCommit: {},
            publish: {},
            link: {}
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
    });

    it('should reject null values', () => {
        const config = {
            dryRun: null,
            verbose: null
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });

    it('should reject undefined in arrays', () => {
        const config = {
            contextDirectories: ['src', undefined, 'tests'],
            excludedPatterns: [undefined, '*.log']
        };

        const result = ConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
    });
});
