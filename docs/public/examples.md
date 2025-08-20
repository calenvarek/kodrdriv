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
kodrdriv commit --context "Refactoring for performance"
```

Work with staged changes only:
```bash
git add src/components/
kodrdriv commit --cached
```

Handle dependency updates automatically:
```bash
npm install new-package
kodrdriv commit --sendit
# Automatically detects and commits package-lock.json changes
```

Work with excluded files in different scenarios:
```bash
# Interactive mode with suggestions
kodrdriv commit
# If only excluded files changed, provides guidance on including them

# Dry-run for excluded files
kodrdriv commit --dry-run
# Generates template message even for excluded-only changes

# Manual exclusion control
kodrdriv commit --exclude "node_modules" "dist"
# Includes critical files while excluding build artifacts
```

**GitHub Issues Integration Examples:**

```bash
# Large feature implementation - GitHub issues provide valuable context
git add -A
kodrdriv commit "implement user authentication system"
# Output: Commit message references relevant issues like "Fixes #42, addresses #56"
# The AI understands which issues your changes solve

# Working on a specific release milestone
# Issues from release/1.2.0 milestone get priority when version is 1.2.0-dev.0
kodrdriv commit --interactive
# Shows generated commit with issue references, allows you to review and edit

# Even without GitHub access, commits work normally
# (No GITHUB_TOKEN set or API failure)
kodrdriv commit --sendit
# Generates commit based on code changes only, no GitHub context

# Complex bugfix addressing multiple issues
git add src/auth/ src/security/ tests/
kodrdriv commit "security improvements for authentication"
# Generated message explains which specific bugs were fixed based on GitHub issues
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
kodrdriv release
```

Use custom context for quarterly release:
```bash
kodrdriv release --context "Quarterly release, focus on stability"
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
kodrdriv link --scope-roots '{"@company": "../"}'
```

Real-world example: linking @company packages from company directory:
```bash
kodrdriv link --scope-roots '{"@company": "../../company/"}'
```

## Advanced Examples

### Using Custom Instructions

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
kodrdriv commit --exclude "*.lock" "dist/" "node_modules/"
```

Exclude patterns from release notes:
```bash
kodrdriv release --exclude "package-lock.json"
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

### Model Configuration Examples

**Use different models for different commands via CLI:**
```bash
# Use GPT-4 for important commit messages
kodrdriv commit --model gpt-4o --context "Critical bug fix"

# Use faster model for routine operations
kodrdriv review --model gpt-4o-mini

# Override global config for specific release
kodrdriv release --model gpt-4o --context "Major version release"
```

**Command-specific model configuration:**
```yaml
# .kodrdriv/config.yaml
model: gpt-4o-mini          # Global default (cost-effective)

commit:
  model: gpt-4o             # High-quality commit messages

release:
  model: gpt-4o             # Detailed release notes

review:
  model: gpt-4o-mini        # Fast reviews for regular use
```

**Usage scenarios:**
```bash
# These commands will use the models specified in config:
kodrdriv commit              # Uses gpt-4o (from commit.model)
kodrdriv release             # Uses gpt-4o (from release.model)
kodrdriv review              # Uses gpt-4o-mini (from review.model)

# CLI overrides still work:
kodrdriv commit --model gpt-4o-mini  # Overrides commit.model setting
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

1. Make changes across packages
2. Generate commit messages for each package:
   ```bash
   cd package-a
   kodrdriv commit --context "Cross-package refactoring"
   cd ../package-b
   kodrdriv commit --context "Cross-package refactoring"
   ```

### Workspace Build and Publish Workflow

1. **Analyze workspace structure** (dry run to preview):
   ```bash
   kodrdriv tree --directory ./packages --cmd "npm run build"
   ```

2. **Build all packages in dependency order**:
   ```bash
   kodrdriv tree --cmd "npm run build" --exclude "**/test-*/**"
   ```

3. **Test packages after build**:
   ```bash
   kodrdriv tree --cmd "npm run test"
   ```

4. **Publish all packages with dependency awareness**:
   ```bash
   kodrdriv tree publish
   ```

5. **Resume from failed package** (if publish fails):
   ```bash
   kodrdriv tree publish --start-from failed-package-name
   ```

