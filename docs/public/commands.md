# Commands

> [!IMPORTANT]
> ### Configuration Required
>
> Before using KodrDriv commands, you should configure the program through its configuration directory. By default, KodrDriv looks for configuration files in `./.kodrdriv` in your project root. This includes settings for AI models, API keys, instructions, and command-specific defaults.
>
 > **Quick setup:**
> ```bash
> kodrdriv --init-config  # Create initial configuration files
> kodrdriv --check-config # Validate your configuration
> ```
>
> For detailed configuration options, see the [Configuration Documentation](configuration.md).

KodrDriv provides comprehensive commands for automating Git workflows, generating intelligent documentation, and managing audio-driven development workflows.

## Core Workflow Commands

### Tree Command - Central Dependency Analysis

Analyze dependency order and execute commands across multiple packages in a workspace:

```bash
# Execute custom commands
kodrdriv tree --cmd "npm install"

# Execute built-in kodrdriv commands with configuration isolation
kodrdriv tree commit
kodrdriv tree publish
kodrdriv tree link
kodrdriv tree unlink
kodrdriv tree development
kodrdriv tree run "clean build test"
kodrdriv tree checkout development
```

The tree command provides two execution modes:
1. **Custom Command Mode**: Execute any shell command across packages
2. **Built-in Command Mode**: Execute kodrdriv commands with proper configuration isolation

**Key Features:**
- Dependency-aware execution order
- Configuration isolation per package

- Error recovery and resume capabilities
- Multi-directory workspace support

**See:**
- [Tree Command Documentation](commands/tree.md) for complete usage
- [Tree Built-in Commands](commands/tree-built-in-commands.md) for detailed built-in command documentation

## Workspace Checkout Command

Safely checkout all packages to a specified branch with comprehensive safety checks:

```bash
# Checkout entire workspace to development branch
kodrdriv tree checkout development

# Switch all packages to feature branch
kodrdriv tree checkout feature/new-feature

# Dry run to see what would happen
kodrdriv tree checkout main --dry-run
```

The checkout command performs a two-phase operation:
1. **Safety Check**: Scans all packages for uncommitted changes
2. **Workspace Checkout**: Switches all clean packages to the target branch

**Safety Features:**
- **Blocks operation** if any package has uncommitted changes
- **Clear error reporting** showing exactly which packages have issues
- **Recovery suggestions** including using `kodrdriv tree commit` to commit changes
- **Branch creation** from remote or new branches as needed

**Use Cases:**
- **Environment Switching**: Move entire workspace between development/staging/production branches
- **Feature Development**: Switch all packages to feature branch for coordinated development
- **Release Preparation**: Ensure all packages are on correct branch before release operations
- **Hotfix Deployment**: Emergency workspace switch to hotfix branch

## Development Command

Manage transition from main to working branch with development version setup:

```bash
kodrdriv development
```

The development command automates the workflow of moving from the main branch to a working branch while setting up proper development versioning. It handles branch management, version bumping, milestone creation, and automated commits.

### Development Command Options

- `--target-version <targetVersion>`: Specify version bump type or explicit version (default: 'patch')
  - **Semantic bumps**: Use "patch", "minor", or "major" for automatic version increments
  - **Explicit version**: Provide a specific version number (e.g., "2.1.0")
- `--no-milestones`: Disable GitHub milestone integration

### Examples

```bash
# Basic development setup (patch bump)
kodrdriv development

# Minor version development bump
kodrdriv development --target-version minor

# Explicit version development setup
kodrdriv development --target-version 2.1.0

# Development setup without milestone management
kodrdriv development --no-milestones
```

**See:** [Development Command Documentation](commands/development.md) for complete usage

## Versions Command

Update dependency versions in package.json files across workspace packages:

```bash
kodrdriv versions <subcommand>
```

The versions command helps manage dependency versions across packages in a workspace environment. It provides tools for normalizing and updating dependency version patterns to maintain consistency across related packages.

### Supported Subcommands

- `minor`: Normalize same-scope dependencies to major.minor format

### Versions Command Options

- `--directories [directories...]`: Directories to scan for packages (defaults to current directory)

### Examples

```bash
# Normalize same-scope dependencies in current directory
kodrdriv versions minor

# Process specific directories
kodrdriv versions minor --directories ./packages ./apps

# See what changes would be made
kodrdriv versions minor --dry-run
```

