# Agentic Publish: AI-Powered Publish Recovery

## Overview

The **Agentic Publish** feature brings AI-powered automatic diagnosis and recovery to the `kodrdriv publish` workflow. When publish operations fail due to common git issues (like branch synchronization problems), an AI agent can automatically investigate the problem and attempt to fix it.

## Problem It Solves

Consider this common scenario:

```bash
$ kodrdriv publish
error: BRANCH_SYNC_FAILED: Target branch not synchronized with remote
error: BRANCH_SYNC_DIVERGENCE: Local and remote commits differ
error: Local SHA: f4fcd33d | Remote SHA: 117e8c3c
```

Previously, you'd need to:
1. Manually diagnose what caused the divergence
2. Decide on the correct recovery strategy
3. Execute the appropriate git commands
4. Retry the publish

With **Agentic Publish**, the AI agent does this automatically.

## How It Works

When enabled, the agentic publish feature:

1. **Detects** publish-blocking issues during prechecks
2. **Analyzes** the problem using specialized diagnostic tools
3. **Investigates** the root cause (what commits diverged, why, etc.)
4. **Attempts** to fix the issue automatically using safe git operations
5. **Reports** what was done and whether manual intervention is needed

### Available Diagnostic Tools

The AI agent has access to these tools:

- `check_git_status` - Check repository status and uncommitted changes
- `check_branch_sync` - Verify if branches are synchronized with remote
- `analyze_divergence` - Analyze how branches have diverged
- `get_commit_log` - View commit history for investigation
- `get_branch_info` - Get detailed branch information
- `get_diff_stats` - See what changed between branches
- `check_conflicts` - Predict if merge conflicts will occur
- `sync_branch` - Attempt to synchronize a branch with remote
- `reset_branch` - Reset a branch to match another ref (when safe)

## Usage

### Basic Usage

Add the `--agentic-publish` flag to your publish command:

```bash
kodrdriv publish --agentic-publish
```

When a publish-blocking issue is detected, the AI agent will automatically:
- Investigate the problem
- Attempt to resolve it
- Provide a detailed report of actions taken

### Configuration Options

```bash
# Enable agentic publish
kodrdriv publish --agentic-publish

# Set maximum iterations (default: 10)
kodrdriv publish --agentic-publish --agentic-publish-max-iterations 15

# Combine with other publish options
kodrdriv publish --agentic-publish --interactive --target-version minor
```

### Configuration File

Add to your `.kodrdrivrc.json`:

```json
{
  "publish": {
    "agenticPublish": true,
    "agenticPublishMaxIterations": 10
  }
}
```

## Example Session

Here's what an agentic publish session looks like:

```bash
$ kodrdriv publish --agentic-publish

APPLICATION_STARTING: KodrDriv application initializing
GIT_FETCH_STARTING: Fetching latest remote information
PRECHECK_STARTING: Executing publish prechecks
PRECHECK_BRANCH_SYNC: Checking target branch sync with remote

error: BRANCH_SYNC_FAILED: Target branch not synchronized with remote
error: BRANCH_SYNC_DIVERGENCE: Local SHA: f4fcd33d | Remote SHA: 117e8c3c

AGENTIC_PUBLISH_STARTING: Attempting automatic diagnosis and fix

🔧 Running tool: check_branch_sync
✅ Tool check_branch_sync completed (245ms)

🔧 Running tool: analyze_divergence
✅ Tool analyze_divergence completed (189ms)

🔧 Running tool: get_commit_log
✅ Tool get_commit_log completed (156ms)

🔧 Running tool: sync_branch
✅ Tool sync_branch completed (1342ms)

═══════════════════════════════════════════════════════════
         AGENTIC PUBLISH RECOVERY REPORT
═══════════════════════════════════════════════════════════

✅ Status: RESOLVED

Iterations: 3
Tools executed: 4

Actions taken:
  • Analyzed divergence between main and origin/main
  • Found 2 commits in remote not in local branch
  • Successfully synchronized main with origin/main using fast-forward merge
  • Verified branches are now in sync

Detailed analysis:
───────────────────────────────────────────────────────────
I've successfully resolved the branch synchronization issue.

Investigation:
- Local main was at f4fcd33d
- Remote origin/main was at 117e8c3c
- The remote had 2 additional commits that weren't in local main

These commits were:
1. 117e8c3c - Update dependencies (author, 2 hours ago)
2. a8b9c0d1 - Fix build script (author, 3 hours ago)

Resolution:
I synchronized the local main branch with origin/main using a
fast-forward merge. This was safe because:
- No local commits existed that weren't in remote
- Fast-forward merge doesn't create merge commits
- Working directory had no uncommitted changes

The branches are now synchronized and the publish workflow can proceed.
───────────────────────────────────────────────────────────

You can now retry the publish command.

BRANCH_SYNC_VERIFIED: Target branch is now synchronized with remote
PRECHECK_COMPLETE: All publish prechecks passed successfully

[... rest of publish workflow continues ...]
```

## Supported Issue Types

Currently, agentic publish can handle:

### 1. Branch Synchronization (`branch_sync`)

**Problem**: Target branch diverged from remote
**Agent Actions**:
- Analyzes what commits caused divergence
- Determines if fast-forward merge is possible
- Attempts safe synchronization
- Falls back to manual steps if conflicts exist

