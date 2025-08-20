# Commit Command

Generate intelligent commit messages using AI analysis of your code changes:

```bash
kodrdriv commit
```

The commit command analyzes your changes and generates contextual commit messages using AI. It can work with both staged and unstaged changes.

## Tree Mode Execution

The commit command can be executed across multiple packages using the tree command:

```bash
# Execute commit across all packages in dependency order
kodrdriv tree commit



# Resume from a specific package if one fails
kodrdriv tree commit --start-from my-package
```

### Tree Mode Benefits

- **Configuration Isolation**: Each package uses its own `.kodrdriv` configuration
- **Dependency Awareness**: Packages are processed in dependency order
- **Individual Git Context**: Each package maintains its own git history and context


### Tree Mode vs Single Package

| Aspect | Single Package | Tree Mode |
|--------|---------------|-----------|
| **Scope** | Current directory only | All packages in workspace |
| **Configuration** | Single `.kodrdriv` config | Per-package configuration |
| **Git Context** | Single repository context | Individual package git context |
| **Execution** | Single commit operation | Multiple coordinated commits |
| **Error Handling** | Single failure point | Per-package error isolation |

### Tree Mode Configuration

Each package can have its own commit configuration:

```json
// .kodrdriv/config.json in each package
{
  "commit": {
    "messageLimit": 25,
    "context": "This package handles user authentication",
    "add": true
  }
}
```

