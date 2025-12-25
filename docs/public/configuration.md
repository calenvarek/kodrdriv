# Configuration

KodrDriv provides flexible configuration options through command-line arguments, configuration files, and environment variables. This section covers all available configuration methods and options.

## Getting Started with Configuration

### Initialize Configuration

To quickly get started with KodrDriv configuration, you can use the `--init-config` command to generate an initial configuration file with common default values:

```bash
kodrdriv --init-config
```

This command will:

1. Create a `.kodrdriv` directory in your current working directory (if it doesn't exist)
2. Generate a `config.yaml` file with sensible defaults based on your project structure
3. Include commonly used configuration options that you can customize

The generated configuration file will contain default settings for:
- AI model preferences
- Common command options
- Context directories for your project
- Basic exclude patterns

**Custom Configuration Directory:**

You can also specify a custom location for the configuration:

```bash
kodrdriv --init-config --config-dir ~/my-custom-kodrdriv-config
```

This is particularly useful if you want to:
- Create global configuration in your home directory
- Set up configuration for a specific environment
- Initialize configuration in a shared team location

> [!TIP]
> After running `--init-config`, review and customize the generated `config.yaml` file to match your project's specific needs. The generated file serves as a starting point that you can modify to fit your workflow.

## Configuration File

You can create a `config.yaml` file in your `.kodrdriv` directory to set default options for all commands. This allows you to avoid repeating command-line options and ensures consistent behavior across your project.

Example configuration file (`.kodrdriv/config.yaml`):

```yaml
model: gpt-4o-mini
verbose: true
contextDirectories:
  - src
  - docs
publish:
  mergeMethod: merge
  dependencyUpdatePatterns:
    - "@company/*"
    - "@myorg/*"
  requiredEnvVars:
    - NODE_AUTH_TOKEN
    - CUSTOM_TOKEN
  linkWorkspacePackages: true
  unlinkWorkspacePackages: true
commit:
  add: true
  sendit: true
  push: true  # Push to origin (default)
  messageLimit: 5
release:
  from: main
  to: HEAD
  messageLimit: 10
link:
  scopeRoots:
    "@company": "../"
    "@myorg": "../../org-packages/"
    "@tools": "../shared-tools/"
excludedPatterns:
  - node_modules
  - dist
  - "*.log"
```

### Commit Configuration Options

The `commit` section supports the following options:

```yaml
commit:
  add: true                    # Add all changes before committing (git add -A)
  sendit: true                 # Automatically commit without review
  push: true                   # Push to origin after commit (default)
  push: "upstream"             # Push to specific remote
  interactive: false           # Enable interactive mode (overrides sendit)
  amend: false                 # Amend last commit instead of creating new
  messageLimit: 5              # Number of recent commits to include in context
  context: "Project context"   # Additional context for commit messages
  direction: "Focus on..."     # High-priority guidance for commit messages
  skipFileCheck: false         # Skip file dependency safety checks
  maxDiffBytes: 2048           # Maximum bytes per file in diff analysis
```

**Push Configuration Examples:**

```yaml
# Push to origin (default)
commit:
  sendit: true
  push: true

# Push to specific remote
commit:
  sendit: true
  push: "upstream"

# No push (default behavior)
commit:
  sendit: true
  # push: not specified
```

Configuration options set in the file can be overridden by command-line arguments. The precedence order is:
1. Command-line arguments (highest priority)
2. Configuration file
3. Default values (lowest priority)

## Hierarchical Configuration

KodrDriv supports hierarchical configuration, which means it will automatically search for and merge configuration files from parent directories. This allows you to set global defaults at higher directory levels while still being able to override them for specific projects.

**How it works:**

1. **Directory Traversal**: Starting from your current working directory, KodrDriv searches upward through parent directories looking for `.kodrdriv/config.yaml` files.

2. **Automatic Merging**: Configuration files found in parent directories are merged together, with configurations closer to your current directory taking precedence over those higher up.

3. **Final Override**: Command-line arguments have the highest precedence and will override any configuration file settings.

**Example Hierarchy:**

```
/home/user/
├── .kodrdriv/
│   └── config.yaml          # Global user defaults
└── projects/
    ├── .kodrdriv/
    │   └── config.yaml      # Project-specific defaults
    └── my-app/
        ├── .kodrdriv/
        │   └── config.yaml  # App-specific overrides
        └── src/             # Your working directory
```

When running KodrDriv from `/home/user/projects/my-app/src/`, the configuration hierarchy would be:

1. **Base defaults** (built into KodrDriv)
2. **Global config** (`/home/user/.kodrdriv/config.yaml`)
3. **Project config** (`/home/user/projects/.kodrdriv/config.yaml`)
4. **App config** (`/home/user/projects/my-app/.kodrdriv/config.yaml`)
5. **Command-line arguments** (highest priority)

**Use Cases:**

- **Team Standards**: Store team-wide configuration defaults in your repository root
- **Personal Preferences**: Keep personal defaults in your home directory
- **Project-Specific Settings**: Override settings for specific projects or environments
- **Monorepo Management**: Different packages in a monorepo can have their own settings while inheriting common defaults

**Debugging Configuration:**

Use the `--check-config` flag to see exactly how your configuration is being merged:

```bash
kodrdriv --check-config
```

This will show you which configuration files are being loaded and how the final configuration values are determined.

## Configuration Directory

KodrDriv uses a configuration directory to store custom settings, instructions, and other configuration files. You can specify a custom location using the `--config-dir` option:

```bash
kodrdriv --config-dir ~/custom-kodrdriv-config
```

By default, the configuration directory is set to `.kodrdriv` in your current working directory. This directory is created automatically if it doesn't exist.

The configuration directory structure is as follows:

```
.kodrdriv/
├── instructions/
│   ├── commit.md         # Override for commit instructions
│   ├── commit-pre.md     # Content prepended to default commit instructions
│   ├── commit-post.md    # Content appended to default commit instructions
│   ├── release.md        # Override for release instructions
│   ├── release-pre.md    # Content prepended to default release instructions
│   └── release-post.md   # Content appended to default release instructions
├── config.yaml           # Main configuration file
└── ...                   # Other configuration files
```

## Environment Variables

### OpenAI Configuration

KodrDriv requires OpenAI API credentials for AI-powered features:

- `OPENAI_API_KEY`: OpenAI API key (required)

You can also set the model via command line or configuration file:

- `--model <model>`: OpenAI model to use (default: 'gpt-4o-mini')

### Model Configuration

KodrDriv supports both global and command-specific model settings:

**Global Model Configuration:**
```yaml
model: gpt-4o  # Used by all commands unless overridden
```

**Command-Specific Model Configuration:**
```yaml
model: gpt-4o-mini  # Global default

commit:
  model: gpt-4o     # Use GPT-4 for commit messages

release:
  model: gpt-4o     # Use GPT-4 for release notes

review:
  model: gpt-4o-mini  # Use cheaper model for reviews
```

**Model Selection Hierarchy (highest to lowest priority):**
1. Command-specific model setting (e.g., `commit.model`)
2. Global model setting (`model`)
3. Default model (`gpt-4o-mini`)

This allows you to use different models for different tasks - for example, using a more powerful model for important release notes while using a faster, cheaper model for routine commit messages.

> [!NOTE]
> ### Security Considerations
>
> The OpenAI API key should be handled securely and is only available via environment variables. KodrDriv automatically loads environment variables from a `.env` file in your current working directory.
>
> While environment variables are a common approach for configuration, they can still pose security risks if not properly managed. We strongly encourage users to utilize secure credential management solutions like 1Password, HashiCorp Vault, or other keystores to protect sensitive information. This helps prevent accidental exposure of API keys and other credentials in logs, process listings, or environment dumps.

### GitHub Configuration

For GitHub integration features:

- `GITHUB_TOKEN`: Required for GitHub API operations including:
  - **Publish command**: Creating pull requests, releases, and managing milestones
  - **Commit command**: Fetching recently closed issues for enhanced commit message context
  - **Release command**: Accessing milestone information and issue details

#### GitHub Issues Integration

The `GITHUB_TOKEN` enables the commit command to automatically fetch and analyze recently closed GitHub issues to provide better context for commit message generation. This feature:

- **Works automatically** when `GITHUB_TOKEN` is available
- **Fails gracefully** when the token is missing or API calls fail
- **Enhances large commits** by understanding which issues your changes address
- **Respects milestones** by prioritizing issues from your current release milestone

**Setting up GitHub Token:**

1. Create a Personal Access Token in GitHub with `repo` scope
2. Set it as an environment variable:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```
3. Or add it to your `.env` file:
   ```
   GITHUB_TOKEN=your_token_here
   ```

The token should have `repo` access to read issues, milestones, and repository information.

### Editor Configuration

For interactive workflows like review, commit interactive mode, release interactive mode, and issue editing:

- `EDITOR`: Your preferred text editor (optional, defaults to `vi`)
- `VISUAL`: Alternative editor variable (used as fallback if `EDITOR` is not set)

KodrDriv will use your configured editor to open temporary files during interactive workflows. Common examples:

**For vi/vim users:**
```bash
export EDITOR=vi
# Or for vim with specific options
export EDITOR="vim -c 'set textwidth=80'"
```

**For emacs users:**
```bash
export EDITOR=emacs
# Or for emacs in terminal mode
export EDITOR="emacs -nw"
```

**For other editors:**
```bash
export EDITOR=nano
export EDITOR=code        # VS Code (requires --wait flag: "code --wait")
export EDITOR=subl        # Sublime Text (requires --wait flag: "subl --wait")
```

> [!TIP]
> ### GUI Editor Configuration
>
> When using GUI editors like VS Code or Sublime Text, make sure to include the `--wait` flag so the editor waits for you to close the file before continuing:
> ```bash
> export EDITOR="code --wait"
> export EDITOR="subl --wait"
> ```

### Additional Environment Variables

The publish command supports configurable additional environment variables specific to your project:

```yaml
publish:
  requiredEnvVars:
    - NODE_AUTH_TOKEN
    - DEPLOY_KEY
    - CUSTOM_API_TOKEN
    - CODECOV_TOKEN
```

## Excluded Patterns

Filter out specific files or directories from analysis:

- `--exclude [excludedPatterns...]`: Paths to exclude from the diff (can specify multiple patterns)

Examples:
```bash
# Exclude specific files or directories from diff analysis
kodrdriv commit --exclude "*.lock" "dist/" "node_modules/"

# Exclude patterns from release notes
kodrdriv release --exclude "package-lock.json"
```

You can also configure excluded patterns in your configuration file:

```yaml
excludedPatterns:
  - node_modules
  - dist
  - "*.log"
  - "*.lock"
```

> [!NOTE]
> **CLI vs Configuration Mapping**: The CLI argument `--exclude` maps to the `excludedPatterns` property in configuration files. This design allows you to use the more intuitive `--exclude` flag on the command line while maintaining the descriptive `excludedPatterns` name in configuration files.

## Stop-Context Filtering

Stop-context filtering automatically removes sensitive or contextual information from AI-generated content before it's committed to your repository or sent to GitHub. This is particularly useful when working on multiple projects under different identities or organizations.

### Use Cases

- **Multi-Identity Development**: Prevent information from one project identity from leaking into another
- **Anonymous Projects**: Maintain anonymity by filtering personal identifiers
- **Cross-Project References**: Prevent project names, usernames, or organization names from appearing in the wrong repository
- **Directory Path Sanitization**: Filter out local directory paths that might reveal sensitive information

### Configuration

Configure stop-context filtering in your `.kodrdriv/config.yaml` file:

```yaml
stopContext:
  enabled: true                    # Enable stop-context filtering (default: true if filters exist)
  caseSensitive: false             # Case-insensitive matching by default
  replacement: "[REDACTED]"        # Text to replace filtered content
  warnOnFilter: true               # Log warnings when content is filtered

  # Simple string matches (literal)
  strings:
    - "old-username"
    - "previous-project-name"
    - "internal-org-name"
    - "/Users/myname/projects"

  # Regular expression patterns
  patterns:
    - regex: "\\bproject-\\w+-\\d+\\b"
      flags: "gi"
      description: "Project identifiers with numbers"
    - regex: "/path/to/sensitive/directory"
      flags: "g"
      description: "Sensitive directory paths"
```

### How It Works

Stop-context filtering applies to all AI-generated content before it's committed or sent to GitHub:

1. **Commit Messages** - Filtered before committing (via `commit` and `audio-commit` commands)
2. **Release Notes** - Filtered before creating releases (via `release` command)
3. **GitHub Issues** - Filtered before creating issues (via `review` command)
4. **Pull Requests** - Filtered before creating PRs (via `publish` command)

The filtering happens automatically after AI generation but before presenting content to you for review.

### Filter Types

#### Literal String Filtering

Simple string matching with case-insensitive support:

```yaml
stopContext:
  strings:
    - "MyRealName"
    - "my-github-username"
    - "CompanyName"
```

These strings will be matched and replaced anywhere they appear in generated content.

#### Regular Expression Patterns

More sophisticated pattern matching for complex cases:

```yaml
stopContext:
  patterns:
    - regex: "\\b[A-Za-z0-9._%+-]+@example\\.com\\b"
      flags: "gi"
      description: "Email addresses from example.com"
    - regex: "/Users/\\w+/projects/\\w+"
      flags: "g"
      description: "Local project paths"
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true (if filters exist) | Enable/disable filtering |
| `caseSensitive` | boolean | false | Case-sensitive string matching |
| `replacement` | string | `[REDACTED]` | Text to replace filtered content |
| `warnOnFilter` | boolean | true | Log warnings when content is filtered |
| `strings` | string[] | [] | Literal strings to filter |
| `patterns` | object[] | [] | Regex patterns to filter |

### Pattern Configuration

Each pattern in the `patterns` array supports:

```yaml
patterns:
  - regex: "your-regex-pattern"    # Required: The regular expression
    flags: "gi"                    # Optional: Regex flags (g, i, m, etc.)
    description: "What this filters" # Optional: Human-readable description
```

### Examples

#### Example 1: Multi-Project Developer

Filter references to other projects you work on:

```yaml
stopContext:
  enabled: true
  strings:
    - "ProjectAlpha"
    - "CompanyBeta"
    - "my-other-github-org"
  patterns:
    - regex: "@my-other-org/[\\w-]+"
      flags: "g"
      description: "NPM packages from other org"
```

#### Example 2: Anonymous Development

Maintain anonymity by filtering personal information:

```yaml
stopContext:
  enabled: true
  replacement: "[FILTERED]"
  strings:
    - "MyRealName"
    - "my-personal-username"
    - "my-company-name"
  patterns:
    - regex: "/Users/myname/"
      flags: "g"
      description: "Personal directory paths"
```

#### Example 3: Organization Security

Prevent internal references from appearing in public repositories:

```yaml
stopContext:
  enabled: true
  strings:
    - "InternalProjectName"
    - "internal-jira-key"
  patterns:
    - regex: "\\b[A-Z]{2,}-\\d+\\b"
      flags: "g"
      description: "JIRA ticket references"
    - regex: "internal\\.company\\.com"
      flags: "gi"
      description: "Internal domain references"
```

### Warnings and Feedback

When filtering is applied, KodrDriv logs information about what was filtered:

```
⚠️  STOP_CONTEXT_FILTERED: Sensitive content filtered from generated text
    Matches: 3 | Original Length: 245 | Filtered Length: 218
```

If a high percentage of content (>50%) is filtered, you'll see an additional warning:

```
⚠️  STOP_CONTEXT_HIGH_FILTER: High percentage of content filtered
    Percentage: 62.5% | Impact: Generated content may be incomplete
    Action: Review stop-context configuration
```

### Best Practices

1. **Start Simple**: Begin with literal string filtering for known sensitive terms
2. **Test Patterns**: Use `--dry-run` mode to test filtering without committing
3. **Review Warnings**: Pay attention to filter warnings to ensure important content isn't over-filtered
4. **Use Descriptions**: Add descriptions to patterns for easier maintenance
5. **Regular Updates**: Update your filter list as your projects evolve

### Security Considerations

- Filtering happens locally before any content is committed or sent to GitHub
- Filtered content is never transmitted or stored in your repository
- Review AI-generated content even with filtering enabled to catch edge cases
- Consider using more specific patterns to avoid over-filtering

> [!WARNING]
> Stop-context filtering is a safety mechanism, but it's not foolproof. Always review generated content before committing, especially for sensitive projects.

## Diff Size Management

KodrDriv automatically manages large diffs to prevent LLM token limit issues and ensure reliable generation for both commit messages and release notes.

### How It Works

KodrDriv applies intelligent file-by-file diff truncation:

1. **Per-file limits**: Each file's diff is limited to `maxDiffBytes` (default: 2048 bytes)
2. **Smart truncation**: Large files show summary messages instead of full diff content
3. **Total size protection**: Prevents the combined diff from becoming excessively large
4. **Structure preservation**: Maintains diff headers and essential context

### Adaptive Retry System

When LLM requests fail due to size limits, KodrDriv automatically:

1. **Progressive reduction**: Cuts the `maxDiffBytes` limit by 50% per retry attempt
2. **Regenerates prompts**: Creates new prompts with smaller diffs
3. **Preserves context**: Maintains commit history and user-provided context
4. **Safety threshold**: Never reduces below 512 bytes to ensure meaningful analysis

### Configuration

The `maxDiffBytes` setting can be configured globally or per-command:

```yaml
# Global setting (applies to all commands)
maxDiffBytes: 4096

# Command-specific settings (override global)
commit:
  maxDiffBytes: 2048    # Smaller for focused commit messages

release:
  maxDiffBytes: 8192    # Larger for comprehensive release notes
```

### Use Cases

**Small Projects or Focused Changes:**
```yaml
commit:
  maxDiffBytes: 1024    # Quick, focused analysis
```

**Large Codebases:**
```yaml
commit:
  maxDiffBytes: 4096    # More context for complex changes
release:
  maxDiffBytes: 16384   # Comprehensive release analysis
```

**Performance-Sensitive Environments:**
```yaml
commit:
  maxDiffBytes: 512     # Fastest processing
release:
  maxDiffBytes: 1024    # Balanced speed and detail
```

### Logging Output

When truncation occurs, KodrDriv provides clear feedback:

```
Applied diff truncation: 25430 bytes -> 8192 bytes (limit: 2048 bytes)
[SUMMARY: 5 files omitted due to size limits. Original diff: 25430 bytes, processed diff: 8192 bytes]
```

Individual large files show:
```
... [CHANGE OMITTED: File too large (7832 bytes > 2048 limit)] ...
```

This ensures reliable operation regardless of changeset size while providing transparency about what content was analyzed.

## Command-Specific Configuration

### Commit Configuration

> [!NOTE]
> **Configuration-Only Options**: The `messageLimit` option is only available in configuration files, not as a command-line option. This design choice keeps the CLI focused on essential workflow options while allowing detailed configuration through config files.

```yaml
commit:
  add: true                    # Automatically stage all changes before committing
  messageLimit: 5              # Maximum number of commit messages to generate
  cached: false                # Only analyze staged changes
  sendit: false                # Skip interactive confirmation
  interactive: false           # Enable interactive editing of commit messages
  context: "feature work"      # Additional context for AI
  direction: "forward"         # Commit direction context
  skipFileCheck: false         # Skip file dependency validation
  maxDiffBytes: 2048           # Maximum bytes per file in diff analysis (default: 2048)
  model: "gpt-4o"             # Model to use for commit message generation
```

### Release Configuration

> [!NOTE]
> **Configuration-Only Options**: The `messageLimit` option is only available in configuration files, not as a command-line option. This design choice keeps the CLI focused on essential workflow options while allowing detailed configuration through config files.

```yaml
release:
  from: main                   # Starting point for release diff
  to: HEAD                     # End point for release diff
  messageLimit: 10             # Maximum number of commit messages to include
  interactive: false           # Enable interactive editing of release notes
  context: "quarterly release" # Additional context for AI
  focus: "breaking changes"    # Focus area for release notes
  maxDiffBytes: 2048           # Maximum bytes per file in diff analysis (default: 2048)
  model: "gpt-4o"             # Model to use for release note generation
```

### Review Configuration

> [!NOTE]
> **Configuration-Only Options**: The context inclusion and limit options below are only available in configuration files, not as command-line options. This design choice keeps the CLI focused on essential workflow options while allowing detailed configuration through config files.

```yaml
review:
  includeCommitHistory: true   # Include commit history in analysis
  includeRecentDiffs: true     # Include recent diffs in analysis
  includeReleaseNotes: false   # Include release notes in analysis
  includeGithubIssues: true    # Include GitHub issues in analysis
  commitHistoryLimit: 10       # Maximum number of commits to analyze
  diffHistoryLimit: 5          # Maximum number of recent diffs to analyze
  releaseNotesLimit: 3         # Maximum number of release notes to analyze
  githubIssuesLimit: 20        # Maximum number of GitHub issues to analyze
  context: "code review"       # Additional context for AI
  sendit: false                # Skip interactive confirmation
  note: "weekly review"        # Additional notes for the review
  editorTimeout: null          # No timeout by default; set to milliseconds if desired (e.g., 300000 for 5 minutes)
  maxContextErrors: 5          # Maximum context errors to tolerate
  model: "gpt-4o-mini"        # Model to use for review generation
```

### Publish Configuration

```yaml
publish:
  mergeMethod: squash
  from: main                    # Default branch/tag to generate release notes from
  targetVersion: patch          # Default version bump strategy ("patch", "minor", "major", or explicit version)
  interactive: false            # Whether to enable interactive release notes editing by default
  checksTimeout: 3600000        # Timeout in milliseconds for waiting for PR checks (default: 1 hour)
  dependencyUpdatePatterns:
    - "@company/*"
  scopedDependencyUpdates:
    - "@company"                # Scopes to check for updates before publish (defaults to package's own scope)
  requiredEnvVars:
    - NODE_AUTH_TOKEN
  linkWorkspacePackages: true
  unlinkWorkspacePackages: true
  waitForReleaseWorkflows: true
  releaseWorkflowsTimeout: 600000
  releaseWorkflowNames:
    - "Release to NPM"
    - "Deploy to Production"
```

#### Publish Configuration Options

- **`mergeMethod`**: Method to merge pull requests during the publish process
  - Options: `merge`, `squash`, `rebase`
  - Default: `squash`

- **`from`**: Default branch or tag to generate release notes from
  - Accepts any valid Git reference (branch, tag, or commit hash)
  - Default: `main`
  - **Use Case**: Configure a default starting point for release notes, useful for repos with non-standard main branches

- **`targetVersion`**: Default version bump strategy for releases
  - Options: `"patch"`, `"minor"`, `"major"`, or explicit version like `"4.30.0"`
  - Default: `"patch"`
  - **Use Case**: Configure default release behavior for your project (e.g., always do minor bumps for feature releases)

- **`interactive`**: Whether to enable interactive release notes editing by default
  - Options: `true`, `false`
  - Default: `false`
  - **Use Case**: Enable for projects where release notes often need manual refinement or additional context

- **`checksTimeout`**: Timeout in milliseconds for waiting for PR checks to complete
  - Number in milliseconds
  - Default: `3600000` (1 hour)
  - **Use Case**: Adjust based on how long your CI/CD workflows typically take to complete

- **`dependencyUpdatePatterns`**: Patterns for which dependencies to update during publish
  - Array of package name patterns (supports wildcards)
  - If not specified, all dependencies are updated
  - **Note**: This controls the final `npm update` step, not the scoped updates

- **`scopedDependencyUpdates`**: Scopes to check for updates using npm-check-updates before publish
  - Array of npm scopes (e.g., `["@fjell", "@company"]`)
  - **Default behavior**: If not specified, defaults to the package's own scope (e.g., `@fjell/core` will check `@fjell` scope)
  - **Use Case**: For multi-scope projects, specify which scopes should be kept up-to-date. For single-scope projects like Fjell, you typically don't need to configure this.
  - Set to an empty array `[]` to disable automatic scoped updates entirely

- **`requiredEnvVars`**: Environment variables that must be set for publish to succeed
  - Array of environment variable names
  - Default includes `GITHUB_TOKEN` and `OPENAI_API_KEY`

- **`linkWorkspacePackages`** / **`unlinkWorkspacePackages`**: Whether to automatically link/unlink workspace packages during the publish process
  - Options: `true`, `false`
  - Default: `true`

- **`waitForReleaseWorkflows`**: Whether to wait for workflows triggered by release/tag creation
  - Options: `true`, `false`
  - Default: `true`

- **`releaseWorkflowsTimeout`**: Maximum time in milliseconds to wait for release workflows
  - Default: `600000` (10 minutes)

- **`releaseWorkflowNames`**: Specific workflow names to wait for (overrides automatic detection)
  - Array of workflow names
  - If not specified, automatically detects release-triggered workflows

#### Branch-Dependent Targeting

KodrDriv supports sophisticated branch-dependent targeting that allows different source branches to target different destination branches with different versioning strategies. This is particularly useful for CI/CD pipelines where you want automated promotion through multiple environments.

**NEW: Branches Configuration (Recommended)**

The new `branches` configuration makes versioning semantics clearer by specifying what version should be **ON** each branch:

```yaml
branches:
  working:
    targetBranch: "development"
    developmentBranch: true  # Mark this as the active development branch
    version:
      type: "prerelease"
      increment: true
      tag: "dev"
  development:
    targetBranch: "test"
    version:
      type: "prerelease"
      increment: false
      tag: "development"
  test:
    targetBranch: "main"
    version:
      type: "prerelease"
      increment: false
      tag: "test"
  main:
    version:
      type: "release"
```

**Default Configuration:**

If no configuration is provided, KodrDriv uses this simple default:

```yaml
branches:
  working:
    targetBranch: "main"
    developmentBranch: true
    version:
      type: "prerelease"
      increment: true
      incrementLevel: "patch"
      tag: "dev"
  main:
    version:
      type: "release"
```

**How It Works (New Semantics):**

When you run `kodrdriv publish` or `kodrdriv tree publish`, the system:
1. **Detects your current branch** (e.g., "working")
2. **Looks up the target branch** from the source branch configuration (e.g., "development")
3. **Looks at the target branch's version configuration** to determine what version should be ON that branch
4. **Calculates the target version** based on the target branch's version strategy


**Version Strategies:**

- **`type: "prerelease"`**: Creates or increments prerelease versions
  - `increment: true`: Increments existing prerelease versions (1.2.3-dev.0 → 1.2.3-dev.1)
  - `increment: false`: Replaces the prerelease tag without incrementing
  - `incrementLevel: "patch|minor|major"`: When going back to development branch, increment the specified version level (used with `kodrdriv development` command)
  - `tag: "dev"`: Uses the specified prerelease tag (dev, test, rc, etc.)
- **`type: "release"`**: Converts prerelease to final release version (1.2.3-test.5 → 1.2.3)

**Example Workflow (New Semantics):**

```bash
# On working branch (version: 1.2.3-dev.0)
# Target: development branch (configured with increment: true, tag: dev)
git checkout working
kodrdriv tree publish
# Result: Merges to development branch with version 1.2.3-dev.1
# (increments based on development branch's version config)

# On development branch (version: 1.2.3-dev.1)
# Target: test branch (configured with increment: false, tag: test)
git checkout development
kodrdriv tree publish
# Result: Merges to test branch with version 1.2.3-test.0
# (sets test tag based on test branch's version config)

# On test branch (version: 1.2.3-test.0)
# Target: main branch (configured with type: release)
git checkout test
kodrdriv tree publish
# Result: Merges to main branch with version 1.2.3 (final release)
# (removes prerelease tags based on main branch's version config)
```

**Advanced Version Logic:**

- **Cross-tag transitions**: Moving from "dev" to "test" resets the prerelease number to 0
- **Same-tag increments**: Staying on the same tag (dev → dev) increments the number
- **Target branch version checking**: When `increment: true`, checks the target branch for existing versions
- **Intelligent fallbacks**: Falls back to standard behavior when no targets are configured
- **Development branch marking**: Use `developmentBranch: true` to mark your active development branch

**Development Command Integration:**

The `kodrdriv development` command works in reverse with branch targeting:
- **Finds the development branch**: Looks for the branch marked with `developmentBranch: true`
- **Smart navigation**: From any branch (main, test, development), takes you to the development branch
- **Version synchronization**: When coming from `development` branch, syncs versions if they have the same prerelease tag

```bash
# From any branch, navigate to your development branch
git checkout main        # or test, or development
kodrdriv development    # Automatically goes to "working" (marked as developmentBranch)
```

#### Automatic Workflow Detection

By default, KodrDriv will automatically detect which GitHub Actions workflows will be triggered by release events by analyzing your workflow files (`.github/workflows/*.yml`). This includes workflows that:

- Are triggered by `release` events (e.g., `on: release` or `on: { release: { types: [published] } }`)
- Are triggered by `push` events on version tags (e.g., `on: { push: { tags: ['v*'] } }`)

If you want to override this automatic detection, you can specify `releaseWorkflowNames` in your configuration. When specified, KodrDriv will only wait for those specific workflows to complete.

**Example workflow patterns that are automatically detected:**

```yaml
# Release event trigger
on:
  release:
    types: [published, created]

# Tag push trigger
on:
  push:
    tags:
      - 'v*'
      - 'release/*'

# Multiple triggers including release
on: [push, release]
```

### Link Configuration

```yaml
link:
  scopeRoots:
    "@company": "../"
    "@myorg": "../../org-packages/"
  externals:
    - "@somelib"
    - "lodash"
    - "@external/*"
```

### Tree Configuration

The tree command supports both single and multiple directory analysis:

```yaml
tree:
  directories: ["./packages", "../shared-libs"]  # Multiple directories to analyze
  # OR
  directory: "./packages"                         # Single directory (converted to directories array)
  exclude: ["**/node_modules/**", "dist/*"]      # Patterns to exclude packages
  startFrom: "core"                              # Resume from specific package
  stopAt: "web"                                  # Stop at specific package
  cmd: "npm install"                             # Custom command to run
  continue: false                                # Continue from previous execution
  cleanNodeModules: false                        # Clean node_modules during unlink
  externals: ["@external/*", "lodash"]           # External dependency patterns
```

> [!NOTE]
> **Tree Command Options**: The tree command supports both `--directory` (single) and `--directories` (multiple) CLI options. When using `--directory`, it's automatically converted to a `directories` array in the configuration. This provides flexibility for both single-workspace and multi-workspace scenarios.

## Basic Options

Global options that apply to all commands:

- `--dry-run`: Perform a dry run without saving files (default: false)
- `--verbose`: Enable verbose logging (default: false)
- `--debug`: Enable debug logging (default: false)
- `--overrides`: Enable instruction overrides (allows custom instruction files to override defaults)
- `--config-dir <configDir>`: Specify a custom configuration directory (default: '.kodrdriv')
- `--check-config`: Display the current configuration hierarchy showing how values are merged from defaults, config files, and CLI arguments. This is useful for debugging configuration issues and understanding which settings are active.
- `--init-config`: Generate an initial configuration file with common default values in the specified config directory (default: '.kodrdriv')
- `--version`: Display version information

## Configuration vs CLI Options

KodrDriv provides two ways to configure behavior:

### CLI-Only Options
These options are only available via command-line arguments and cannot be set in configuration files:
- `--dry-run`: For one-time dry runs
- `--verbose` / `--debug`: For temporary debugging
- `--check-config`: For configuration diagnostics
- `--init-config`: For initial setup

### Configuration-Only Options
These options are only available in configuration files and provide persistent settings:
- `messageLimit`: For commit and release commands
- `includeCommitHistory`, `includeRecentDiffs`, etc.: For review context control
- `dependencyUpdatePatterns`: For publish workflows
- `linkWorkspacePackages`: For monorepo management

### Shared Options
These options can be set both via CLI and configuration files:
- `--model` / `model`: AI model selection
- `--exclude` / `excludedPatterns`: File exclusion patterns
- `--max-diff-bytes` / `maxDiffBytes`: Diff size limits
- `--context` / `context`: Additional context for AI

> [!TIP]
> **Best Practice**: Use configuration files for persistent settings and CLI arguments for one-time overrides. This approach provides consistency across your project while maintaining flexibility for specific use cases.
