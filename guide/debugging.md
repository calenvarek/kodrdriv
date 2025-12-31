# Debugging Guide

Troubleshooting common issues with kodrdriv.

## Diagnostic Commands

### Quick Checks

```bash
# Verify installation
kodrdriv --version

# Check configuration
kodrdriv --check-config

# Test with dry-run
kodrdriv commit --dry-run

# Enable verbose logging
kodrdriv commit --verbose

# Maximum debugging detail
kodrdriv commit --debug
```

### Debug Output Locations

| File | Purpose |
|------|---------|
| `output/request-*.json` | AI requests sent (with --debug) |
| `output/response-*.json` | AI responses received (with --debug) |
| `output/agentic-reflection-*.md` | Analysis reports (with --self-reflection) |
| `output/*-commit-message.md` | Generated commit messages |
| `output/*-release-notes.md` | Generated release notes |
| `.kodrdriv-context` | Tree execution state |

## Common Issues

### 1. "OpenAI API key is required"

**Symptom**: Error on any command

**Solution**:
```bash
# Check if set
echo $OPENAI_API_KEY

# Set temporarily
export OPENAI_API_KEY="sk-your-key"

# Set permanently (add to ~/.zshrc or ~/.bashrc)
echo 'export OPENAI_API_KEY="sk-your-key"' >> ~/.zshrc
source ~/.zshrc
```

### 2. "No changes to commit"

**Symptom**: Command runs but says no changes

**Diagnosis**:
```bash
# Check git status
git status

# Check staged changes
git diff --cached

# Check unstaged changes
git diff
```

**Solutions**:
```bash
# Stage changes first
git add .
kodrdriv commit

# Or use --add to auto-stage
kodrdriv commit --add --sendit

# For specific files
git add file1.ts file2.ts
kodrdriv commit
```

### 3. Command Hangs or Times Out

**Symptom**: Command runs but never completes

**Diagnosis**:
```bash
# Run with verbose
kodrdriv commit --verbose

# Check iteration count
kodrdriv commit --debug 2>&1 | grep "iteration"
```

**Solutions**:
```bash
# Reduce iterations
kodrdriv commit --max-agentic-iterations 5

# Use faster model
kodrdriv commit --model gpt-4o-mini

# Reduce diff size
kodrdriv commit --max-diff-bytes 5120

# Set tool timeout
kodrdriv commit --tool-timeout 5000
```

### 4. "file: dependencies found"

**Symptom**: Commit blocked due to `file:` dependencies in package.json

**Why**: Protection against committing local dev links

**Solutions**:
```bash
# Unlink before committing
kodrdriv unlink
kodrdriv commit --sendit

# Or bypass check (not recommended)
kodrdriv commit --skip-file-check --sendit

# Or configure to skip
# In .kodrdriv/config.yaml:
commit:
  skipFileCheck: true
```

### 5. "Cannot find module @eldrforge/..."

**Symptom**: Module not found errors

**Solutions**:
```bash
# For global install
npm install -g @eldrforge/kodrdriv

# For local install
cd /path/to/kodrdriv
npm install
npm link

# Check installation
which kodrdriv
npm list -g @eldrforge/kodrdriv
```

### 6. AI Output is Poor Quality

**Symptoms**:
- Generic messages
- Missing context
- Incorrect understanding

**Diagnosis**:
```bash
# Generate with self-reflection
kodrdriv commit --self-reflection

# Check the report
cat output/agentic-reflection-commit-*.md

# Look for:
# - Low tool usage (< 3 tools)
# - Tool failures
# - Short iteration count
```

**Solutions**:
```bash
# Provide more context
kodrdriv commit --context "Refactoring for testability"

# Pass context files
kodrdriv commit --context-files docs/IMPL.md

# Increase iterations
kodrdriv commit --max-agentic-iterations 12

# Use better model
kodrdriv commit --model gpt-4o
```

### 7. GitHub API Errors

**Symptoms**:
- "Resource not accessible"
- "Bad credentials"
- "Not found"

**Diagnosis**:
```bash
# Check token
echo $GITHUB_TOKEN

# Test token
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user

# Check repository
git remote -v
```

**Solutions**:
```bash
# Set token
export GITHUB_TOKEN="ghp-your-token"

# Verify repository remote
git remote get-url origin

# Test without GitHub
kodrdriv commit --dry-run  # Doesn't need GitHub
```

### 8. Tree Command Failures

**Symptom**: Tree publish fails mid-execution

**Diagnosis**:
```bash
# Check status
kodrdriv tree publish --status

# Check detailed state
cat .kodrdriv-context
```

**Solutions**:
```bash
# Resume from checkpoint
kodrdriv tree publish --continue

# Skip failed package
kodrdriv tree publish --skip @org/failing-package

# Mark as completed manually
kodrdriv tree publish --promote @org/completed-package

# Retry failed packages
kodrdriv tree publish --retry-failed

# Start fresh
rm .kodrdriv-context
kodrdriv tree publish
```

### 9. Configuration Not Loading

**Symptom**: Settings in config file ignored

**Diagnosis**:
```bash
# Check what config is loaded
kodrdriv --check-config

# Check config file syntax
cat .kodrdriv/config.yaml
```

**Solutions**:
```bash
# Verify YAML syntax
# Use proper indentation (spaces, not tabs)

# Verify file location
ls -la .kodrdriv/

# Test with explicit config
kodrdriv commit --config-dir .kodrdriv

# Check for typos in keys
kodrdriv --check-config | grep commit
```

### 10. Parallel Execution Issues

**Symptom**: Tree publish fails in parallel mode

**Diagnosis**:
```bash
# Check parallel status
kodrdriv tree publish --status-parallel

# Run with verbose
kodrdriv tree publish --parallel --verbose
```