For detailed tree mode documentation, see [Tree Built-in Commands](tree-built-in-commands.md#kodrdriv-tree-commit).

## GitHub Issues Integration

KodrDriv automatically enhances commit messages by analyzing recently closed GitHub issues, providing context and motivation for your changes. This is particularly valuable for large commits that may address multiple features or bug fixes.

### How It Works

When generating commit messages, KodrDriv:

1. **Reads your current version** from `package.json` (e.g., `0.1.1-dev.0`)
2. **Fetches recently closed GitHub issues** (last 10 issues by default)
3. **Prioritizes milestone-relevant issues** - issues tagged with milestones matching your current version (e.g., issues in milestone `release/0.1.1` when working on version `0.1.1-dev.0`)
4. **Provides context to the AI** about what problems your changes might be solving

### What This Enables

- **Better commit messages for large changes** - The AI understands WHY changes were made, not just WHAT changed
- **Automatic issue references** - Generated messages can include references like "Fixes #123" when appropriate
- **Context-aware descriptions** - Commit messages explain the motivation behind complex changes
- **Milestone awareness** - Changes are understood in the context of current release goals

### Example Output

Instead of a generic commit message like:
```
Update authentication system and fix timeout handling
```

You might get a more informative message like:
```
Fix authentication timeout and improve session handling (addresses #145, #167)

* Increase session timeout from 30min to 2hrs in config.ts (fixes #145)
* Add automatic token refresh logic in auth-service.ts (fixes #167)
* Update error handling for expired sessions in middleware.ts
* Add tests for extended session scenarios in auth.test.ts
```

### Requirements

- **GitHub repository** - Your project must be a GitHub repository
- **GitHub API access** - Requires `GITHUB_TOKEN` environment variable (see [Configuration](../configuration.md))
- **Milestones (optional)** - While milestones enhance the feature, it works without them

### Graceful Degradation

The GitHub issues integration is designed to never block commit message generation:

- **No GitHub token**: Continues without GitHub context
- **API failures**: Falls back to standard commit message generation
- **No milestones**: Uses general recently closed issues
- **No issues**: Generates commit messages based solely on code changes

### Configuration

No additional configuration is required - the feature works automatically when GitHub access is available. You can control the number of issues fetched by modifying the source code, though the default of 10 recent issues works well for most projects.

## Providing Direction

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

## Direction Flag (--direction)

The `--direction` flag provides the highest-priority guidance for commit message generation. It allows you to specify the focus, tone, or specific aspects you want emphasized in the generated commit message.

### Purpose and Usage

The `--direction` flag is designed to give you precise control over commit message generation by providing explicit guidance to the AI about what to emphasize or focus on in the commit message.

```bash
# Focus on stability and reliability
kodrdriv commit --direction "This commit focuses on caching stability; emphasise stability in message"

# Emphasize performance improvements
kodrdriv commit --direction "Highlight performance gains and optimization benefits"

# Specify a particular theme or context
kodrdriv commit --direction "Frame this as part of the security hardening initiative"
```

### Precedence and Processing

**Highest Priority Input**: The `--direction` flag is treated as the highest-priority prompt input, processed before other context sources like GitHub issues or commit history.

**Security and Sanitization**: Direction content is automatically sanitized to prevent template breakage:
- Newlines are converted to spaces
- Excessive whitespace is normalized
- Content is trimmed of leading/trailing whitespace
- Maximum length is enforced (default: 2,000 characters)

**Content Filtering**: While direction provides high-priority guidance, it may be modified or blocked by:
- Security filters that detect potentially harmful content
- Stop-word rules that prevent certain sensitive terms
- Length limits that truncate overly long directions

### Size Limits and Recommendations

**Maximum Length**: 2,000 characters (configurable)
**Recommended Length**: 1,000 characters or less for optimal results
**Truncation**: Longer directions are automatically truncated with "..." suffix

```bash
# Good: Concise and focused
kodrdriv commit --direction "Focus on the authentication bug fix and user impact"

# Good: Specific technical details
kodrdriv commit --direction "Emphasize the caching layer improvements and performance gains of 40% reduction in response time"

# Avoid: Overly verbose (will be truncated)
kodrdriv commit --direction "This is a very long direction that goes into excessive detail about every aspect of the changes and what should be emphasized in the commit message..."
```

### Examples

```bash
# Focus on user-facing improvements
kodrdriv commit --direction "Emphasize user experience improvements and interface enhancements"

# Highlight technical debt reduction
kodrdriv commit --direction "Frame as technical debt cleanup and code quality improvement"

# Specify conventional commit type
kodrdriv commit --direction "Use 'feat:' prefix and focus on the new feature capabilities"

# Combine with other flags
kodrdriv commit --direction "Focus on security improvements" --interactive
kodrdriv commit --direction "Emphasize performance gains" --sendit
```

### Troubleshooting

**Debug Direction Processing**: Enable debug logging to inspect how direction is processed:

```bash
# Set debug environment variable
export KODRDRIV_DEBUG=true

# Run commit with direction
kodrdriv commit --direction "test direction"

# Check logs for direction processing
# Look for: "Using user direction: [your direction]"
```

**Direction Not Applied**: If your direction doesn't seem to be reflected in the commit message:
1. Check debug logs to confirm direction was processed
2. Verify direction length is under 2,000 characters
3. Ensure direction doesn't contain blocked content
4. Consider using `--interactive` mode to review and refine the message

**Content Truncation**: If you see "..." in your direction, it was truncated due to length limits. Consider making your direction more concise.

> [!TIP]
> ### Direction vs Context
>
> While both `--direction` and `--context` provide guidance, they serve different purposes:
> - **Direction**: High-priority, focused guidance for message generation
> - **Context**: Additional background information and project context
>
> Use direction for specific commit message guidance, and context for broader project context.

> [!TIP]
> ### Working with Staged Changes
>
> When you have staged changes using `git add`, the `kodrdriv commit` command will automatically analyze the diff of your staged changes. This allows you to selectively stage files and generate a commit message that specifically addresses those changes, rather than all uncommitted changes in your working directory.

> [!TIP]
> ### Quick Commit with --sendit
>
> If you trust the quality of the generated commit messages, you can use the `--sendit` flag to automatically commit your changes with the generated message without review. This is useful for quick, routine changes where you want to streamline your workflow.

> [!TIP]
> ### Interactive Mode with --interactive
>
> Use the `--interactive` flag to review and refine generated commit messages before committing. This mode presents the AI-generated message and offers four options: **Confirm** and commit immediately, **Edit** the message in your default editor, **Skip** and abort the commit, or **Improve** the message using AI feedback. Interactive mode requires a terminal (TTY) and is perfect when you want to ensure commit message quality while leveraging AI assistance.

## Command Options

- `--add`: Add all changes to the index before committing (runs `git add -A`)
- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review (default: false)
- `--interactive`: Present the generated commit message for interactive review and editing
- `--amend`: Amend the last commit with the generated message instead of creating a new commit
- `--push [remote]`: Push the commit to remote after successful commit (default: origin when no remote specified)
- `--direction <direction>`: Provide high-priority guidance for commit message generation. This direction is treated as the highest-priority prompt input and can specify focus, tone, or specific aspects to emphasize. Maximum length: 2,000 characters (recommended: 1,000 or less).
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.

- `--skip-file-check`: Skip check for file: dependencies before committing (useful in CI/CD environments where local file dependencies are expected)
- `--max-diff-bytes <maxDiffBytes>`: Maximum bytes per file to include in diff analysis (default: 2048). Larger files will be summarized rather than included in full.

## Push Functionality

The `--push` option allows you to automatically push your commits to a remote repository after a successful commit. This is particularly useful for streamlining your workflow when you want to commit and push in a single command.

### Usage

**Push to origin (default):**
```bash
kodrdriv commit --sendit --push
```

**Push to a specific remote:**
```bash
kodrdriv commit --sendit --push upstream
kodrdriv commit --sendit --push origin
```

**Interactive mode with push:**
```bash
kodrdriv commit --interactive --sendit --push
```

**Dry run to see what would happen:**
```bash
kodrdriv commit --sendit --push --dry-run
```

### Configuration File Support

You can configure the push option in your `.kodrdriv/config.yaml` file:

```yaml
commit:
  sendit: true
  push: true  # Push to origin (default)
```

Or specify a custom remote:

```yaml
commit:
  sendit: true
  push: "upstream"  # Push to upstream remote
```

### Behavior

- **Requires `--sendit`**: The `--push` option only works when `--sendit` is enabled (since it needs to actually commit first)
- **Automatic execution**: Push happens automatically after a successful commit
- **Error handling**: If the push fails, the command will exit with an error message
- **Dry run support**: Shows what push command would be executed without actually running it
- **Remote validation**: Uses the specified remote or defaults to `origin`

### Examples

```bash
# Quick commit and push to origin
kodrdriv commit --sendit --push

# Commit and push to upstream
kodrdriv commit --sendit --push upstream

# Interactive commit with push
kodrdriv commit --interactive --sendit --push

# See what would happen (dry run)
kodrdriv commit --sendit --push --dry-run
```

## Working with Excluded Files

KodrDriv automatically excludes certain files from diff analysis to keep commit messages focused on meaningful changes. However, sometimes you may need to commit only excluded files (like dependency updates or configuration changes).

### Critical Files Detection

When no regular changes are detected, KodrDriv checks for changes to critical files that are normally excluded:

- `package-lock.json` - NPM dependency lockfile
- `yarn.lock` - Yarn dependency lockfile
- `bun.lockb` - Bun dependency lockfile
- `.gitignore` - Git ignore patterns
- `.env.example` - Environment template file

### Behavior in Different Modes

**Default Mode (Interactive)**:
- If only excluded files changed, suggests command-line options to include them
- Provides helpful guidance on using `--exclude` or `--sendit`

**SendIt Mode (`--sendit`)**:
- Automatically includes critical files when no other changes are detected
- Commits immediately with an appropriate message for the detected changes

**Dry Run Mode (`--dry-run`)**:
- Generates a template commit message even when only excluded files changed
- Useful for planning commits involving infrastructure changes

## Examples

```bash
# Basic commit message generation
kodrdriv commit

# Generate commit with direction
kodrdriv commit "refactor user authentication system"

# Use --direction flag for precise guidance
kodrdriv commit --direction "Focus on the authentication bug fix and user impact"

# Interactive mode for refined commit messages
kodrdriv commit --interactive "implement user authentication"

# Interactive mode with direction guidance
kodrdriv commit --interactive --direction "Emphasize performance improvements and optimization gains"

# Pipe complex direction from file
cat requirements.txt | kodrdriv commit

# Add all changes and commit automatically
kodrdriv commit --add --sendit "initial implementation"

# Add changes with direction guidance
kodrdriv commit --add --sendit --direction "Frame as security hardening and vulnerability fixes"

# Interactive mode with staged changes and context
git add src/auth.ts
kodrdriv commit --cached --interactive --context "Part of security improvements"

# Interactive mode with both direction and context
git add src/auth.ts
kodrdriv commit --cached --interactive --direction "Focus on authentication improvements" --context "Part of security improvements"

# Limit commit history context
kodrdriv commit "quick fix"

# Amend last commit with new direction
kodrdriv commit --amend --direction "Fix the commit message to be more descriptive and follow conventional commits"

# Quick commit and push to origin
kodrdriv commit --sendit --push

# Commit and push to specific remote
kodrdriv commit --sendit --push upstream

# Interactive commit with push
kodrdriv commit --interactive --sendit --push
```

### GitHub Issues Integration Examples

```bash
# Large commit addressing multiple features - GitHub issues provide context
git add -A
kodrdriv commit
# Output: Enhanced commit message referencing relevant closed issues from current milestone

# Working on a release version - issues from release/1.2.0 milestone are prioritized
# (when package.json version is 1.2.0-dev.0)
kodrdriv commit "implement feature set for v1.2.0"

# Even with API failures, commits still work
# Network error? No problem - generates commit message without GitHub context
kodrdriv commit --sendit "quick fix"

# Combined with interactive mode for reviewing GitHub issue context
kodrdriv commit --interactive
# Shows generated message with GitHub issue references, allows editing
```

### Interactive Mode Examples

```bash
# Basic interactive commit - review and refine AI-generated message
kodrdriv commit --interactive

# Interactive with direction for focused generation
kodrdriv commit --interactive "fix authentication bug"

# Interactive with add flag to stage all changes first
kodrdriv commit --add --interactive "implement new feature"

# Amend the last commit with a new AI-generated message
kodrdriv commit --amend

# Amend last commit with specific direction
kodrdriv commit --amend "fix the commit message to be more descriptive"

# Amend with interactive mode to review the new message
kodrdriv commit --amend --interactive

# Dry-run to preview without entering interactive mode
kodrdriv commit --interactive --dry-run
```

#### Interactive Mode Options

When using `--interactive`, you'll see the generated commit message and can choose:

- **`c` (Confirm)**: Use the message as-is and commit immediately
- **`e` (Edit)**: Open the message in your default editor (`$EDITOR`, `$VISUAL`, or `vi`) for manual editing
- **`s` (Skip)**: Abort the commit process without making any changes
- **`i` (Improve)**: Ask the AI to refine and improve the current message

> **Note**: Interactive mode requires a terminal (TTY). It won't work with piped input. Use `--dry-run` to preview messages when running in scripts or automated environments.

### Excluded Files Examples

```bash
# Scenario: Only package-lock.json changed after npm install
# Default mode provides suggestions
kodrdriv commit
# Output: No changes found with current exclusion patterns, but detected changes to critical files: package-lock.json
# Output: Consider including these files by using:
# Output:   kodrdriv commit --exclude "node_modules" "dist" "*.log"
# Output: Or run with --sendit to automatically include critical files.

# Auto-commit dependency updates with --sendit
npm install some-package
kodrdriv commit --sendit
# Automatically detects and commits package-lock.json changes

# Generate template for excluded files in dry-run mode
kodrdriv commit --dry-run
# Generates commit message template even when only excluded files changed

# Manually include specific excluded files
kodrdriv commit --exclude "node_modules" "dist"
# Includes package-lock.json and other critical files while still excluding build artifacts

# Combine with add flag for dependency updates
npm update
kodrdriv commit --add --sendit "update dependencies"
# Stages all changes and auto-commits, including critical files if needed
```
