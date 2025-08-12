# Release Command

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

> [!TIP]
> ### Interactive Release Notes with --interactive
>
> Use the `--interactive` flag to review and refine generated release notes before saving them. This mode presents the AI-generated release notes and offers four options: **Confirm** and save immediately, **Edit** the notes in your default editor (with separate title and body editing), **Skip** and abort the generation, or **Improve** the notes using AI feedback. Interactive mode requires a terminal (TTY) and is ideal for important releases where you want to ensure the quality and accuracy of your release documentation.

## Command Options

- `--from <from>`: Branch or reference to generate release notes from (default: automatically detected - tries `main`, then `master`, then `origin/main`)
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--interactive`: Present the generated release notes for interactive review and editing
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
- `--focus <focus>`: Provide specific focus or theme for the release notes generation. This helps guide the AI to emphasize particular aspects or areas of the changes.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the release notes prompt (default: 50). Reducing this number can make the summary more focused, while increasing it provides broader historical context.
- `--max-diff-bytes <bytes>`: Maximum bytes per file in diff analysis (default: 2048). See [Diff Size Management](#diff-size-management) for details.

## Diff Size Management

KodrDriv automatically manages large diffs when generating release notes to prevent LLM token limit issues and ensure reliable generation.

### How It Works

When analyzing changes between releases, KodrDriv applies intelligent file-by-file diff truncation:

1. **Per-file limits**: Each file's diff is limited to `maxDiffBytes` (default: 2KB)
2. **Large file handling**: Files exceeding the limit show a summary message instead of full diff
3. **Total size protection**: Prevents the combined diff from becoming excessively large
4. **Smart truncation**: Maintains diff headers and structure while omitting verbose content

### Adaptive Retry System

If the LLM request fails due to size limits, KodrDriv automatically:

1. **Reduces diff size**: Progressively cuts the `maxDiffBytes` limit by 50% per retry
2. **Regenerates prompt**: Creates a new prompt with the smaller diff
3. **Maintains context**: Preserves commit history and release focus
4. **Minimum threshold**: Never reduces below 512 bytes to ensure meaningful context

### Configuration

```bash
# Set custom diff size limit for large releases
kodrdriv release --max-diff-bytes 4096

# Use larger limit for detailed release analysis
kodrdriv release --max-diff-bytes 8192

# Use smaller limit for very large codebases
kodrdriv release --max-diff-bytes 1024
```

You can also configure this in your `.kodrdriv/config.json`:

```json
{
  "release": {
    "maxDiffBytes": 4096
  }
}
```

### When Diff Truncation Occurs

KodrDriv will log when truncation happens:

```
Applied diff truncation: 45230 bytes -> 20480 bytes (limit: 2048 bytes)
[SUMMARY: 8 files omitted due to size limits. Original diff: 45230 bytes, processed diff: 20480 bytes]
```

Individual large files show:
```
... [CHANGE OMITTED: File too large (12540 bytes > 2048 limit)] ...
```

This ensures you always get comprehensive release notes, even for very large releases with extensive changes.

## Examples

```bash
# Generate release notes using auto-detected default reference to HEAD
kodrdriv release

# Generate release notes between specific versions
kodrdriv release --from v1.0.0 --to v1.1.0

# Interactive mode for refined release notes
kodrdriv release --interactive --from v1.0.0 --to v1.1.0

# Release notes for feature branch
kodrdriv release --from main --to feature/new-auth

# Release notes with additional context
kodrdriv release --context "Major security update with breaking changes"

# Interactive release notes with context and focus
kodrdriv release --interactive --context "Major release" --focus "Performance and security"

# Release notes with specific focus
kodrdriv release --focus "Performance improvements and bug fixes"

# Focused release notes with limited history
kodrdriv release --message-limit 20

# Dry-run to preview without entering interactive mode
kodrdriv release --interactive --dry-run
```

### Interactive Mode Examples

```bash
# Basic interactive release notes - review and refine AI-generated notes
kodrdriv release --interactive

# Interactive with specific version range
kodrdriv release --interactive --from v2.0.0 --to v2.1.0

# Interactive with custom context for major releases
kodrdriv release --interactive --context "Breaking changes and new features"

# Interactive with focused theme
kodrdriv release --interactive --focus "Security enhancements and bug fixes"
```

#### Interactive Mode Options

When using `--interactive`, you'll see the generated release notes and can choose:

- **`c` (Confirm)**: Use the notes as-is and save them immediately
- **`e` (Edit)**: Open the notes in your default editor (`$EDITOR`, `$VISUAL`, or `vi`) for manual editing. The first line becomes the title, and the rest becomes the body.
- **`s` (Skip)**: Abort the release notes generation without saving
- **`i` (Improve)**: Ask the AI to refine and improve the current release notes

> **Note**: Interactive mode requires a terminal (TTY). It won't work with piped input. Use `--dry-run` to preview release notes when running in scripts or automated environments.
