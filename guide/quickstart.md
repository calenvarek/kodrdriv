# Quick Start Guide

Get kodrdriv working in 5 minutes.

## Prerequisites

- Node.js v18+ installed
- Git repository with changes
- OpenAI API key
- (Optional) GitHub token for publish features

## Installation

```bash
npm install -g @eldrforge/kodrdriv
```

## Setup

### 1. Set Environment Variables

```bash
export OPENAI_API_KEY="sk-your-openai-key-here"
export GITHUB_TOKEN="ghp-your-github-token-here"  # Optional, for publish
```

Add to your shell profile (~/.zshrc, ~/.bashrc) to persist.

### 2. Initialize Configuration

```bash
# Create config files
kodrdriv --init-config

# Verify setup
kodrdriv --check-config
```

This creates `.kodrdriv/config.yaml` in your project.

## First Commands

### Generate a Commit Message

```bash
# Make some changes
echo "test" >> README.md

# Stage changes
git add README.md

# Generate commit message
kodrdriv commit
```

**Output**: AI-generated commit message based on your changes.

**To auto-commit**:
```bash
kodrdriv commit --sendit
```

### Generate Release Notes

```bash
# Generate notes for changes since last tag
kodrdriv release

# Preview without saving
kodrdriv release --dry-run
```

**Output**: Comprehensive release notes in Markdown format.

### Try Self-Reflection

```bash
# See how the AI analyzed your changes
kodrdriv commit --self-reflection

# Check the report
cat output/agentic-reflection-commit-*.md
```

**Output**: Detailed report showing which tools were used and how effective they were.

## Basic Configuration

Edit `.kodrdriv/config.yaml`:

```yaml
# Global settings
model: gpt-4o
outputDirectory: output

# Commit settings
commit:
  selfReflection: true
  maxAgenticIterations: 10

# Release settings
release:
  selfReflection: true
  maxAgenticIterations: 30
```

## Common Workflows

### Daily Development

```bash
# Work on features
# ... make changes ...

# When ready to commit
git add .
kodrdriv commit --sendit
```

### Before a Release

```bash
# Generate release notes
kodrdriv release --context-files CHANGELOG.md

# Review and refine
kodrdriv release --interactive
```

### Automated Release

```bash
# Complete workflow (notes, PR, merge, tag, release)
kodrdriv publish
```

## Verification

### Test Your Setup

```bash
# Dry run mode (no changes made)
kodrdriv commit --dry-run

# Verbose logging
kodrdriv commit --verbose

# Debug logging (very detailed)
kodrdriv commit --debug
```

### Check Configuration

```bash
# Show merged configuration
kodrdriv --check-config

# Test with a small change
echo "test" >> test.txt
git add test.txt
kodrdriv commit --dry-run
git reset HEAD test.txt
rm test.txt
```

## Next Steps

You now have kodrdriv working! Learn more:

- **[Usage Guide](./usage.md)** - Common patterns and workflows
- **[Commands Reference](./commands.md)** - All available commands
- **[Configuration Guide](./configuration.md)** - Advanced configuration
- **[Integration Guide](./integration.md)** - Integrate into your project

## Troubleshooting

### "OpenAI API key is required"
```bash
# Check if set
echo $OPENAI_API_KEY

# Set it
export OPENAI_API_KEY="your-key"
```

### "No changes to commit"
```bash
# Make sure you've staged changes
git add .

# Or use --add to auto-stage
kodrdriv commit --add --sendit
```

### "Cannot find module"
```bash
# Reinstall globally
npm install -g @eldrforge/kodrdriv

# Or link for development
cd /path/to/kodrdriv
npm link
```

### Command Times Out
```bash
# Increase iteration limit
kodrdriv commit --max-agentic-iterations 15

# Or use simpler model
kodrdriv commit --model gpt-4o-mini
```

## Tips

1. **Start with dry-run** to see what will happen
2. **Use --verbose** to understand what's going on
3. **Enable self-reflection** to improve results
4. **Pass context files** for complex changes
5. **Check output directory** for generated files

You're ready to use kodrdriv! 🚀

