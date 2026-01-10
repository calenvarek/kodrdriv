# Usage Guide

Common workflows and command patterns for kodrdriv.

## Daily Workflows

### Basic Commit Workflow

```bash
# Make changes
# ... edit files ...

# Stage changes
git add .

# Generate and commit
kodrdriv commit --sendit
```

**With review**:
```bash
kodrdriv commit --interactive
# → Review message
# → Edit if needed
# → Confirm to commit
```

### Release Workflow

```bash
# Generate release notes
kodrdriv release

# Review output
cat output/RELEASE_NOTES.md

# If satisfied, create release
gh release create v1.0.0 --notes-file output/RELEASE_NOTES.md
```

**Automated**:
```bash
# Does everything: notes, PR, merge, tag, release
kodrdriv publish
```

### Review Workflow

```bash
# Analyze review notes
kodrdriv review "Need to refactor auth module for better testability"

# Creates GitHub issues automatically
kodrdriv review --sendit < review-notes.txt
```

## Advanced Workflows

### Using Context Files

Pass documentation for better context:

```bash
# For commits
kodrdriv commit \
  --context-files docs/ARCHITECTURE.md \
  --sendit

# For releases
kodrdriv release \
  --context-files IMPLEMENTATION.md BREAKING-CHANGES.md \
  --interactive

# Multiple files combined
kodrdriv release \
  --context-files $(find docs -name "*.md") \
  --self-reflection
```

### Self-Reflection Analysis

Generate detailed reports about AI analysis:

```bash
# Enable self-reflection
kodrdriv commit --self-reflection

# Check the report
cat output/agentic-reflection-commit-*.md
```

**Report includes**:
- Tools used and their effectiveness
- Execution timeline
- Performance metrics
- Conversation history
- Recommendations for improvement

### Split Commit Suggestions

Let AI suggest splitting complex changes:

```bash
kodrdriv commit \
  --allow-commit-splitting \
  --self-reflection

# AI may suggest:
# Split 1: Authentication changes
# Split 2: Database migration
# Split 3: Documentation updates
```

### Interactive Refinement

Review and improve AI output:

```bash
# Interactive mode
kodrdriv commit --interactive
# → Review message
# → Edit manually or
# → Improve with AI feedback
# → Confirm

kodrdriv release --interactive
# → Review notes
# → Edit or improve
# → Accept or cancel
```

## Monorepo Workflows

### Link Packages for Development

```bash
# Link all packages
kodrdriv tree link

# Work on code...

# Unlink when done
kodrdriv tree unlink
```

### Multi-Package Operations

```bash
# Run precommit checks across all packages
kodrdriv tree precommit

# Commit all packages
kodrdriv tree commit

# Publish in dependency order
kodrdriv tree publish --parallel
```

### Selective Operations

```bash
# Start from specific package
kodrdriv tree publish --start-from @myorg/core

# Stop before specific package
kodrdriv tree publish --stop-at @myorg/ui

# Skip packages
kodrdriv tree publish --skip @myorg/experimental

# Resume after failure
kodrdriv tree publish --continue
```

## Audio-Driven Workflows

### Setup (One-Time)

```bash
# Configure microphone
kodrdriv select-audio
```

### Voice Commits

```bash
# Record audio describing changes
kodrdriv audio-commit
# → Records audio
# → Transcribes with Whisper
# → Generates commit message
# → Optionally commits
```

### Voice Reviews

```bash
# Record review notes
kodrdriv audio-review --sendit
# → Records audio
# → Transcribes
# → Analyzes for issues
# → Creates GitHub issues
```

### Audio from File

```bash
# Use pre-recorded audio
kodrdriv audio-commit --file recording.m4a

# Process directory of recordings
kodrdriv audio-review --directory recordings/
```

## Configuration Workflows

### Project-Specific Prompts

Create custom prompts in `.kodrdriv/`:

```bash
# Create directory
mkdir -p .kodrdriv/personas

# Add custom persona
cat > .kodrdriv/personas/committer.md << 'EOF'
You are a senior engineer who writes concise, technical commit messages.
Focus on the "why" behind changes, not just the "what".
EOF

# Use with overrides
kodrdriv commit --overrides
```

### Per-Command Configuration

```yaml
# .kodrdriv/config.yaml
commit:
  model: gpt-4o-mini      # Fast, cheap for commits
  maxAgenticIterations: 8

release:
  model: gpt-4o            # Better quality for releases
  maxAgenticIterations: 35
  selfReflection: true

review:
  model: gpt-4o
  includeCommitHistory: true
```

### Environment-Based Configuration

```bash
# Development
export KODRDRIV_CONFIG=.kodrdriv/config.dev.yaml
kodrdriv commit

# Production
export KODRDRIV_CONFIG=.kodrdriv/config.prod.yaml
kodrdriv publish
```

## Integration Examples

### Example 1: Feature Branch Workflow

```bash
# Create feature branch
git checkout -b feature/user-auth

# Work and commit frequently
# ... make changes ...
kodrdriv commit --sendit

# ... more changes ...
kodrdriv commit --sendit

# Ready for PR
git push origin feature/user-auth

# Generate comprehensive release notes for PR description
kodrdriv release --from main --to feature/user-auth
```

### Example 2: Release Workflow

```bash
# On main branch, ready to release
git checkout main
git pull

# Generate release notes
kodrdriv release --context-files CHANGELOG.md

# Review
cat output/RELEASE_NOTES.md

# If good, publish
kodrdriv publish
# → Creates PR
# → Waits for checks
# → Merges
# → Tags
# → Creates GitHub release
# → Bumps version
```