### Complex Workspace Management

**Multi-step workspace processing**:
```bash
# 1. Clean all packages
kodrdriv tree --cmd "npm run clean" --directory ./workspace

# 2. Install dependencies in correct order
kodrdriv tree --cmd "npm ci"

# 3. Build packages with exclusions
kodrdriv tree \
  --cmd "npm run build" \
  --exclude "**/examples/**,**/*-demo,**/node_modules/**"

# 4. Run quality checks
kodrdriv tree --cmd "npm run lint && npm run test"

# 5. Publish packages
kodrdriv tree publish --start-from core-lib
```

**Incremental workspace updates**:
```bash
# Update only packages starting from a specific one
kodrdriv tree \
  --cmd "npm update" \
  --start-from api-client \
  --exclude "**/legacy-*/**"
```

## Environment-Specific Examples

### CI/CD Pipeline

**Basic CI/CD setup:**
```bash
# Set required environment variables
export GITHUB_TOKEN="your-token"
export OPENAI_API_KEY="your-key"
export NODE_AUTH_TOKEN="your-npm-token"

# Run publish command in CI with workflow awareness
kodrdriv publish --verbose
```

**Repository with GitHub Actions:**
```bash
# Automated publish that waits for all workflows
kodrdriv publish --sendit

# Custom timeout for long-running workflows
kodrdriv publish --sendit  # with checksTimeout: 900000 in config
```

**Repository without CI/CD workflows:**
```bash
# Skip all confirmations for repositories without workflows
kodrdriv publish --sendit

# Or configure to auto-proceed when no workflows detected
# In .kodrdriv/config.json:
# {
#   "publish": {
#     "skipUserConfirmation": true
#   }
# }
kodrdriv publish
```

**Advanced CI/CD with release workflows:**
```bash
# Wait for specific deployment workflows after release
kodrdriv publish
# Configured with:
# {
#   "publish": {
#     "releaseWorkflowNames": ["deploy-production", "update-docs"],
#     "releaseWorkflowsTimeout": 1200000
#   }
# }
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
# Update dependencies and commit automatically
npm update
kodrdriv commit --sendit --context "Routine dependency updates"
# Automatically includes package-lock.json and generates appropriate commit message

# Update dependencies with manual review
npm install @types/node@latest
kodrdriv commit
# If only package-lock.json changed, provides options to include it

# Update and stage everything including lockfiles
npm update
kodrdriv commit --add --sendit "update all dependencies"
# Stages all changes and commits, handling excluded files automatically
```

### Documentation Updates

```bash
# Update documentation
git add docs/
kodrdriv commit --context "Updating API documentation"
```

## Configuration Examples

### Personal Configuration

`.kodrdriv/config.yaml`:
```yaml
model: gpt-4o-mini
verbose: true
commit:
  messageLimit: 5
  model: gpt-4o  # Use more powerful model for commit messages
excludedPatterns:
  - "*.lock"
  - dist/
  - .DS_Store
```

### Team Configuration

`.kodrdriv/config.yaml`:
```yaml
model: gpt-4o-mini      # Default model for most operations
commit:
  model: gpt-4o         # Use powerful model for commit messages
release:
  model: gpt-4o         # Use powerful model for release notes
review:
  model: gpt-4o-mini    # Use faster model for reviews
publish:
  mergeMethod: squash
  dependencyUpdatePatterns:
    - "@company/*"
  requiredEnvVars:
    - NODE_AUTH_TOKEN
    - CODECOV_TOKEN
  targetBranch: main
link:
  scopeRoots:
    "@company": "../"
    "@shared": "../../shared-packages/"
  externals:
    - "@somelib"
    - "lodash"
    - "@external/*"
```

### Project-Specific Configuration

```yaml
contextDirectories:
  - src
  - docs
  - tests
release:
  messageLimit: 15
excludedPatterns:
  - coverage/
  - "*.generated.ts"
  - build/
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
# "prepublishOnly": "npm run lint && npm run build && npm run test"
```

### Dry Run for Safety

```bash
# Always test with dry run first
kodrdriv publish --dry-run
kodrdriv link --scope-roots '{"@company": "../"}' --dry-run
```
