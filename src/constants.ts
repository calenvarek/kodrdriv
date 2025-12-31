import { MergeMethod } from './types';
import os from 'os';
import path from 'path';

export const VERSION = '__VERSION__ (__GIT_BRANCH__/__GIT_COMMIT__ __GIT_TAGS__ __GIT_COMMIT_DATE__) __SYSTEM_INFO__';
export const PROGRAM_NAME = 'kodrdriv';
export const DEFAULT_CHARACTER_ENCODING = 'utf-8';
export const DEFAULT_BINARY_TO_TEXT_ENCODING = 'base64';
export const DEFAULT_DIFF = true;
export const DEFAULT_LOG = false;
export const DEFAULT_OVERRIDES = false;
export const DATE_FORMAT_MONTH_DAY = 'MM-DD';
export const DATE_FORMAT_YEAR = 'YYYY';
export const DATE_FORMAT_YEAR_MONTH = 'YYYY-MM';
export const DATE_FORMAT_YEAR_MONTH_DAY = 'YYYY-MM-DD';
export const DATE_FORMAT_YEAR_MONTH_DAY_SLASH = 'YYYY/MM/DD';
export const DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES = 'YYYY-MM-DD-HHmm';
export const DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS = 'YYYY-MM-DD-HHmmss';
export const DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS = 'YYYY-MM-DD-HHmmss.SSS';
export const DATE_FORMAT_SHORT_TIMESTAMP = 'YYMMdd-HHmm';
export const DATE_FORMAT_MONTH = 'MM';
export const DATE_FORMAT_DAY = 'DD';
export const DATE_FORMAT_HOURS = 'HHmm';
export const DATE_FORMAT_MINUTES = 'mm';
export const DATE_FORMAT_SECONDS = 'ss';
export const DATE_FORMAT_MILLISECONDS = 'SSS';
export const DEFAULT_VERBOSE = false;
export const DEFAULT_DRY_RUN = false;
export const DEFAULT_DEBUG = false;
export const DEFAULT_MODEL = 'gpt-4o-mini';
export const DEFAULT_MODEL_STRONG = 'gpt-4o';
export const DEFAULT_OPENAI_REASONING = 'low';
export const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 10000;
export const DEFAULT_OUTPUT_DIRECTORY = 'output/kodrdriv';

// Buffer size for git commands that may produce large output (like git log)
export const DEFAULT_GIT_COMMAND_MAX_BUFFER = 50 * 1024 * 1024; // 50MB

export const DEFAULT_CONTEXT_DIRECTORIES: string[] = [];

export const DEFAULT_CONFIG_DIR = '.kodrdriv';
export const DEFAULT_PREFERENCES_DIRECTORY = path.join(os.homedir(), '.kodrdriv');

export const DEFAULT_FROM_COMMIT_ALIAS = 'main';
export const DEFAULT_TO_COMMIT_ALIAS = 'HEAD';

export const DEFAULT_ADD = false;
export const DEFAULT_CACHED = false;
export const DEFAULT_SENDIT_MODE = false;
export const DEFAULT_INTERACTIVE_MODE = false;
export const DEFAULT_AMEND_MODE = false;
// CRITICAL: Keep this low (3-5) to prevent log context contamination.
// The LLM tends to pattern-match against recent commits instead of describing
// the actual diff when it sees too much commit history. Set to 0 to disable.
export const DEFAULT_MESSAGE_LIMIT = 3;
export const DEFAULT_MAX_DIFF_BYTES = 20480; // 20KB limit per file

export const DEFAULT_MERGE_METHOD: MergeMethod = 'squash';

export const DEFAULT_EXCLUDED_PATTERNS = [
    'node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb',
    'composer.lock', 'Cargo.lock', 'Gemfile.lock',
    'dist', 'build', 'out', '.next', '.nuxt', 'coverage',
    '.vscode', '.idea', '.DS_Store', '.git', '.gitignore',
    'logs', 'tmp', '.cache', '*.log', '.env', '.env.*',
    '*.pem', '*.crt', '*.key', '*.sqlite', '*.db',
    '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'
];