**See:** [Versions Command Documentation](commands/versions.md) for complete usage

## Commit Command

Generate intelligent commit messages using AI analysis of your code changes:

```bash
kodrdriv commit
```

The commit command analyzes your changes and generates contextual commit messages using AI. It can work with both staged and unstaged changes.

### Providing Direction

You can provide direction for the commit message in two ways:

**Positional argument:**
```bash
kodrdriv commit "fix performance issues"
```

**STDIN (takes precedence over positional argument):**
```bash
echo "fix performance issues" | kodrdriv commit
cat my_thoughts.txt | kodrdriv commit
```

STDIN input is particularly useful for:
- Scripting and automation
- Voice-driven workflows (when combined with speech-to-text)
- Complex directions that might contain special characters

> [!TIP]
> ### Working with Staged Changes
>
> When you have staged changes using `git add`, the `kodrdriv commit` command will automatically analyze the diff of your staged changes. This allows you to selectively stage files and generate a commit message that specifically addresses those changes, rather than all uncommitted changes in your working directory.

> [!TIP]
> ### Quick Commit with --sendit
>
> If you trust the quality of the generated commit messages, you can use the `--sendit` flag to automatically commit your changes with the generated message without review. This is useful for quick, routine changes where you want to streamline your workflow.

### Commit Command Options

- `--add`: Add all changes to the index before committing (runs `git add -A`)
- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review (default: false)
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.


### Examples

```bash
# Basic commit message generation
kodrdriv commit

# Generate commit with direction
kodrdriv commit "refactor user authentication system"

# Pipe complex direction from file
cat requirements.txt | kodrdriv commit

# Add all changes and commit automatically
kodrdriv commit --add --sendit "initial implementation"

# Use only staged changes with additional context
git add src/auth.ts
kodrdriv commit --cached --context "Part of security improvements"

# Limit commit history context
kodrdriv commit "quick fix"
```

## Audio Commit Command

Record audio to provide context for commit message generation using speech-to-text:

```bash
kodrdriv audio-commit
```

The audio commit command allows you to speak your commit intentions, which are then transcribed and used as direction for generating the commit message.

> [!TIP]
> ### Audio Device Setup
>
> Before using audio commands, run `kodrdriv select-audio` to configure your preferred microphone. This creates a configuration file in your preferences directory that will be used for all audio recording.

### Audio Commit Options

- `--add`: Add all changes to the index before committing
- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review
- `--direction <direction>`: Fallback text direction if audio fails

- `--file <file>`: Process an existing audio file instead of recording (supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, aac, ogg, opus)

### Examples

```bash
# Record audio for commit context
kodrdriv audio-commit

# Record audio and commit automatically
kodrdriv audio-commit --sendit

# Process existing audio file
kodrdriv audio-commit --file ./recording.wav

# Add all changes and use audio context
kodrdriv audio-commit --add
```

## Review Command

Analyze review notes for project issues and automatically create GitHub issues:

```bash
kodrdriv review
```

The review command takes text input (note) and analyzes it for potential issues, bugs, or improvements, then can automatically create GitHub issues.

### Providing Review Notes

You can provide review notes in two ways:

**Positional argument:**
```bash
kodrdriv review "The authentication flow is confusing and needs better error messages"
```

**STDIN (takes precedence over positional argument):**
```bash
echo "Need to improve performance in data processing" | kodrdriv review
cat my_review_notes.txt | kodrdriv review
```

### Review Command Options

**Context Configuration:**
- `--include-commit-history` / `--no-include-commit-history`: Include recent commit log messages in context (default: true)
- `--include-recent-diffs` / `--no-include-recent-diffs`: Include recent commit diffs in context (default: true)
- `--include-release-notes` / `--no-include-release-notes`: Include recent release notes in context (default: false)
- `--include-github-issues` / `--no-include-github-issues`: Include open GitHub issues in context (default: true)

**Context Limits:**
- `--commit-history-limit <limit>`: Number of recent commits to include (default: 10)
- `--diff-history-limit <limit>`: Number of recent commit diffs to include (default: 5)
- `--release-notes-limit <limit>`: Number of recent release notes to include (default: 3)
- `--github-issues-limit <limit>`: Number of open GitHub issues to include, max 20 (default: 20)

