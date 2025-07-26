# Commit Command

Generate intelligent commit messages using AI analysis of your code changes:

```bash
kodrdriv commit
```

The commit command analyzes your changes and generates contextual commit messages using AI. It can work with both staged and unstaged changes.

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

## Command Options

- `--add`: Add all changes to the index before committing (runs `git add -A`)
- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review (default: false)
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the prompt for context (default: 50)

## Examples

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