export const COMMAND_COMMIT = 'commit';
export const COMMAND_AUDIO_COMMIT = 'audio-commit';
export const COMMAND_SELECT_AUDIO = 'select-audio';
export const COMMAND_RELEASE = 'release';
export const COMMAND_REVIEW = 'review';
export const COMMAND_AUDIO_REVIEW = 'audio-review';
export const COMMAND_PUBLISH = 'publish';
export const COMMAND_TREE = 'tree';
export const COMMAND_LINK = 'link';
export const COMMAND_UNLINK = 'unlink';
export const COMMAND_CLEAN = 'clean';
export const COMMAND_PRECOMMIT = 'precommit';
export const COMMAND_DEVELOPMENT = 'development';
export const COMMAND_VERSIONS = 'versions';
export const COMMAND_UPDATES = 'updates';
export const COMMAND_CHECK_CONFIG = 'check-config';
export const COMMAND_INIT_CONFIG = 'init-config';

export const ALLOWED_COMMANDS = [
    COMMAND_COMMIT,
    COMMAND_AUDIO_COMMIT,
    COMMAND_SELECT_AUDIO,
    COMMAND_RELEASE,
    COMMAND_REVIEW,
    COMMAND_AUDIO_REVIEW,
    COMMAND_PUBLISH,
    COMMAND_TREE,
    COMMAND_LINK,
    COMMAND_UNLINK,
    COMMAND_CLEAN,
    COMMAND_PRECOMMIT,
    COMMAND_DEVELOPMENT,
    COMMAND_VERSIONS,
    COMMAND_UPDATES
];

export const DEFAULT_COMMAND = COMMAND_COMMIT;

export const DEFAULT_INSTRUCTIONS_DIR = `instructions`;

export const DEFAULT_PERSONA_DIR = `personas`;

export const DEFAULT_INSTRUCTIONS_COMMIT_FILE = `${DEFAULT_INSTRUCTIONS_DIR}/commit.md`;
export const DEFAULT_INSTRUCTIONS_RELEASE_FILE = `${DEFAULT_INSTRUCTIONS_DIR}/release.md`;
export const DEFAULT_INSTRUCTIONS_REVIEW_FILE = `${DEFAULT_INSTRUCTIONS_DIR}/review.md`;

export const DEFAULT_PERSONA_RELEASER_FILE = `${DEFAULT_PERSONA_DIR}/releaser.md`;
export const DEFAULT_PERSONA_YOU_FILE = `${DEFAULT_PERSONA_DIR}/you.md`;

// Default instructions for each persona
export const DEFAULT_INSTRUCTIONS_MAP = {
    [COMMAND_COMMIT]: DEFAULT_INSTRUCTIONS_COMMIT_FILE,
    [COMMAND_AUDIO_COMMIT]: DEFAULT_INSTRUCTIONS_COMMIT_FILE, // Reuse commit instructions
    [COMMAND_RELEASE]: DEFAULT_INSTRUCTIONS_RELEASE_FILE,
    [COMMAND_REVIEW]: DEFAULT_INSTRUCTIONS_REVIEW_FILE, // Reuse audio-review instructions for now
    [COMMAND_AUDIO_REVIEW]: DEFAULT_INSTRUCTIONS_REVIEW_FILE,
};

// Default personas for each command
export const DEFAULT_PERSONA_MAP = {
    [COMMAND_COMMIT]: DEFAULT_PERSONA_YOU_FILE,
    [COMMAND_AUDIO_COMMIT]: DEFAULT_PERSONA_YOU_FILE, // Use You persona
    [COMMAND_RELEASE]: DEFAULT_PERSONA_RELEASER_FILE,
    [COMMAND_REVIEW]: DEFAULT_PERSONA_YOU_FILE, // Use You persona
    [COMMAND_AUDIO_REVIEW]: DEFAULT_PERSONA_YOU_FILE,
};

// Used by child process to create paths
export const DEFAULT_PATH_SEPARATOR = '/';

// Used by util/general for file filtering
export const DEFAULT_IGNORE_PATTERNS = [
    'node_modules/**',
    '**/*.log',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'output/**',
    '.DS_Store',
    '*.tmp',
    '*.cache',
    '**/.kodrdriv-*.json', // Internal kodrdriv cache and state files
];

// Used by util/storage for directory names
export const DEFAULT_DIRECTORY_PREFIX = '.kodrdriv';

// Used by other commands but not exposed in CLI
export const INTERNAL_DEFAULT_OUTPUT_FILE = 'output.txt';

export const INTERNAL_DATETIME_FORMAT = 'YYYY-MM-DD_HH-mm-ss';