### 2. Future Support (Coming Soon)

- **Uncommitted Changes** - Stash or commit uncommitted work
- **Merge Conflicts** - Analyze and potentially auto-resolve conflicts
- **Unknown Issues** - General diagnostic and recovery

## Safety Features

### Conservative Approach

The AI agent follows these safety principles:

1. **Diagnose First**: Always investigates before taking action
2. **Safe Operations**: Prefers non-destructive operations (fetch, fast-forward merge)
3. **User Confirmation**: For destructive operations, explains what will happen
4. **Manual Fallback**: If unsure, provides detailed manual steps
5. **Dry Run Support**: Can run in diagnostic-only mode

### Dry Run Mode

Test what the agent would do without making changes:

```bash
kodrdriv publish --agentic-publish --dry-run
```

The agent will:
- Run all diagnostic tools
- Analyze the situation
- Explain what it would do
- NOT execute any git operations

## Example Scenarios

### Scenario 1: Simple Fast-Forward

**Issue**: Remote has new commits, local is behind
**Agent Action**: Fast-forward merge
**Outcome**: ✅ Resolved automatically

### Scenario 2: Diverged History

**Issue**: Both local and remote have unique commits
**Agent Analysis**:
- Identifies conflicting commits
- Checks for potential merge conflicts
- Determines if auto-merge is safe
**Outcome**: ✅ or ⚠️ depending on conflicts

### Scenario 3: Complex Conflicts

**Issue**: Branches diverged with conflicting changes to same files
**Agent Analysis**:
- Identifies conflict sources
- Explains what needs manual resolution
- Provides step-by-step recovery instructions
**Outcome**: ⚠️ Manual intervention required

## Monitoring and Debugging

### Verbose Output

Enable verbose logging to see detailed tool execution:

```bash
kodrdriv publish --agentic-publish --verbose
```

### Tool Metrics

The agent tracks:
- Number of iterations
- Tools executed
- Execution time per tool
- Success/failure rates

These are included in the recovery report.

### Debug Mode

For deep debugging:

```bash
export DEBUG=kodrdriv:*
kodrdriv publish --agentic-publish --verbose
```

## Configuration Reference

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--agentic-publish` | Enable AI-powered recovery | `false` |
| `--agentic-publish-max-iterations` | Maximum agent iterations | `10` |

### Config File Options

```json
{
  "publish": {
    "agenticPublish": true,
    "agenticPublishMaxIterations": 10
  }
}
```

## Environment Variables

- `OPENAI_API_KEY` - Required for AI agent (same as other agentic features)
- `OPENAI_MODEL` - Override default model (default: `gpt-4o`)

## Comparison with Manual Approaches

### Traditional Approach

```bash
$ kodrdriv publish
# Error: branch not in sync

$ git checkout main
$ git pull origin main
# Resolve conflicts if any
$ git checkout working
$ kodrdriv publish
# May fail again with different issue
```

**Time**: 5-10 minutes (with conflicts: 30+ minutes)

### With --sync-target

```bash
$ kodrdriv publish --sync-target
# Attempts automatic sync with one strategy
# May not work for all scenarios
```

**Time**: 1-2 minutes (when it works)

### With --agentic-publish

```bash
$ kodrdriv publish --agentic-publish
# AI investigates, chooses best strategy, executes, reports
# Falls back to manual steps only when truly needed
```

**Time**: 1-3 minutes (with detailed explanation)

## Best Practices

1. **Start with Dry Run**: Test the feature with `--dry-run` first
2. **Review Reports**: Read the agent's analysis to learn about your repo state
3. **Combine Flags**: Use with `--verbose` during initial adoption
4. **Trust but Verify**: Agent explains its reasoning - review it
5. **Manual Override**: If uncomfortable with agent's plan, use manual steps

## Limitations

- Requires OpenAI API access (uses GPT-4)
- May not handle extremely complex git scenarios
- Respects git security (won't force push to protected branches)
- Fallback to manual steps is always available

## Troubleshooting

### Agent Runs Out of Iterations

**Problem**: Max iterations reached without resolution
**Solution**: Increase iterations or handle manually

```bash
kodrdriv publish --agentic-publish --agentic-publish-max-iterations 20
```

### API Rate Limits

**Problem**: OpenAI API rate limit hit
**Solution**: Wait and retry, or use manual recovery

### Agent Suggests Manual Steps

**Problem**: Scenario too complex for automatic recovery
**Solution**: Follow the detailed steps provided by the agent

## Future Enhancements

Planned improvements:

- Support for more issue types (uncommitted changes, merge conflicts)
- Learning from past resolutions
- Integration with GitHub for PR-based conflicts
- Custom tool plugins for domain-specific issues
- Multi-repository coordination

## Contributing

Want to add more recovery tools? See:
- `ai-service/src/tools/publish-tools.ts` - Add new tools
- `ai-service/src/agentic/publish.ts` - Update agent logic

## Related Documentation

- [Publish Command](./PUBLISH.md)
- [Branch Management](./BRANCHES.md)
- [AI Service Integration](../../ai-service/README.md)

## Support

For issues or questions:
- GitHub Issues: Tag with `agentic-publish`
- Verbose logs: Include `--verbose` output
- Agent reports: Include the recovery report in issue





