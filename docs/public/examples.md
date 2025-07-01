# Examples

This section provides practical examples of using KodrDriv commands in various scenarios.

## Basic Usage Examples

### Commit Examples

Basic commit message generation:
```bash
kodrdriv commit
```

Generate a commit message and automatically commit it:
```bash
kodrdriv commit --sendit
```

Use custom context and message limit:
```bash
kodrdriv commit --context "Refactoring for performance" --message-limit 5
```

Work with staged changes only:
```bash
git add src/components/
kodrdriv commit --cached
```

### Release Examples

Basic release notes generation:
```bash
kodrdriv release
```

Generate release notes for a specific range:
```bash
kodrdriv release --from v1.0.0 --to v1.1.0
```

Include both git log and diff information:
```bash
kodrdriv release --content-types log diff
```

Use custom context for quarterly release:
```bash
kodrdriv release --context "Quarterly release, focus on stability" --message-limit 20
```

### Publish Examples

Basic publish with default settings:
```bash
kodrdriv publish
```

Publish with different merge methods:
```bash
# Use merge commit (preserves individual commits)
kodrdriv publish --merge-method merge

# Use rebase (clean linear history)
kodrdriv publish --merge-method rebase
```

### Link Examples

Basic linking with single scope:
```bash
kodrdriv link --scope-roots '{"@company": "../"}'
```

Multiple scopes with different root directories:
```bash
kodrdriv link --scope-roots '{"@company": "../", "@tools": "../../tools/"}'
```

Dry run to preview changes:
```bash
kodrdriv link --scope-roots '{"@company": "../"}' --dry-run --verbose
```

Custom workspace file:
```bash
kodrdriv link --scope-roots '{"@company": "../"}' --workspace-file "workspace.yaml"
```

Real-world example: linking @company packages from company directory:
```bash
kodrdriv link --scope-roots '{"@company": "../../company/"}'
```

## Advanced Examples

### Using Custom Instructions

Use custom instructions from a file:
```bash
kodrdriv release --instructions ./my-custom-instructions.md
```

Enable instruction overrides (requires custom instruction files in `.kodrdriv/instructions/`):
```bash
kodrdriv commit --overrides
```

Use custom config directory with overrides:
```bash
kodrdriv release --config-dir ~/my-kodrdriv-config --overrides
```

### Excluding Patterns

Exclude specific files or directories from diff analysis:
```bash
kodrdriv commit --excluded-paths "*.lock" "dist/" "node_modules/"
```

Exclude patterns from release notes:
```bash
kodrdriv release --excluded-paths "package-lock.json" "pnpm-lock.yaml"
```

### Verbose and Debug Mode

Run in verbose mode with a custom OpenAI model:
```bash
kodrdriv commit --verbose --model gpt-4
```

Enable debug logging:
```bash
kodrdriv release --debug
```

### Configuration Debugging

Check current configuration (useful for debugging):
```bash
kodrdriv --check-config
```

## Workflow Examples

### Development Workflow

1. Make changes to your code
2. Stage the changes you want to commit:
   ```bash
   git add src/components/Button.tsx
   ```
3. Generate and commit with a message:
   ```bash
   kodrdriv commit --cached --sendit
   ```

### Release Workflow

1. Generate release notes for review:
   ```bash
   kodrdriv release --dry-run
   ```
2. Generate and save release notes:
   ```bash
   kodrdriv release
   ```
3. Automated publish process:
   ```bash
   kodrdriv publish
   ```

### Monorepo Development Workflow

1. Link local packages for development:
   ```bash
   kodrdriv link --scope-roots '{"@company": "../", "@tools": "../../tools/"}'
   ```
2. Make changes across packages
3. Generate commit messages for each package:
   ```bash
   cd package-a
   kodrdriv commit --context "Cross-package refactoring"
   cd ../package-b
   kodrdriv commit --context "Cross-package refactoring"
   ```

## Environment-Specific Examples

### CI/CD Pipeline

```bash
# Set required environment variables
export GITHUB_TOKEN="your-token"
export OPENAI_API_KEY="your-key"
export NODE_AUTH_TOKEN="your-npm-token"

# Run publish command in CI
kodrdriv publish --verbose
```

### Local Development

```bash
# Load environment from .env file
# (KodrDriv automatically loads .env files)

# Use specific model for local development
kodrdriv commit --model gpt-4o-mini --verbose
```

### Team Collaboration

```bash
# Use team-specific configuration
kodrdriv commit --config-dir ./.team-kodrdriv

# Generate release notes with team context
kodrdriv release --context ./team-context.md
```

## Real-World Scenarios

### Feature Development

```bash
# Start working on a feature
git checkout -b feature/user-authentication

# Make incremental commits with context
kodrdriv commit --context "Implementing user authentication system"
kodrdriv commit --context "Adding password validation"
kodrdriv commit --context "Integrating with OAuth provider"

# Generate comprehensive release notes
kodrdriv release --from main --to feature/user-authentication
```

### Bug Fix

```bash
# Quick bug fix with automatic commit
git add src/utils/validation.ts
kodrdriv commit --sendit --context "Fixing validation bug #123"
```

### Dependency Updates

```bash
# Update dependencies and commit
pnpm update
kodrdriv commit --context "Routine dependency updates"
```

### Documentation Updates

```bash
# Update documentation
git add docs/
kodrdriv commit --context "Updating API documentation"
```

## Configuration Examples

### Personal Configuration

`.kodrdriv/config.json`:
```json
{
  "model": "gpt-4o-mini",
  "verbose": true,
  "commit": {
    "messageLimit": 5
  },
  "excludedPatterns": [
    "*.lock",
    "dist/",
    ".DS_Store"
  ]
}
```

### Team Configuration

`.kodrdriv/config.json`:
```json
{
  "model": "gpt-4o-mini",
  "publish": {
    "mergeMethod": "squash",
    "dependencyUpdatePatterns": ["@company/*"],
    "requiredEnvVars": ["NODE_AUTH_TOKEN", "CODECOV_TOKEN"]
  },
  "link": {
    "scopeRoots": {
      "@company": "../",
      "@shared": "../../shared-packages/"
    }
  }
}
```

### Project-Specific Configuration

```json
{
  "contextDirectories": ["src", "docs", "tests"],
  "release": {
    "messageLimit": 15
  },
  "excludedPatterns": [
    "coverage/",
    "*.generated.ts",
    "build/"
  ]
}
```

## Error Handling Examples

### Missing Environment Variables

```bash
# This will fail with helpful error message
kodrdriv publish
# Error: Missing required environment variables: GITHUB_TOKEN, OPENAI_API_KEY

# Set the variables and retry
export GITHUB_TOKEN="your-token"
export OPENAI_API_KEY="your-key"
kodrdriv publish
```

### Missing prepublishOnly Script

```bash
# This will fail if package.json doesn't have prepublishOnly script
kodrdriv publish
# Error: prepublishOnly script is required in package.json

# Add script to package.json and retry
# "prepublishOnly": "pnpm run lint && pnpm run build && pnpm run test"
```

### Dry Run for Safety

```bash
# Always test with dry run first
kodrdriv publish --dry-run
kodrdriv link --scope-roots '{"@company": "../"}' --dry-run
``` 