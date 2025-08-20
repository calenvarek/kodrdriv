# Review Command

Analyze review notes for project issues and automatically create GitHub issues:

```bash
kodrdriv review
```

The review command takes text input (note) and analyzes it for potential issues, bugs, or improvements, then can automatically create GitHub issues.

## Providing Review Notes

You can provide review notes in several ways:

**Positional argument:**
```bash
kodrdriv review "The authentication flow is confusing and needs better error messages"
```

**STDIN (takes precedence over positional argument):**
```bash
echo "Need to improve performance in data processing" | kodrdriv review --sendit
cat my_review_notes.txt | kodrdriv review --sendit
```

**From a file:**
```bash
kodrdriv review --file review_notes.md
kodrdriv review --file /path/to/review.txt
```

**From a directory (processes multiple files):**
```bash
kodrdriv review --directory ./reviews/
kodrdriv review --directory /path/to/review-files --sendit
```

> [!NOTE]
> ### Directory Processing
>
> When using `--directory`, files are processed in alphabetical order. The command will prompt for confirmation before processing each file unless `--sendit` is specified.
>
> **Example directory structure:**
> ```
> reviews/
> ├── 01-auth-review.md
> ├── 02-performance.txt
> └── 03-ui-feedback.md
> ```
>
> Files will be processed in this order: `01-auth-review.md`, `02-performance.txt`, `03-ui-feedback.md`

> [!IMPORTANT]
> ### Piped Input Requires --sendit Flag
>
> When providing input via STDIN (pipe), you **must** include the `--sendit` flag because interactive prompts cannot be used in non-interactive mode:
> ```bash
> # ❌ This will fail
> echo "review note" | kodrdriv review
>
> # ✅ This works
> echo "review note" | kodrdriv review --sendit
> ```

**Interactive editor (opens automatically if no note is provided):**
```bash
kodrdriv review
# Opens your default editor with a template for entering review notes
```

## Editor Workflow

When you run `kodrdriv review` without providing review notes via argument or STDIN, KodrDriv will automatically open your default text editor to capture your input. This provides a comfortable environment for writing detailed review notes.

### How the Editor Workflow Works

1. **Editor Opens**: KodrDriv creates a temporary file with a helpful template and opens it in your configured editor
2. **Write Your Review**: Type your review notes in the editor, ignoring the template comments (lines starting with `#`)
3. **Save and Exit**: Save the file and close your editor as you normally would
4. **Processing Continues**: KodrDriv reads your notes and continues with the review analysis

> [!NOTE]
> ### Editor Timeout
>
> By default, the editor session has **no timeout** - you can take as much time as you need to craft your review note. If you want to set a timeout for safety, use the `--editor-timeout` option with a value in milliseconds (e.g., `--editor-timeout 300000` for 5 minutes).

### Configuring Your Editor

The editor used is determined by environment variables in this order:

1. `EDITOR` environment variable (most common)
2. `VISUAL` environment variable (fallback)
3. `vi` (default if no editor is configured)

**Set your preferred editor:**

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
export EDITOR="code --wait"    # VS Code (requires --wait flag)
export EDITOR="subl --wait"    # Sublime Text (requires --wait flag)
```

**Make it permanent by adding to your shell profile:**
```bash
# For bash users (~/.bashrc or ~/.bash_profile)
echo 'export EDITOR=vi' >> ~/.bashrc

# For zsh users (~/.zshrc)
echo 'export EDITOR=emacs' >> ~/.zshrc
```

> [!TIP]
> ### GUI Editor Configuration
>
> When using GUI editors like VS Code or Sublime Text, include the `--wait` flag to ensure the editor waits for you to close the file before KodrDriv continues processing:
> ```bash
> export EDITOR="code --wait"
> export EDITOR="subl --wait"
> ```

### Editor Template

When the editor opens, you'll see a template like this:

```
# Kodrdriv Review Note

# Please enter your review note below. Lines starting with "#" will be ignored.
# Save and close the editor when you are done.


```

Simply type your review notes below the template comments. Lines starting with `#` are ignored, so you can leave the template as-is or remove it entirely.

## Command Options

**Review Options:**
- `--context <context>`: Additional context for the review
- `--file <file>`: Read review note from a file
- `--directory <directory>`: Process all review files in a directory
- `--sendit`: Create GitHub issues automatically without confirmation
- `--editor-timeout <timeout>`: Timeout for editor in milliseconds (default: no timeout)

> [!NOTE]
> **Context Configuration Options**: The following options are available in configuration files only (not as CLI options):
> - `includeCommitHistory`: Include recent commit log messages in context (default: true)
> - `includeRecentDiffs`: Include recent commit diffs in context (default: true)
> - `includeReleaseNotes`: Include recent release notes in context (default: false)
> - `includeGithubIssues`: Include open GitHub issues in context (default: true)
> - `commitHistoryLimit`: Number of recent commits to include (default: 10)
> - `diffHistoryLimit`: Number of recent commit diffs to include (default: 5)
> - `releaseNotesLimit`: Number of recent release notes to include (default: 3)
> - `githubIssuesLimit`: Number of open GitHub issues to include, max 20 (default: 20)
>
> See the [Configuration Guide](../configuration.md) for details on setting these options in your config file.

## File Outputs

The review command automatically saves timestamped files to the output directory for reference:

- **Review notes and context**: Complete review input with all gathered context
- **Analysis results**: Formatted markdown with the AI analysis and identified issues
- **Debug files**: Request/response details when `--debug` is enabled

These files use timestamps in their names for easy identification and are saved to the configured output directory (default: `./output/`).

## Error Handling

The review command includes robust error handling:

- **Context gathering errors**: If some context sources fail (e.g., GitHub API unavailable), the command continues with available context and logs warnings
- **Validation errors**: Clear messages for missing inputs or configuration issues
- **File operation errors**: Safe handling of temporary files and permissions
- **Network errors**: Graceful handling of external service failures

## Examples

```bash
# Basic review analysis
kodrdriv review "The user interface needs improvement"

# Auto-create issues without confirmation
kodrdriv review --sendit "Critical security vulnerabilities found"

# Review from a file
kodrdriv review --file review_notes.md

# Process multiple review files in a directory
kodrdriv review --directory ./reviews/ --sendit

# Pipe detailed review from file (requires --sendit)
cat code_review.md | kodrdriv review --context "Sprint 2 review" --sendit

# Review from file with custom context
kodrdriv review --file sprint_review.md --context "Sprint 3 retrospective"
```
