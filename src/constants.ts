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
export const DEFAULT_CONTEXT_DIRECTORIES: string[] = [];

export const COMMAND_COMMIT = 'commit';
export const COMMAND_RELEASE = 'release';
export const COMMAND_PUBLISH = 'publish';
export const ALLOWED_COMMANDS = [COMMAND_COMMIT, COMMAND_RELEASE, COMMAND_PUBLISH];
export const DEFAULT_COMMAND = COMMAND_COMMIT;

export const DEFAULT_CONFIG_DIR = `.${PROGRAM_NAME}`;

export const DEFAULT_PERSONAS_DIR = `/personas`;

export const DEFAULT_PERSONA_COMMITTER_FILE = `${DEFAULT_PERSONAS_DIR}/committer.md`;
export const DEFAULT_PERSONA_RELEASER_FILE = `${DEFAULT_PERSONAS_DIR}/releaser.md`;

export const DEFAULT_INSTRUCTIONS_DIR = `/instructions`;

export const DEFAULT_INSTRUCTIONS_COMMIT_FILE = `${DEFAULT_INSTRUCTIONS_DIR}/commit.md`;
export const DEFAULT_INSTRUCTIONS_RELEASE_FILE = `${DEFAULT_INSTRUCTIONS_DIR}/release.md`;

export const DEFAULT_CACHED = false;

export const DEFAULT_ADD = false;

export const DEFAULT_SENDIT_MODE = false;

export const DEFAULT_FROM_COMMIT_ALIAS = 'main';
export const DEFAULT_TO_COMMIT_ALIAS = 'HEAD';
export const DEFAULT_VERSION = '1.0.0';
export const DEFAULT_MESSAGE_LIMIT = 10;
export const DEFAULT_MERGE_METHOD = 'squash' as const;

export const DEFAULT_EXCLUDED_PATTERNS: string[] = [
    // Node modules & dependency files
    "node_modules",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "bun.lockb",
    "composer.lock",
    "Cargo.lock",
    "Gemfile.lock",

    // Build output
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "coverage",

    // IDE & OS files
    ".vscode",
    ".idea",
    ".DS_Store",

    // Version control
    ".git",
    ".gitignore",

    // Logs, caches, and temp
    "logs",
    "tmp",
    ".cache",
    "*.log",

    // Sensitive data
    ".env",
    ".env.*",
    "*.pem",
    "*.crt",
    "*.key",

    // Binary and database files
    "*.sqlite",
    "*.db",
    "*.zip",
    "*.tar",
    "*.gz",
    "*.exe",
    "*.bin",
];

// Define defaults in one place
export const KODRDRIV_DEFAULTS = {
    dryRun: DEFAULT_DRY_RUN,
    verbose: DEFAULT_VERBOSE,
    debug: DEFAULT_DEBUG,
    overrides: DEFAULT_OVERRIDES,
    model: DEFAULT_MODEL,
    instructions: DEFAULT_INSTRUCTIONS_DIR,
    contextDirectories: DEFAULT_CONTEXT_DIRECTORIES,
    commandName: DEFAULT_COMMAND,
    configDirectory: DEFAULT_CONFIG_DIR,
    commit: {
        add: DEFAULT_ADD,
        cached: DEFAULT_CACHED,
        sendit: DEFAULT_SENDIT_MODE,
        messageLimit: DEFAULT_MESSAGE_LIMIT,
    },
    release: {
        from: DEFAULT_FROM_COMMIT_ALIAS,
        to: DEFAULT_TO_COMMIT_ALIAS,
        messageLimit: DEFAULT_MESSAGE_LIMIT,
    },
    publish: {
        mergeMethod: DEFAULT_MERGE_METHOD,
    },
    excludedPatterns: DEFAULT_EXCLUDED_PATTERNS,
};