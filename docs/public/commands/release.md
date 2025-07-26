# Release Command

Generate comprehensive release notes based on changes since the last release:

```bash
kodrdriv release
```

The release command analyzes changes between two Git references and generates structured release notes.

> [!TIP]
> ### Custom Release Range
>
> The `kodrdriv release` command supports customizing the range of commits to analyze using the `--from` and `--to` options. By default, it compares changes between `origin/HEAD` and `HEAD`, but you can specify any valid Git reference (branch, tag, or commit hash) for either endpoint. This flexibility allows you to generate release notes for specific version ranges or between different branches.

> [!TIP]
> ### Comparing Releases
>
> You can use the `--from` and `--to` options to generate release notes comparing two different releases. For example, to see what changed between v1.0.0 and v1.1.0, you could use `kodrdriv release --from v1.0.0 --to v1.1.0`. This is particularly useful for creating detailed changelogs when preparing release documentation.

## Command Options

- `--from <from>`: Branch or reference to generate release notes from (default: 'origin/HEAD')
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
- `--focus <focus>`: Provide specific focus or theme for the release notes generation. This helps guide the AI to emphasize particular aspects or areas of the changes.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the release notes prompt (default: 50). Reducing this number can make the summary more focused, while increasing it provides broader historical context.

## Examples

```bash
# Generate release notes from origin/HEAD to HEAD
kodrdriv release

# Generate release notes between specific versions
kodrdriv release --from v1.0.0 --to v1.1.0

# Release notes for feature branch
kodrdriv release --from main --to feature/new-auth

# Release notes with additional context
kodrdriv release --context "Major security update with breaking changes"

# Release notes with specific focus
kodrdriv release --focus "Performance improvements and bug fixes"

# Focused release notes with limited history
kodrdriv release --message-limit 20
```
