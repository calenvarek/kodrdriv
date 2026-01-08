# Integration Guide

How to integrate kodrdriv into your project.

## Integration Patterns

### 1. Basic Git Workflow Integration

Replace manual commit messages with AI-generated ones:

**Before**:
```bash
git add .
git commit -m "fix: update user auth"
```

**After**:
```bash
git add .
kodrdriv commit --sendit
```

### 2. CI/CD Integration

#### GitHub Actions Example

```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install kodrdriv
        run: npm install -g @eldrforge/kodrdriv

      - name: Generate Release Notes
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          kodrdriv release --context-files CHANGELOG.md

      - name: Create Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Release notes are in output/RELEASE_NOTES.md
          gh release create v$(node -p "require('./package.json').version") \
            --notes-file output/RELEASE_NOTES.md
```

#### GitLab CI Example

```yaml
release:
  stage: deploy
  script:
    - npm install -g @eldrforge/kodrdriv
    - kodrdriv release
    - # Use generated notes in output/RELEASE_NOTES.md
  only:
    - main
```

### 3. Pre-Commit Hook Integration

Automatically generate commit messages:

**.git/hooks/prepare-commit-msg**:
```bash
#!/bin/bash
# Generate commit message with kodrdriv
if [ -z "$2" ]; then
  # Only for new commits (not amend)
  kodrdriv commit --cached > "$1"
fi
```

Make it executable:
```bash
chmod +x .git/hooks/prepare-commit-msg
```

### 4. npm Scripts Integration

Add to `package.json`:

```json
{
  "scripts": {
    "commit": "kodrdriv commit --sendit",
    "release:notes": "kodrdriv release",
    "release:publish": "kodrdriv publish",
    "precommit": "kodrdriv precommit"
  }
}
```

Usage:
```bash
npm run commit
npm run release:publish
```

## Project Setup

### For Single Package Projects

1. **Install kodrdriv**:
```bash
npm install --save-dev @eldrforge/kodrdriv
# or globally
npm install -g @eldrforge/kodrdriv
```

2. **Initialize configuration**:
```bash
kodrdriv --init-config
```

3. **Configure for your project**:
```yaml
# .kodrdriv/config.yaml
model: gpt-4o
outputDirectory: output

commit:
  sendit: false          # Require manual confirmation
  selfReflection: true   # Generate analysis reports

release:
  focus: "user-facing changes and breaking changes"
  maxAgenticIterations: 30
```

4. **Test it**:
```bash
kodrdriv commit --dry-run
kodrdriv release --dry-run
```

### For Monorepo Projects

1. **Install in root**:
```bash
cd /path/to/monorepo
npm install -g @eldrforge/kodrdriv
```

2. **Configure tree operations**:
```yaml
# .kodrdriv/config.yaml
tree:
  directories:
    - packages/core
    - packages/ui
    - packages/utils
  parallel: true
  maxConcurrency: 4
```

3. **Use tree commands**:
```bash
# Commit across all packages
kodrdriv tree commit

# Publish all in correct order
kodrdriv tree publish --parallel

# Link packages for development
kodrdriv tree link
```

## Integration with Existing Tools

### With Conventional Commits

Kodrdriv generates conventional commit format by default:

```bash
# Output follows conventional format
kodrdriv commit
# → feat: add user authentication
# → fix: resolve memory leak in cache
# → chore: update dependencies
```

### With Semantic Release

Use kodrdriv to generate release notes, then use semantic-release for publishing:

```json
{
  "scripts": {
    "release:notes": "kodrdriv release",
    "release:semantic": "semantic-release"
  }
}
```

### With Changesets

Generate release notes that complement changesets:

```bash
# Generate comprehensive notes
kodrdriv release --context-files .changeset/*.md

# Use alongside changesets
npx changeset version
kodrdriv release
npx changeset publish
```

### With Lerna/nx

Use kodrdriv's tree operations:

```bash
# Instead of lerna run
kodrdriv tree --cmd "npm test"

# Instead of lerna publish
kodrdriv tree publish --parallel
```

## Configuration Patterns

### Minimal Configuration

```yaml
model: gpt-4o-mini
outputDirectory: output
```

### Standard Configuration

```yaml
model: gpt-4o
outputDirectory: output

commit:
  selfReflection: true
  add: false

release:
  focus: "breaking changes and new features"
  selfReflection: true

publish:
  sendit: false
  targetBranch: main
```