**Other Options:**
- `--context <context>`: Additional context for the review
- `--sendit`: Create GitHub issues automatically without confirmation

### Examples

```bash
# Basic review analysis
kodrdriv review "The user interface needs improvement"

# Review with custom context limits
kodrdriv review --commit-history-limit 5 --diff-history-limit 2 "Performance issues"

# Auto-create issues without confirmation
kodrdriv review --sendit "Critical security vulnerabilities found"

# Review with minimal context
kodrdriv review --no-include-commit-history --no-include-recent-diffs "UI feedback"

# Pipe detailed review from file
cat code_review.md | kodrdriv review --context "Sprint 2 review"
```

## Audio Review Command

Record audio to provide context for project review and issue analysis:

```bash
kodrdriv audio-review
```

Similar to the review command, but allows you to speak your review notes which are transcribed and analyzed.

### Audio Review Options

**Context Configuration (same as review command):**
- `--include-commit-history` / `--no-include-commit-history`: Include recent commit log messages in context (default: true)
- `--include-recent-diffs` / `--no-include-recent-diffs`: Include recent commit diffs in context (default: true)
- `--include-release-notes` / `--no-include-release-notes`: Include recent release notes in context (default: false)
- `--include-github-issues` / `--no-include-github-issues`: Include open GitHub issues in context (default: true)

**Context Limits (same as review command):**
- `--commit-history-limit <limit>`: Number of recent commits to include (default: 10)
- `--diff-history-limit <limit>`: Number of recent commit diffs to include (default: 5)
- `--release-notes-limit <limit>`: Number of recent release notes to include (default: 3)
- `--github-issues-limit <limit>`: Number of open GitHub issues to include, max 20 (default: 20)

**Audio-Specific Options:**
- `--file <file>`: Process an existing audio file instead of recording (supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, aac, ogg, opus)
- `--context <context>`: Additional context for the review
- `--sendit`: Create GitHub issues automatically without confirmation

### Examples

```bash
# Record audio for review analysis
kodrdriv audio-review

# Process existing audio file
kodrdriv audio-review --file ./review_notes.mp3

# Auto-create issues from audio review
kodrdriv audio-review --sendit

# Audio review with minimal context
kodrdriv audio-review --no-include-recent-diffs

# Audio review with custom context limits
kodrdriv audio-review --commit-history-limit 3 --diff-history-limit 1
```

## Release Command

Generate comprehensive release notes based on changes since the last release:

```bash
kodrdriv release
```

The release command analyzes changes between two Git references and generates structured release notes.

> [!TIP]
> ### Custom Release Range
>
> The `kodrdriv release` command supports customizing the range of commits to analyze using the `--from` and `--to` options. By default, it automatically detects the best comparison reference (trying `main`, then `master`, then `origin/main`) and compares to `HEAD`, but you can specify any valid Git reference (branch, tag, or commit hash) for either endpoint. This flexibility allows you to generate release notes for specific version ranges or between different branches.

> [!TIP]
> ### Comparing Releases
>
> You can use the `--from` and `--to` options to generate release notes comparing two different releases. For example, to see what changed between v1.0.0 and v1.1.0, you could use `kodrdriv release --from v1.0.0 --to v1.1.0`. This is particularly useful for creating detailed changelogs when preparing release documentation.

### Release Command Options

- `--from <from>`: Branch or reference to generate release notes from (default: automatically detected - tries `main`, then `master`, then `origin/main`)
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
 while increasing it provides broader historical context.

### Examples

```bash
# Generate release notes from main to HEAD
kodrdriv release

# Generate release notes between specific versions
kodrdriv release --from v1.0.0 --to v1.1.0

# Release notes for feature branch
kodrdriv release --from main --to feature/new-auth

# Release notes with additional context
kodrdriv release --context "Major security update with breaking changes"

# Focused release notes with limited history
kodrdriv release
```

## Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process. Here's what it does:

1. **Dependency Management**: For projects with npm workspaces, it temporarily switches from workspace dependencies to registry versions. It then runs `npm update` to ensure dependencies are up to date. You can configure specific dependency patterns to update instead of updating all dependencies using the `dependencyUpdatePatterns` configuration option.

