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
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the prompt for context (default: 50)

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
kodrdriv commit --message-limit 5 "quick fix"
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
- `--message-limit <messageLimit>`: Limit the number of recent commit messages to include in context
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
> The `kodrdriv release` command supports customizing the range of commits to analyze using the `--from` and `--to` options. By default, it compares changes between the `main` branch and `HEAD`, but you can specify any valid Git reference (branch, tag, or commit hash) for either endpoint. This flexibility allows you to generate release notes for specific version ranges or between different branches.

> [!TIP]
> ### Comparing Releases
> 
> You can use the `--from` and `--to` options to generate release notes comparing two different releases. For example, to see what changed between v1.0.0 and v1.1.0, you could use `kodrdriv release --from v1.0.0 --to v1.1.0`. This is particularly useful for creating detailed changelogs when preparing release documentation.

### Release Command Options

- `--from <from>`: Branch or reference to generate release notes from (default: 'main')
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the release notes prompt (default: 50). Reducing this number can make the summary more focused, while increasing it provides broader historical context.

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
kodrdriv release --message-limit 20
```

## Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process. Here's what it does:

1. **Dependency Management**: If a `pnpm-workspace.yaml` file is present, it's temporarily renamed to switch from workspace dependencies to registry versions. It then runs `pnpm update --latest` to ensure dependencies are up to date. You can configure specific dependency patterns to update instead of updating all dependencies using the `dependencyUpdatePatterns` configuration option.

2. **Pre-flight Checks**: Before committing any changes, it runs the `prepublishOnly` script from your `package.json`. This script should contain your project's pre-flight checks (e.g., `clean`, `lint`, `build`, `test`) to ensure the project is in a good state. **Note**: A `prepublishOnly` script is required in your `package.json` - the publish command will fail if this script is not present.

3. **Release Commit**: If there are changes to `package.json` or `pnpm-lock.yaml`, it creates an intelligent commit message for the dependency updates.

4. **Version Bump**: It automatically bumps the patch version of your project.

5. **Release Notes**: It generates release notes based on the recent changes and saves them to `RELEASE_NOTES.md`.

6. **Pull Request Automation**:
   - It pushes the changes and tags to the origin.
   - It creates a new pull request for the release.
   - It waits for all status checks on the pull request to pass.
   - Once checks are complete, it automatically merges the pull request using the configured merge method (default: squash).

7. **GitHub Release**: After the PR is merged, it checks out the `main` branch, pulls the latest changes, and creates a new GitHub release with the tag and release notes.

8. **New Release Branch**: Finally, it creates and pushes a new release branch for the next version (e.g., `release/0.0.5`).

This command is designed for repositories that follow a pull-request-based release workflow with required status checks. It streamlines the process, reducing manual steps and potential for error.

### Publish Command Options

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'

### Examples

```bash
# Standard publish workflow
kodrdriv publish

# Publish with merge instead of squash
kodrdriv publish --merge-method merge

# Publish with rebase
kodrdriv publish --merge-method rebase
```

## Link Command

Manage pnpm workspace links for local development with sibling projects:

```bash
kodrdriv link
```

The `link` command automates the creation and management of pnpm workspace configurations for local development. It scans your project's dependencies and automatically discovers matching sibling packages in configured scope directories, then updates your `pnpm-workspace.yaml` file to link them for local development.

This is particularly useful when working with monorepos or related packages where you want to use local versions of dependencies instead of published registry versions during development.

### Link Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories for package discovery (required)
  - **Format**: `'{"@scope": "path", "@another": "path"}'`
  - **Example**: `'{"@company": "../", "@myorg": "../../packages/"}'`
- `--workspace-file <workspaceFile>`: Path to the workspace file to create/update (default: 'pnpm-workspace.yaml')

### Examples

```bash
# Link packages from sibling directories
kodrdriv link --scope-roots '{"@mycompany": "../", "@utils": "../../shared/"}'

# Link with custom workspace file
kodrdriv link --scope-roots '{"@myorg": "../"}' --workspace-file custom-workspace.yaml

# Link packages from multiple scope directories
kodrdriv link --scope-roots '{"@frontend": "../ui/", "@backend": "../api/", "@shared": "../common/"}'
```

## Unlink Command

Remove pnpm workspace links and rebuild dependencies from registry:

```bash
kodrdriv unlink
```

The `unlink` command removes workspace links created by the `link` command and restores dependencies to their published registry versions.

### Unlink Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories (same as link command)
- `--workspace-file <workspaceFile>`: Path to the workspace file to modify (default: 'pnpm-workspace.yaml')

### Examples

```bash
# Remove workspace links
kodrdriv unlink --scope-roots '{"@mycompany": "../"}'

# Unlink with custom workspace file
kodrdriv unlink --workspace-file custom-workspace.yaml
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
4. Save the configuration to `~/.kodrdriv/audio-device.yaml`

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

This flag creates initial configuration files with default settings in your project's `.kodrdriv` directory.

## Global Options

All commands support these global options:

- `--dry-run`: Perform a dry run without making changes
- `--verbose`: Enable verbose logging
- `--debug`: Enable debug logging with detailed output
- `--model <model>`: Specify OpenAI model to use (default: 'gpt-4o-mini')
- `--config-dir <configDir>`: Configuration directory path
- `--output-dir <outputDir>`: Output directory for generated files
- `--preferences-dir <preferencesDir>`: Preferences directory for personal settings
- `-d, --context-directories [dirs...]`: Additional directories to scan for context
- `--excluded-paths [patterns...]`: Paths to exclude from analysis

### Global Examples

```bash
# Run any command in dry-run mode
kodrdriv commit --dry-run

# Use verbose logging
kodrdriv review --verbose "performance issues"

# Use custom model
kodrdriv release --model gpt-4o

# Custom output directory
kodrdriv commit --output-dir ./my-output "bug fixes"

# Additional context directories
kodrdriv commit --context-directories src tests docs
``` 