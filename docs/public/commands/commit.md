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

# Execute with parallel processing
kodrdriv tree commit --parallel

# Resume from a specific package if one fails
kodrdriv tree commit --start-from my-package
```

### Tree Mode Benefits

- **Configuration Isolation**: Each package uses its own `.kodrdriv` configuration
- **Dependency Awareness**: Packages are processed in dependency order
- **Individual Git Context**: Each package maintains its own git history and context
- **Parallel Execution**: Independent packages can commit simultaneously when using `--parallel`

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
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the prompt for context (default: 50)
- `--skip-file-check`: Skip check for file: dependencies before committing (useful in CI/CD environments where local file dependencies are expected)
- `--max-diff-bytes <maxDiffBytes>`: Maximum bytes per file to include in diff analysis (default: 2048). Larger files will be summarized rather than included in full.

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
- Provides helpful guidance on using `--excluded-paths` or `--sendit`

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

# Interactive mode for refined commit messages
kodrdriv commit --interactive "implement user authentication"

# Pipe complex direction from file
cat requirements.txt | kodrdriv commit

# Add all changes and commit automatically
kodrdriv commit --add --sendit "initial implementation"

# Interactive mode with staged changes and context
git add src/auth.ts
kodrdriv commit --cached --interactive --context "Part of security improvements"

# Limit commit history context
kodrdriv commit --message-limit 5 "quick fix"
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
# Output:   kodrdriv commit --excluded-paths "node_modules" "dist" "*.log"
# Output: Or run with --sendit to automatically include critical files.

# Auto-commit dependency updates with --sendit
npm install some-package
kodrdriv commit --sendit
# Automatically detects and commits package-lock.json changes

# Generate template for excluded files in dry-run mode
kodrdriv commit --dry-run
# Generates commit message template even when only excluded files changed

# Manually include specific excluded files
kodrdriv commit --excluded-paths "node_modules" "dist"
# Includes package-lock.json and other critical files while still excluding build artifacts

# Combine with add flag for dependency updates
npm update
kodrdriv commit --add --sendit "update dependencies"
# Stages all changes and auto-commits, including critical files if needed
```