2. **Pre-flight Checks**: Before committing any changes, it runs the `prepublishOnly` script from your `package.json`. This script should contain your project's pre-flight checks (e.g., `clean`, `lint`, `build`, `test`) to ensure the project is in a good state. **Note**: A `prepublishOnly` script is required in your `package.json` - the publish command will fail if this script is not present.

3. **Release Commit**: If there are changes to `package.json` or `package-lock.json`, it creates an intelligent commit message for the dependency updates.

4. **Version Bump**: It automatically bumps the patch version of your project.

5. **Release Notes**: It generates release notes based on the recent changes and saves them to `RELEASE_NOTES.md`.

6. **Pull Request Automation**:
   - It pushes the changes and tags to the origin.
   - It creates a new pull request for the release.
   - It waits for all status checks on the pull request to pass.
   - If no GitHub Actions workflows or status checks are configured, the command will detect this automatically and either proceed immediately or ask for user confirmation (depending on configuration).
   - Once checks are complete (or if no checks exist), it automatically merges the pull request using the configured merge method (default: squash).

7. **GitHub Release**: After the PR is merged, it checks out the `main` branch, pulls the latest changes, and creates a new GitHub release with the tag and release notes.

8. **Completion**: Switches to the target branch (default: `main`) and completes the process.

This command is designed for repositories that follow a pull-request-based release workflow with or without status checks. It automatically handles repositories that have no CI/CD configured and streamlines the process, reducing manual steps and potential for error.

## Workflow and Status Check Management

The publish command intelligently manages GitHub Actions workflows and status checks throughout the release process:

### Pull Request Checks

**When PR is created on release branch:**
1. **Automatic Check Detection**: Scans for GitHub Actions workflows and status checks on the PR
2. **Intelligent Waiting**: Waits up to 5 minutes (configurable) for all checks to complete
3. **Progress Monitoring**: Reports check completion status every 10 seconds
4. **Failure Handling**: Stops the process if any checks fail

**Scenarios handled:**

- **✅ Repository with workflows**: Waits for all checks, proceeds when green
- **⚠️ Repository without workflows**: Detects absence after 1 minute, prompts user
- **⏰ Timeout reached**: Prompts user whether to proceed or abort
- **❌ Failed checks**: Immediately stops and reports failing check names

### Release Workflows (After Tag Creation)

**When tag is pushed to main branch:**
1. **Release Trigger Detection**: Looks for workflows triggered by release/tag events
2. **Extended Timeout**: Waits up to 10 minutes (configurable) for release workflows
3. **Workflow Monitoring**: Tracks status of deployment, publishing, or notification workflows
4. **Smart Detection**: Automatically detects if no release workflows are configured

### Configuration Options for Workflow Management

```json
{
  "publish": {
    "checksTimeout": 300000,              // PR check timeout (5 min default)
    "skipUserConfirmation": false,        // Auto-proceed when no workflows found
    "sendit": false,                      // Skip ALL confirmations
    "waitForReleaseWorkflows": true,      // Wait for release workflows
    "releaseWorkflowsTimeout": 600000,    // Release workflow timeout (10 min)
    "releaseWorkflowNames": ["deploy", "publish"] // Specific workflows to wait for
  }
}
```

### User Interaction Scenarios

**Interactive Mode (default):**
```bash
kodrdriv publish
# Prompts when no workflows found:
# "⚠️ No GitHub Actions workflows found. Proceed anyway? [y/N]"
```

**Automated Mode:**
```bash
kodrdriv publish --sendit
# Skips all workflow confirmations, proceeds immediately
```

**Custom Timeout:**
```json
{
  "publish": {
    "checksTimeout": 600000  // Wait 10 minutes for PR checks
  }
}
```

> [!TIP]
> ### Workflow Management Best Practices
>
> - **For repositories with CI/CD**: Use default settings, kodrdriv will wait for your workflows
> - **For repositories without workflows**: Set `skipUserConfirmation: true` for automation
> - **For deployment workflows**: Configure `targetWorkflows` to wait for specific release workflows
> - **For CI environments**: Use `--sendit` flag to skip all interactive prompts

> [!NOTE]
> ### No Workflows Detected
>
> If your repository doesn't have GitHub Actions workflows or status checks configured, the publish command will:
> 1. Wait 1 minute to confirm no workflows exist
> 2. Prompt for user confirmation (unless `skipUserConfirmation` is enabled)
> 3. Proceed safely without waiting indefinitely
>
> This ensures the tool works seamlessly with any repository configuration.

