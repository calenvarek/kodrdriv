# Commands Reference

Quick reference for all kodrdriv commands.

For complete documentation, see: [`docs/public/commands.md`](../docs/public/commands.md)

## Core Commands

### commit
Generate intelligent commit messages.

```bash
kodrdriv commit [direction] [options]
```

**Common options**:
- `--sendit` - Auto-commit without review
- `--interactive` - Review and edit before committing
- `--context-files FILES` - Pass context files
- `--self-reflection` - Generate analysis report
- `--add` - Stage all changes first
- `--cached` - Use staged changes
- `--amend` - Amend last commit
- `--push [remote]` - Push after committing

**Examples**:
```bash
# Basic usage
kodrdriv commit --sendit

# With context
kodrdriv commit "fixing auth bug" --sendit

# With context files
kodrdriv commit --context-files IMPL.md --interactive

# Review first
kodrdriv commit --interactive
```

[Full Documentation](../docs/public/commands/commit.md)

### release
Generate comprehensive release notes.

```bash
kodrdriv release [options]
```

**Common options**:
- `--from REF` - Start reference (default: last tag)
- `--to REF` - End reference (default: HEAD)
- `--context-files FILES` - Pass context files
- `--self-reflection` - Generate analysis report
- `--interactive` - Review and edit notes
- `--no-milestones` - Disable milestone integration
- `--from-main` - Compare against main instead of tag

**Examples**:
```bash
# Basic usage
kodrdriv release

# With context
kodrdriv release --context-files CHANGELOG.md

# Custom range
kodrdriv release --from v1.0.0 --to v1.1.0

# Interactive review
kodrdriv release --interactive --self-reflection
```

[Full Documentation](../docs/public/commands/release.md)

### publish
Automate complete release workflow.

```bash
kodrdriv publish [options]
```

**What it does**:
1. Generates release notes
2. Creates pull request
3. Waits for CI checks
4. Merges to target branch
5. Creates GitHub release
6. Bumps to next dev version

**Common options**:
- `--sendit` - Skip all confirmations
- `--target-version VERSION` - Override version
- `--context-files FILES` - Pass context files
- `--interactive` - Review release notes
- `--merge-method METHOD` - merge/squash/rebase
- `--from REF` - Start reference
- `--target-branch BRANCH` - Target branch (default: main)

**Examples**:
```bash
# Interactive release
kodrdriv publish --interactive

# Automated release
kodrdriv publish --sendit

# With context
kodrdriv publish --context-files MIGRATION.md

# Patch release
kodrdriv publish --target-version patch

# From specific tag
kodrdriv publish --from v1.0.0
```

[Full Documentation](../docs/public/commands/publish.md)

## Audio Commands

### audio-commit
Record audio for commit context.

```bash
kodrdriv audio-commit [options]
```

**Examples**:
```bash
# Record and commit
kodrdriv audio-commit --sendit

# Use existing file
kodrdriv audio-commit --file recording.m4a
```

[Full Documentation](../docs/public/commands/audio-commit.md)

### audio-review
Record audio for code review.

```bash
kodrdriv audio-review [options]
```

**Examples**:
```bash
# Record review
kodrdriv audio-review --sendit

# Process file
kodrdriv audio-review --file review.m4a
```

[Full Documentation](../docs/public/commands/audio-review.md)

### review
Analyze text for project issues.

```bash
kodrdriv review [note] [options]
```

**Examples**:
```bash
# Inline note
kodrdriv review "Need to add error handling in API layer"

# From file
kodrdriv review --file notes.txt --sendit

# From stdin
cat review.txt | kodrdriv review --sendit
```

[Full Documentation](../docs/public/commands/review.md)

## Tree Commands

### tree
Execute commands across multiple packages.

```bash
kodrdriv tree [command] [options]
```

**Built-in commands**:
- `commit` - Generate commits for all packages
- `publish` - Publish all packages in order
- `precommit` - Run checks across packages
- `link` - Create local development links
- `unlink` - Remove local links
- `run` - Custom command (use --cmd)

**Common options**:
- `--parallel` - Execute in parallel
- `--max-concurrency N` - Limit parallelism
- `--directories DIRS` - Target directories
- `--continue` - Resume after failure
- `--status` - Check execution status

**Examples**:
```bash
# Sequential publish
kodrdriv tree publish

# Parallel publish
kodrdriv tree publish --parallel --max-concurrency 4

# Custom command
kodrdriv tree --cmd "npm test"

# Resume after failure
kodrdriv tree publish --continue

# Link for development
kodrdriv tree link
```

### link / unlink
Manage local package dependencies.

```bash
kodrdriv link [package]
kodrdriv unlink [package]
```

**Examples**:
```bash
# Link all in tree
kodrdriv tree link

# Link specific scope
kodrdriv link @myorg

# Unlink all
kodrdriv tree unlink
```

[Full Documentation](../docs/public/commands/link.md)

## Utility Commands

### precommit
Run lint + build + test.

```bash
kodrdriv precommit
```

Uses optimization to skip unchanged steps.

### clean
Remove output directory.

```bash
kodrdriv clean
```

Removes all generated files.

### select-audio
Configure audio recording device.

```bash
kodrdriv select-audio
```

One-time setup for audio commands.

## Global Options

Available on all commands:

| Option | Purpose |
|--------|---------|
| `--dry-run` | Preview without changes |
| `--verbose` | Detailed logging |
| `--debug` | Maximum logging + debug files |
| `--model MODEL` | Override AI model |
| `--openai-reasoning LEVEL` | Set reasoning depth (low/medium/high) |
| `-d, --context-directories DIRS` | Add context directories |
| `--config-dir DIR` | Specify config directory |
| `--output-dir DIR` | Override output directory |

## Command Combinations

### Development Workflow

```bash
# Daily work
kodrdriv commit --sendit

# Weekly release
kodrdriv release --context-files WEEKLY-NOTES.md
```

### Release Workflow

```bash
# Test locally
kodrdriv release --dry-run --self-reflection

# Generate notes
kodrdriv release --context-files CHANGELOG.md

# Publish
kodrdriv publish --interactive
```

### Monorepo Workflow

```bash
# Setup
kodrdriv tree link

# Develop
kodrdriv tree precommit

# Release
kodrdriv tree publish --parallel --context-files MIGRATION.md

# Cleanup
kodrdriv tree unlink
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 130 | User cancellation (Ctrl+C) |

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI authentication | Yes |
| `GITHUB_TOKEN` | GitHub API authentication | For publish |
| `KODRDRIV_CONFIG` | Config file path | No |

## Quick Command Reference

```
┌─ Generate ───────────────────────────┐
│ commit       Commit messages         │
│ release      Release notes           │
│ review       Issue analysis          │
└──────────────────────────────────────┘

┌─ Automate ───────────────────────────┐
│ publish      Complete release flow   │
│ tree         Multi-package operations│
└──────────────────────────────────────┘

┌─ Audio ──────────────────────────────┐
│ audio-commit    Voice-driven commits │
│ audio-review    Voice-driven reviews │
│ select-audio    Configure device     │
└──────────────────────────────────────┘

┌─ Utilities ──────────────────────────┐
│ precommit    Lint + build + test     │
│ link/unlink  Package management      │
│ clean        Remove output files     │
└──────────────────────────────────────┘
```

## Next Steps

- **[Usage Guide](./usage.md)** - Common patterns
- **[Configuration Guide](./configuration.md)** - All options
- **[AI System Guide](./ai-system.md)** - How AI works
- **[Integration Guide](./integration.md)** - Setup for your project

For detailed command documentation, see the [`docs/public/commands/`](../docs/public/commands/) directory.