// Define defaults in one place
export const KODRDRIV_DEFAULTS = {
    dryRun: DEFAULT_DRY_RUN,
    verbose: DEFAULT_VERBOSE,
    debug: DEFAULT_DEBUG,
    overrides: DEFAULT_OVERRIDES,
    model: DEFAULT_MODEL,
    openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
    openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    contextDirectories: DEFAULT_CONTEXT_DIRECTORIES,
    commandName: DEFAULT_COMMAND,
    configDirectory: DEFAULT_CONFIG_DIR,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    preferencesDirectory: DEFAULT_PREFERENCES_DIRECTORY,
    commit: {
        add: DEFAULT_ADD,
        cached: DEFAULT_CACHED,
        sendit: DEFAULT_SENDIT_MODE,
        interactive: DEFAULT_INTERACTIVE_MODE,
        amend: DEFAULT_AMEND_MODE,
        messageLimit: DEFAULT_MESSAGE_LIMIT,
        skipFileCheck: false,
        maxDiffBytes: DEFAULT_MAX_DIFF_BYTES,
        contextFiles: undefined,
        openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
        openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    },
    release: {
        from: DEFAULT_FROM_COMMIT_ALIAS,
        to: DEFAULT_TO_COMMIT_ALIAS,
        messageLimit: DEFAULT_MESSAGE_LIMIT,
        interactive: DEFAULT_INTERACTIVE_MODE,
        maxDiffBytes: DEFAULT_MAX_DIFF_BYTES,
        contextFiles: undefined,
        noMilestones: false,
        openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
        openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    },
    audioCommit: {
        maxRecordingTime: 300, // 5 minutes default
        audioDevice: undefined, // Auto-detect by default
        openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
        openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    },
    review: {
        includeCommitHistory: true,
        includeRecentDiffs: true,
        includeReleaseNotes: false,
        includeGithubIssues: true,
        commitHistoryLimit: 10,
        diffHistoryLimit: 5,
        releaseNotesLimit: 3,
        githubIssuesLimit: 20,
        sendit: DEFAULT_SENDIT_MODE,
        openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
        openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    },
    audioReview: {
        includeCommitHistory: true,
        includeRecentDiffs: true,
        includeReleaseNotes: false,
        includeGithubIssues: true,
        commitHistoryLimit: 10,
        diffHistoryLimit: 5,
        releaseNotesLimit: 3,
        githubIssuesLimit: 20,
        sendit: DEFAULT_SENDIT_MODE,
        maxRecordingTime: 300, // 5 minutes default
        audioDevice: undefined, // Auto-detect by default
        directory: undefined, // No default directory
        openaiReasoning: DEFAULT_OPENAI_REASONING as 'low' | 'medium' | 'high',
        openaiMaxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    },
    publish: {
        mergeMethod: DEFAULT_MERGE_METHOD,
        from: DEFAULT_FROM_COMMIT_ALIAS,
        targetVersion: 'patch',
        interactive: DEFAULT_INTERACTIVE_MODE,
        requiredEnvVars: ['GITHUB_TOKEN', 'OPENAI_API_KEY'],
        linkWorkspacePackages: true,
        unlinkWorkspacePackages: true,
        sendit: DEFAULT_SENDIT_MODE,
        targetBranch: 'main',
        noMilestones: false,
        checksTimeout: 3600000, // 1 hour default for PR checks
        releaseWorkflowsTimeout: 1800000, // 30 minutes default for release workflows
    },
    link: {
        scopeRoots: {},
        dryRun: false,
        packageArgument: undefined,
        externals: [],
    },
    unlink: {
        scopeRoots: {},
        workspaceFile: undefined,
        dryRun: false,
        cleanNodeModules: false,
        packageArgument: undefined,
        externals: [],
    },
    tree: {
        directories: undefined,
        exclude: undefined,
        startFrom: undefined,
        stopAt: undefined,
        cmd: undefined,

        builtInCommand: undefined,
        continue: false,
        packageArgument: undefined,
        cleanNodeModules: false,
        externals: [],
    },
    development: {
        targetVersion: 'patch',
        noMilestones: false,
    },
    versions: {
        subcommand: undefined,
        directories: undefined,
    },
    updates: {
        scope: undefined,
        directories: undefined,
    },
    excludedPatterns: DEFAULT_EXCLUDED_PATTERNS,
    branches: {
        working: {
            targetBranch: 'main',
            developmentBranch: true,
            version: {
                type: 'prerelease' as const,
                increment: true,
                incrementLevel: 'patch' as const,
                tag: 'dev'
            }
        },
        main: {
            version: {
                type: 'release' as const
            }
        }
    }
};