### Publish Command Options

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'
- `--from <from>`: Branch or tag to generate release notes from (default: 'main')
  - Useful when releases fail and you need to generate notes from a specific version back
  - Accepts any valid Git reference (branch, tag, or commit hash)
- `--target-version <targetVersion>`: Target version for the release
  - **Explicit version**: Provide a specific version number (e.g., "4.30.0")
  - **Semantic bumps**: Use "patch", "minor", or "major" for automatic version increments
  - **Default**: "patch" (automatically increments patch version)
  - **Pre-release handling**: Graduates pre-release versions like "4.23.3-dev.1" to their base version "4.23.3" (patch), or increments normally for minor/major bumps
  - **Tag conflict detection**: Automatically checks if the target version tag already exists and prevents conflicts
- `--interactive`: Present release notes for interactive review and editing
  - Allows you to modify the generated release notes before they're used in the GitHub release
  - Opens an editor where you can refine the content, add context, or restructure the notes
  - **Version confirmation**: When used with publish, also prompts for version confirmation and allows manual override
- `--sendit`: Skip all confirmation prompts and proceed automatically (useful for automated workflows)

### Publish Configuration

You can configure the publish command behavior in your `.kodrdriv/config.json` file:

```json
{
  "publish": {
    "mergeMethod": "squash",
    "dependencyUpdatePatterns": ["@mycompany/*", "@utils/*"],
    "scopedDependencyUpdates": ["@mycompany"],
    "requiredEnvVars": ["NPM_TOKEN", "GITHUB_TOKEN"],
    "checksTimeout": 300000,
    "skipUserConfirmation": false,
    "sendit": false,
    "targetBranch": "main"
  }
}
```

