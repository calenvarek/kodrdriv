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

> [!TIP]
> ### Agentic Mode with --agentic
>
> Enable **agentic mode** with the `--agentic` flag for AI-powered release notes generation with tool-calling capabilities. In this mode, the AI can use 13 specialized tools to investigate changes, compare with previous releases, identify patterns, and detect breaking changes. Agentic mode is ideal for complex releases where you want deep analysis and comprehensive notes that go beyond surface-level summaries.
>
> **Key features:**
> - Investigates file history, dependencies, and test changes
> - Compares with previous releases to provide context
> - Identifies breaking changes and architectural shifts
> - Analyzes commit patterns to find themes
> - Default 30 iterations (vs 10 for commits) for thorough analysis
>
> **Combine with `--self-reflection`** to generate a detailed report showing which tools were used, their effectiveness, and recommendations for future improvements.

## Command Options

### Basic Options
- `--from <from>`: Branch or reference to generate release notes from (default: automatically detected - tries `main`, then `master`, then `origin/main`)
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--interactive`: Present the generated release notes for interactive review and editing
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation
- `--focus <focus>`: Provide specific focus or theme for the release notes generation
- `--max-diff-bytes <bytes>`: Maximum bytes per file in diff analysis (default: 2048). See [Diff Size Management](#diff-size-management) for details.

### Agentic Mode Options
- `--agentic`: Enable agentic mode with tool-calling for deep analysis of changes
- `--self-reflection`: Generate a self-reflection report with tool effectiveness analysis (requires `--agentic`)
- `--max-agentic-iterations <n>`: Maximum iterations for agentic mode (default: 30)

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

### Traditional Mode Examples

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

# Dry-run to preview without entering interactive mode
kodrdriv release --interactive --dry-run
```

### Agentic Mode Examples

```bash
# Basic agentic mode - AI investigates changes using tools
kodrdriv release --agentic

# Agentic mode with self-reflection report
kodrdriv release --agentic --self-reflection

# Agentic mode for major release with extended analysis
kodrdriv release --agentic --max-agentic-iterations 40 --from v1.0.0 --to v2.0.0

# Agentic + interactive for review and refinement
kodrdriv release --agentic --interactive

# Complete workflow: agentic analysis + self-reflection + interactive review
kodrdriv release --agentic --self-reflection --interactive --focus "Breaking changes"

# Agentic mode with custom context
kodrdriv release --agentic --context "Major refactoring release" --focus "Performance"

# Dry-run agentic mode to see what would be generated
kodrdriv release --agentic --dry-run
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

## Agentic Mode

Agentic mode enables AI-powered release notes generation with tool-calling capabilities, allowing the AI to actively investigate changes, understand context, and generate comprehensive release notes.

### How It Works

When you enable `--agentic`, the AI:

1. **Analyzes** the initial commit log and diff
2. **Investigates** specific changes using available tools
3. **Gathers context** by comparing with previous releases
4. **Identifies patterns** across multiple commits
5. **Detects** potential breaking changes
6. **Synthesizes** findings into comprehensive release notes

### Available Tools (13 total)

#### Investigation Tools (from commit generation)
- `get_file_history`: View commit history for files
- `get_file_content`: Read full file contents
- `search_codebase`: Search for patterns across the codebase
- `get_related_tests`: Find test files to understand functionality
- `get_file_dependencies`: Understand file dependencies and impact
- `analyze_diff_section`: Get expanded context around changes
- `get_recent_commits`: See recent commits to the same files
- `group_files_by_concern`: Identify logical groupings

#### Release-Specific Tools (unique to agentic release mode)
- `get_tag_history`: View previous release tags and versioning patterns
- `compare_previous_release`: Compare this release with previous versions
- `get_release_stats`: Get comprehensive statistics (commits, contributors, changes)
- `get_breaking_changes`: Identify potential breaking changes
- `analyze_commit_patterns`: Identify themes and patterns in commits

### When to Use Agentic Mode

Use agentic mode when:

- **Complex releases** with many interconnected changes
- **Major versions** where understanding scope is critical
- **Breaking changes** that need careful documentation
- **Pattern identification** across numerous commits
- **Context comparison** with previous releases is valuable
- **Thorough analysis** is more important than speed

Use traditional mode when:

- **Simple releases** with straightforward changes
- **Speed is critical** and basic notes are sufficient
- **Resource constraints** limit LLM API calls

### Self-Reflection Reports

Enable `--self-reflection` with `--agentic` to generate a detailed analysis report showing:

- **Execution Summary**: Iterations, tool calls, unique tools used
- **Tool Effectiveness**: Success rates, average duration, total time per tool
- **Tool Usage Insights**: Most used tools, slowest tools, failure analysis
- **Execution Patterns**: Efficiency metrics and timing analysis
- **Recommendations**: Actionable suggestions for improvement

Self-reflection reports are saved as `agentic-reflection-release-{timestamp}.md` in your output directory. These reports help you:

- Understand which tools provide the most value
- Identify performance bottlenecks
- Optimize future release note generation
- Debug issues when notes don't meet expectations

### Configuration

#### Iteration Limits

The default iteration limit for agentic release mode is **30** (vs 10 for commit messages), reflecting the greater complexity of release analysis.

```bash
# Use default (30 iterations)
kodrdriv release --agentic

# Increase for very complex releases
kodrdriv release --agentic --max-agentic-iterations 40

# Reduce for faster generation
kodrdriv release --agentic --max-agentic-iterations 20
```

You can also configure this in `.kodrdriv/config.yaml`:

```yaml
release:
  agentic: true
  selfReflection: true
  maxAgenticIterations: 35
```

#### Model Selection

Agentic mode benefits from more capable models:

```yaml
model: gpt-4o  # Recommended for agentic mode
# or
commands:
  release:
    model: gpt-4o
    reasoning: high  # For o1-style reasoning models
```

### Output Files

Agentic mode creates several output files:

1. **Release notes**: `release-notes-{timestamp}.md` - The generated release notes
2. **Self-reflection** (if enabled): `agentic-reflection-release-{timestamp}.md` - Analysis report
3. **Debug files** (if `--debug` is set):
   - `release-agentic-request-{timestamp}.json` - Request sent to LLM
   - `release-agentic-response-{timestamp}.json` - Response received from LLM

All files are saved to your configured output directory (default: `output/kodrdriv/`).

### Best Practices

1. **Start with agentic mode** for your first release to see what it can do
2. **Use self-reflection** to understand tool usage and optimize settings
3. **Combine with interactive mode** for final review and refinement
4. **Set appropriate iteration limits** based on release complexity
5. **Review self-reflection reports** to improve future releases
6. **Use `--focus`** to guide the AI's investigation
7. **Provide `--context`** for releases with special considerations