### Advanced Configuration

```yaml
model: gpt-4o
openaiReasoning: medium
outputDirectory: output

contextDirectories:
  - docs
  - .github

commit:
  selfReflection: true
  maxAgenticIterations: 15
  allowCommitSplitting: true
  contextFiles:
    - docs/ARCHITECTURE.md

release:
  selfReflection: true
  maxAgenticIterations: 40
  focus: |
    Emphasize breaking changes and migration steps.
    Target audience: developers using this library.

publish:
  targetBranch: main
  mergeMethod: squash
  checksTimeout: 3600000
  waitForReleaseWorkflows: true

tree:
  parallel: true
  maxConcurrency: 4
  directories:
    - packages/core
    - packages/ui
```

## Team Workflows

### Small Team (1-5 developers)

```bash
# Each developer runs locally
kodrdriv commit --sendit

# Releases done by maintainer
kodrdriv publish --interactive
```

### Medium Team (5-20 developers)

```yaml
# .kodrdriv/config.yaml
commit:
  sendit: false           # Require review
  interactive: true       # Allow editing

release:
  interactive: true       # Team review before publish
  noMilestones: false     # Use GitHub milestones
```

### Large Team (20+ developers)

```yaml
# Stricter controls
commit:
  sendit: false
  skipFileCheck: false    # Prevent accidental commits

publish:
  sendit: false           # Manual approval required
  requireEnvVars:
    - GITHUB_TOKEN
    - OPENAI_API_KEY
    - RELEASE_APPROVER     # Custom check
```

## Environment-Specific Configuration

### Development

```yaml
# .kodrdriv/config.dev.yaml
dryRun: true
verbose: true
model: gpt-4o-mini
```

### Production

```yaml
# .kodrdriv/config.prod.yaml
dryRun: false
model: gpt-4o
release:
  selfReflection: true
publish:
  sendit: true
  skipUserConfirmation: true
```

Load with:
```bash
kodrdriv commit --config-dir .kodrdriv/config.prod.yaml
```

## Migration from Other Tools

### From semantic-release

**Before**:
```json
{
  "release": {
    "plugins": ["@semantic-release/commit-analyzer"]
  }
}
```

**After**: Remove semantic-release config, use kodrdriv:
```bash
kodrdriv publish
```

### From conventional-changelog

**Before**:
```bash
conventional-changelog -p angular -i CHANGELOG.md -s
```

**After**:
```bash
kodrdriv release
# Notes in output/RELEASE_NOTES.md
```

### From manual process

**Before**:
```bash
git log --oneline > notes.txt
# Manually write release notes
gh release create v1.0.0 --notes "..."
```

**After**:
```bash
kodrdriv publish  # Does everything
```

## Verification

### Test Your Integration

1. **Dry Run Test**:
```bash
kodrdriv commit --dry-run
kodrdriv release --dry-run
kodrdriv publish --dry-run
```

2. **Check Output**:
```bash
ls output/
# Should see timestamped files
```

3. **Verify Configuration**:
```bash
kodrdriv --check-config
```

4. **Test with Real Changes**:
```bash
echo "test" >> test.txt
git add test.txt
kodrdriv commit --verbose
git reset HEAD test.txt
rm test.txt
```

## Common Integration Patterns

### Pattern 1: Manual Commit, Auto Release

```yaml
commit:
  sendit: false           # Review commits manually

release:
  interactive: false      # Auto-generate notes

publish:
  sendit: true           # Fully automated
```

### Pattern 2: Auto Commit, Manual Release

```yaml
commit:
  sendit: true           # Auto-commit

release:
  interactive: true      # Review release notes

publish:
  sendit: false          # Manual approval
```

### Pattern 3: Full Automation

```yaml
commit:
  sendit: true

release:
  interactive: false

publish:
  sendit: true
  skipUserConfirmation: true
```

## Next Steps

- **[Usage Guide](./usage.md)** - Learn common workflows
- **[Commands Reference](./commands.md)** - All available commands
- **[Configuration Guide](./configuration.md)** - Advanced configuration options
- **[Debugging Guide](./debugging.md)** - Troubleshooting help

## Quick Tips

1. **Always start with --dry-run** to preview
2. **Use --verbose** to see what's happening
3. **Enable selfReflection** to improve quality
4. **Pass --context-files** for better context
5. **Check output/** directory for generated files

Your kodrdriv integration is complete! 🎉