**Configuration Options:**
- `mergeMethod`: Default merge method for pull requests ('merge', 'squash', 'rebase')
- `dependencyUpdatePatterns`: Array of patterns to match dependencies for updating (if not specified, all dependencies are updated)
- `scopedDependencyUpdates`: Array of npm scopes to check for updates before publish (defaults to package's own scope if not specified)
- `requiredEnvVars`: Array of environment variables that must be set before publishing
- `checksTimeout`: Maximum time in milliseconds to wait for PR checks (default: 300000 = 5 minutes)
- `skipUserConfirmation`: Skip user confirmation when no checks are configured (default: false, useful for CI/CD environments)
- `sendit`: Skip all confirmation prompts and proceed automatically (default: false, overrides `skipUserConfirmation` when true)
- `waitForReleaseWorkflows`: Whether to wait for workflows triggered by release tag creation (default: true)
- `targetBranch`: Branch to switch to after completion (default: 'main')
- `releaseWorkflowsTimeout`: Maximum time in milliseconds to wait for release workflows (default: 600000 = 10 minutes)
- `releaseWorkflowNames`: Array of specific workflow names to wait for on release (if not specified, waits for all workflows)

### Examples

```bash
# Standard publish workflow
kodrdriv publish

# Publish with merge instead of squash
kodrdriv publish --merge-method merge

# Publish with rebase
kodrdriv publish --merge-method rebase

# Generate release notes from a specific version (useful for failed releases)
kodrdriv publish --from v1.2.0

# Target a specific version (e.g., when jumping from 4.23.3-dev.1 to 4.30.0)
kodrdriv publish --target-version 4.30.0

# Semantic version bumps
kodrdriv publish --target-version patch  # Default behavior (4.23.3 -> 4.23.4)
kodrdriv publish --target-version minor  # Minor bump (4.23.3 -> 4.24.0)
kodrdriv publish --target-version major  # Major bump (4.23.3 -> 5.0.0)

# Interactive mode for reviewing and editing release notes AND version confirmation
kodrdriv publish --interactive

# Interactive version selection with custom starting point for release notes
kodrdriv publish --from v1.2.0 --interactive

# Target specific version with interactive confirmation
kodrdriv publish --target-version 4.30.0 --interactive

# Automated publish workflow (skip all confirmations)
kodrdriv publish --sendit

# Automated publish with custom merge method
kodrdriv publish --sendit --merge-method merge

# Complex scenario: specific version, custom release notes range, and merge method
kodrdriv publish --target-version 5.0.0 --from v4.0.0 --merge-method merge
```

### Workflow Management Examples

**Repository with CI/CD workflows:**
```bash
# Standard workflow - waits for all checks and release workflows
kodrdriv publish

# Custom timeout for long-running tests
kodrdriv publish  # with checksTimeout: 600000 in config
```

**Repository without workflows:**
```bash
# Interactive - will prompt when no workflows detected
kodrdriv publish

# Automated - skips prompts, proceeds immediately
kodrdriv publish --sendit
```

**Advanced workflow configuration:**
```json
{
  "publish": {
    "checksTimeout": 450000,
    "releaseWorkflowsTimeout": 900000,
    "releaseWorkflowNames": ["deploy-production", "notify-slack"],
    "skipUserConfirmation": true
  }
}
```

## Tree Command

Analyze dependency order and execute commands across multiple packages in a workspace:

```bash
kodrdriv tree --cmd "npm install"
```

The `tree` command is designed for workspace environments where you have multiple packages with interdependencies. It analyzes your workspace structure, builds a dependency graph, determines the correct order for processing packages, and executes a specified command in each package in the correct dependency order.

### What It Does

1. **Package Discovery**: Scans the target directory (current directory by default) for all `package.json` files in subdirectories
2. **Dependency Analysis**: Reads each package's dependencies and identifies local workspace dependencies
3. **Topological Sorting**: Creates a dependency graph and performs topological sorting to determine the correct build order
4. **Execution**: Optionally executes scripts, commands, or the publish process in each package in the correct order

### Key Features

- **Circular Dependency Detection**: Identifies and reports circular dependencies between packages
- **Resume Capability**: Can resume from a specific package if a previous run failed
- **Flexible Execution**: Supports custom scripts, shell commands, or the kodrdriv publish command
- **Pattern Exclusion**: Exclude specific packages or directories from processing
- **Dry Run Mode**: Preview the build order and execution plan without making changes

### Tree Command Options

- `--directory <directory>`: Target directory containing multiple packages (defaults to current directory)
- `--start-from <startFrom>`: Scope execution to the specified package and its related subgraph. When provided, tree limits execution to:
  - The specified package and all of its transitive dependents (packages that consume it, and those packages' consumers, etc.)
  - Plus all transitive dependencies required to build those packages.
  This prevents rebuilding unrelated packages when you only need to work on a subset.
- `--cmd <cmd>`: Shell command to execute in each package directory (e.g., `"npm install"`, `"git status"`)
- `--exclude [excludedPatterns...]`: Patterns to exclude packages from processing (e.g., `"**/node_modules/**"`, `"dist/*"`)

> [!NOTE]
> ### Command Precedence
>
> If multiple execution options are provided, they are processed in this priority order:
> 1. `--publish` (highest priority)
> 2. `--cmd`
> 3. `--script` (lowest priority)
>
> Higher priority options will override lower priority ones with a warning.

### Usage Examples

**Basic command execution:**
```bash
kodrdriv tree --cmd "npm install"
```

**Resume from failed package:**
```bash
kodrdriv tree --cmd "npm run test" --start-from my-package
```

**Custom directory with exclusions:**
```bash
kodrdriv tree --directory ./packages --exclude "test-*" --cmd "npm run lint"
```

**Display dependency order only:**
```bash
kodrdriv tree
```

**Execute built-in kodrdriv commands:**
```bash
# Execute kodrdriv commit across all packages
kodrdriv tree commit

# Execute kodrdriv publish across all packages in dependency order
kodrdriv tree publish

# Link all workspace packages for development
kodrdriv tree link

# Unlink all workspace packages
kodrdriv tree unlink
```

### Configuration

You can configure tree behavior in your `.kodrdriv/config.json` file:

```json
{
  "tree": {
    "directory": "./packages",
    "excludedPatterns": ["**/node_modules/**", "**/dist/**", "**/examples/**"],
    "cmd": "npm run build",
    "startFrom": null,

  }
}
```

**Scoped builds with --start-from:**
```bash
# Given: a depends on b, b depends on c, and d is independent

# Build only the subgraph related to b (c → b → a), skipping d
kodrdriv tree --start-from b --cmd "npm run build"

# Combine with --stop-at to cut before a
kodrdriv tree --start-from b --stop-at a --cmd "npm run build"
# Executes: c → b
```

**Configuration Options:**
- `directory`: Default target directory for package scanning
- `excludedPatterns`: Array of glob patterns to exclude packages (use `--exclude` for CLI). **Note**: These patterns match against directory paths and file paths, not package names from package.json files.
- `cmd`: Default shell command to execute in each package

- `startFrom`: Default package to start from (useful for automated retries)

### Typical Workflows

**CI/CD Pipeline Build:**
```bash
# Build all packages in correct dependency order
kodrdriv tree --cmd "npm run build"
```



**Incremental Publishing:**
```bash
# Publish packages that have changes
kodrdriv tree publish --start-from updated-package
```

**Quality Assurance:**
```bash
# Run tests across all packages
kodrdriv tree --cmd "npm run test"
```

**Version Management:**
```bash
# Update version numbers across workspace
kodrdriv tree --cmd "npm version patch"
```

### Error Handling

If a command fails in any package:
- The process stops immediately
- Error details are logged with the failing package name
- A resume command suggestion is provided with the `--start-from` option
- The number of successfully processed packages is reported

**Example failure output:**
```
❌ Script failed in package @mycompany/api-client: Command 'npm run build' failed with exit code 1
Failed after 3 successful packages.
To resume from this package, use: --start-from api-client
```

### Performance Tips

- Use `--exclude` to skip unnecessary packages (tests, examples, etc.)
- Consider using `--start-from` for large workspaces when resuming failed builds
- Use dry run mode first to verify the build order makes sense


For detailed documentation, see [Tree Command](commands/tree.md).

## Link Command

Manage npm workspace links for local development with sibling projects:

```bash
kodrdriv link
```

The `link` command automates the creation and management of npm workspace configurations for local development. It scans your project's dependencies and automatically discovers matching sibling packages in configured scope directories, then creates file: dependencies in your package.json to link them for local development.

This is particularly useful when working with monorepos or related packages where you want to use local versions of dependencies instead of published registry versions during development.

### Link Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories for package discovery (required)
  - **Format**: `'{"@scope": "path", "@another": "path"}'`
  - **Example**: `'{"@company": "../", "@myorg": "../../packages/"}'`


### Examples

```bash
# Link packages from sibling directories
kodrdriv link --scope-roots '{"@mycompany": "../", "@utils": "../../shared/"}'

# Link with custom workspace file
kodrdriv link --scope-roots '{"@myorg": "../"}'

# Link packages from multiple scope directories
kodrdriv link --scope-roots '{"@frontend": "../ui/", "@backend": "../api/", "@shared": "../common/"}'
```

## Unlink Command

Remove npm workspace links and rebuild dependencies from registry:

```bash
kodrdriv unlink
```

The `unlink` command removes workspace links created by the `link` command and restores dependencies to their published registry versions.

### Unlink Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories (same as link command)


### Examples

```bash
# Remove workspace links
kodrdriv unlink --scope-roots '{"@mycompany": "../"}'

# Unlink with custom workspace file
kodrdriv unlink
```

## Clean Command

Remove output directory and all generated files:

```bash
kodrdriv clean
```

The `clean` command removes the output directory (default: `output/kodrdriv`) and all generated files including debug logs, commit messages, and temporary files.

### Examples

```bash
# Clean all generated files
kodrdriv clean

# Clean with dry run to see what would be deleted
kodrdriv clean --dry-run
```

## Select Audio Command

Interactively select and configure audio device for recording:

```bash
kodrdriv select-audio
```

The `select-audio` command helps you choose and configure the microphone device to use for audio commands (`audio-commit` and `audio-review`). It saves the selected device configuration to your preferences directory.

This command will:
1. List available audio input devices on your system
2. Allow you to interactively select your preferred microphone
3. Test the selected device to ensure it works
4. Save the configuration to `~/.unplayable/config.json`

**Note**: You must run this command before using any audio features for the first time.

### Examples

```bash
# Configure audio device
kodrdriv select-audio

# View configuration process in debug mode
kodrdriv select-audio --debug
```

## Utility Commands

KodrDriv also includes these utility commands for configuration management:

### Check Config Flag

Validate your configuration setup:

```bash
kodrdriv --check-config
```

This flag validates your KodrDriv configuration files and reports any issues or missing required settings.

### Init Config Flag

Initialize configuration files:

```bash
kodrdriv --init-config
```

This flag creates initial configuration files with default settings in your project's `.kodrdriv`