### Example 3: Hotfix Workflow

```bash
# Create hotfix branch
git checkout -b hotfix/security-patch main

# Make fix
# ... edit files ...

# Quick commit
kodrdriv commit --sendit --max-agentic-iterations 5

# Fast release
kodrdriv publish --sendit
```

### Example 4: Monorepo Release

```bash
# Link packages for development
kodrdriv tree link

# Make changes across packages
# ... edit multiple packages ...

# Run checks
kodrdriv tree precommit

# Publish all updated packages
kodrdriv tree publish \
  --parallel \
  --max-concurrency 3 \
  --context-files MIGRATION-GUIDE.md
```

## Debugging Workflows

### Verbose Logging

```bash
# See what's happening
kodrdriv commit --verbose

# Even more detail
kodrdriv commit --debug

# Save debug output
kodrdriv commit --debug 2>&1 | tee debug.log
```

### Debug AI Interactions

```bash
# Enable debug files
kodrdriv commit --debug

# Check generated files
ls output/
# request-*.json - What was sent to OpenAI
# response-*.json - What came back
```

### Test Configuration

```bash
# Verify config merging
kodrdriv --check-config --verbose

# Test specific command config
kodrdriv commit --dry-run --verbose

# Check all merged options
kodrdriv --check-config | grep -A 50 commit
```

## Optimization Workflows

### Cost Optimization

```bash
# Use cheaper model for simple tasks
kodrdriv commit --model gpt-4o-mini

# Reduce iterations for speed
kodrdriv commit --max-agentic-iterations 5

# Configure in yaml for permanent change
```

**Cost comparison**:
- gpt-4o-mini: $0.15 / 1M input tokens
- gpt-4o: $2.50 / 1M input tokens
- ~17x cheaper for simple commits

### Speed Optimization

```bash
# Reduce context
kodrdriv commit --message-limit 5

# Smaller diffs
kodrdriv commit --max-diff-bytes 10240

# Fewer iterations
kodrdriv commit --max-agentic-iterations 6
```

### Quality Optimization

```bash
# More iterations for complex changes
kodrdriv release --max-agentic-iterations 50

# Better model
kodrdriv release --model gpt-4o

# Rich context
kodrdriv release \
  --context-files docs/*.md \
  --self-reflection
```

## Common Patterns

### Pattern: Commit Often, Release Weekly

```bash
# Daily: Quick commits
kodrdriv commit --sendit

# Friday: Weekly release
kodrdriv release --context-files WEEKLY-SUMMARY.md
kodrdriv publish
```

### Pattern: Feature Branches with Context

```bash
# Document your feature
echo "## Implementation Notes" > FEATURE-NOTES.md
# ... document as you work ...

# Commit with context
kodrdriv commit --context-files FEATURE-NOTES.md --sendit

# Release with context
kodrdriv release --context-files FEATURE-NOTES.md
```

### Pattern: Automated CI/CD

```yaml
# .github/workflows/release.yml
- name: Auto-Release
  run: |
    kodrdriv publish --sendit --self-reflection
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Pattern: Manual Approval Gates

```bash
# Generate but don't commit
kodrdriv commit > commit-msg.txt

# Review
cat commit-msg.txt

# Commit manually if approved
git commit -F commit-msg.txt
```

## Tips & Best Practices

### 1. Use Dry Run First

Always preview before making changes:
```bash
kodrdriv commit --dry-run
kodrdriv publish --dry-run
```

### 2. Enable Self-Reflection

Improve AI quality over time:
```bash
kodrdriv commit --self-reflection
# Review reports to understand AI decision-making
```

### 3. Pass Context Files

For complex changes, provide context:
```bash
kodrdriv release --context-files \
  IMPLEMENTATION.md \
  ARCHITECTURE.md \
  BREAKING-CHANGES.md
```

### 4. Use Interactive Mode

Review and refine before committing:
```bash
kodrdriv commit --interactive
kodrdriv release --interactive
```

### 5. Configure Per-Project

Different projects have different needs:
```yaml
# API project - focus on breaking changes
release:
  focus: "API changes and breaking changes"

# Library project - focus on features
release:
  focus: "new features and performance improvements"

# Internal tool - be concise
commit:
  maxAgenticIterations: 6
```

## Next Steps

- **[Commands Reference](./commands.md)** - Detailed command documentation
- **[Configuration Guide](./configuration.md)** - All configuration options
- **[AI System Guide](./ai-system.md)** - How AI analysis works
- **[Debugging Guide](./debugging.md)** - Troubleshooting help

## Quick Reference Card

```
┌─ Commit ─────────────────────────────┐
│ kodrdriv commit [--sendit]           │
│ + --interactive   Review before commit│
│ + --self-reflection   Analysis report│
│ + --context-files FILES   Add context│
└──────────────────────────────────────┘

┌─ Release ────────────────────────────┐
│ kodrdriv release                     │
│ + --interactive   Review notes       │
│ + --context-files FILES   Add context│
│ + --self-reflection   Analysis report│
└──────────────────────────────────────┘

┌─ Publish ────────────────────────────┐
│ kodrdriv publish [--sendit]          │
│ + --target-version VERSION   Override│
│ + --context-files FILES   Add context│
└──────────────────────────────────────┘

┌─ Tree ───────────────────────────────┐
│ kodrdriv tree COMMAND                │
│ + --parallel   Parallel execution    │
│ + --directories DIRS   Target dirs   │
│ + --continue   Resume after failure  │
└──────────────────────────────────────┘
```