**Solutions**:
```bash
# Reduce concurrency
kodrdriv tree publish --parallel --max-concurrency 2

# Disable parallel
kodrdriv tree publish  # Sequential

# Check logs for specific package
ls output/*.log
cat output/package-name-*.log
```

## Debugging Workflows

### Debug Workflow 1: AI Investigation

```bash
# Run with self-reflection
kodrdriv commit --self-reflection --verbose

# Examine report
cat output/agentic-reflection-commit-*.md

# Check:
# - How many tools were used?
# - Were there tool failures?
# - What was the conversation flow?
# - Did it reach max iterations?
```

### Debug Workflow 2: Configuration Issues

```bash
# Step 1: Check config loading
kodrdriv --check-config --verbose

# Step 2: Check specific command config
kodrdriv commit --dry-run --verbose

# Step 3: Test with CLI override
kodrdriv commit --model gpt-4o --dry-run

# Step 4: Verify precedence
# CLI args > config file > defaults
```

### Debug Workflow 3: Integration Problems

```bash
# Test each component separately

# 1. Git integration
git status
git diff --cached

# 2. OpenAI integration
kodrdriv commit --dry-run --debug
# Check output/request-*.json

# 3. GitHub integration
kodrdriv release --no-milestones --dry-run

# 4. File system
ls -la output/
cat output/RELEASE_NOTES.md
```

## Debug Flags

### --dry-run

Preview without making changes:
```bash
kodrdriv commit --dry-run
kodrdriv publish --dry-run
```

Shows exactly what would happen.

### --verbose

Detailed logging:
```bash
kodrdriv commit --verbose
```

Shows:
- Configuration loading
- Git operations
- AI requests
- Tool executions

### --debug

Maximum detail:
```bash
kodrdriv commit --debug
```

Shows everything plus:
- Full prompts
- API request/response
- Token counts
- Timing information

Saves:
- `output/request-*.json`
- `output/response-*.json`

### --self-reflection

Analysis reports:
```bash
kodrdriv commit --self-reflection
```

Generates:
- Tool effectiveness metrics
- Execution timeline
- Conversation history
- Recommendations

## Performance Debugging

### Slow Commands

**Diagnosis**:
```bash
# Run with timing
time kodrdriv commit --verbose

# Check self-reflection
kodrdriv commit --self-reflection
# Look for slow tools in report
```

**Solutions**:
```bash
# Reduce iterations
kodrdriv commit --max-agentic-iterations 6

# Smaller diffs
kodrdriv commit --max-diff-bytes 8192

# Faster model
kodrdriv commit --model gpt-4o-mini

# Set tool timeouts
kodrdriv commit --tool-timeout 3000
```

### High API Costs

**Diagnosis**:
```bash
# Check which model is used
kodrdriv --check-config | grep model

# Check iteration counts
# View self-reflection reports
```

**Solutions**:
```yaml
# Use cheaper model
model: gpt-4o-mini

# Reduce iterations
commit:
  maxAgenticIterations: 6

release:
  maxAgenticIterations: 20

# Limit history
commit:
  messageLimit: 5
```

## Logging Levels

Control verbosity in config or CLI:

```yaml
# Minimal output
verbose: false
debug: false

# Standard output
verbose: true
debug: false

# Maximum output
verbose: true
debug: true
```

Or via CLI:
```bash
kodrdriv commit              # Standard
kodrdriv commit --verbose    # Detailed
kodrdriv commit --debug      # Everything
```

## Error Messages

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "API key required" | Missing env var | Set OPENAI_API_KEY |
| "No changes" | Nothing staged | Run git add first |
| "file: dependencies" | Local symlinks | Run kodrdriv unlink |
| "Not a git repository" | Wrong directory | cd to git repo |
| "Rate limit exceeded" | Too many requests | Wait or reduce usage |
| "Context length exceeded" | Diff too large | Use --max-diff-bytes |
| "Module not found" | Installation issue | npm install -g kodrdriv |
| "Permission denied" | File access | Check file permissions |
| "Network error" | Connection issue | Check internet/firewall |

## Getting Help

### Self-Diagnosis

1. **Check environment**:
```bash
node --version      # Need 18+
git --version
which kodrdriv
```

2. **Check configuration**:
```bash
kodrdriv --check-config
```

3. **Run diagnostics**:
```bash
kodrdriv commit --dry-run --verbose
```

### Collect Debug Information

When reporting issues:

```bash
# Generate debug bundle
kodrdriv commit --debug --dry-run 2>&1 | tee debug-output.txt

# Include:
# - debug-output.txt
# - output/request-*.json
# - output/response-*.json
# - output/agentic-reflection-*.md
# - .kodrdriv/config.yaml
# - kodrdriv --version output
```

### Review Implementation Docs

Check `/Users/tobrien/gitw/calenvarek/` for detailed guides:
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Parallel execution issues
- `RECOVERY-FIXES.md` - Recovery mechanisms
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - AI system details

## Debug Checklist

When something doesn't work:

- [ ] Check environment variables are set
- [ ] Verify git repository state
- [ ] Test with --dry-run first
- [ ] Enable --verbose logging
- [ ] Check output directory for files
- [ ] Review configuration with --check-config
- [ ] Try --debug for maximum detail
- [ ] Generate self-reflection report
- [ ] Check error message carefully
- [ ] Review relevant implementation docs

Most issues can be diagnosed with `--verbose` and resolved with proper configuration.

## Next Steps

- **[Configuration Guide](./configuration.md)** - Fix config issues
- **[AI System Guide](./ai-system.md)** - Understand AI behavior
- **[Commands Reference](./commands.md)** - Command-specific help
- **[Development Guide](./development.md)** - Extend or modify kodrdriv

