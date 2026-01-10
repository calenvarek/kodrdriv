# AI System Guide

Understanding how kodrdriv's AI analysis works.

## Overview

Kodrdriv uses an **agentic AI system** - the AI doesn't just generate text, it actively investigates your code changes using specialized tools before writing commit messages or release notes.

**Key Concept**: Instead of blindly describing diffs, the AI asks questions like "what files depend on this?" and "what tests cover this?" to understand your changes deeply.

## Always-On Agentic Mode

As of recent updates, **agentic mode is always enabled**. The AI always uses tools to investigate changes.

### What This Means

**Old way** (single-shot):
```
Diff → AI → Commit Message
```

**New way** (agentic):
```
Diff → AI analyzes → Uses tools → Gathers context → AI writes message
```

The AI can:
- Read file contents
- Check file history
- Find dependencies
- Search codebase
- Review tests
- Check recent commits

## AI Tools

### Commit Message Tools (8 tools)

| Tool | Purpose | Example Use Case |
|------|---------|------------------|
| `get_file_history` | View file's commit history | Understand evolution of changed file |
| `get_file_content` | Read complete file | See context around diff |
| `get_related_tests` | Find test files | Understand behavior changes |
| `analyze_diff_section` | Expand context around lines | Clarify cryptic changes |
| `get_recent_commits` | Check recent commits | Avoid duplicate messages |
| `search_codebase` | Find patterns/usage | Assess impact of changes |
| `get_file_dependencies` | Find what depends on file | Understand impact scope |
| `group_files_by_concern` | Organize files logically | Suggest commit splits |

### Release Notes Tools (13 tools)

**All commit tools** plus:

| Tool | Purpose | Example Use Case |
|------|---------|------------------|
| `get_tag_history` | View past tags | Understand release patterns |
| `get_release_stats` | Quantify changes | Get metrics on scope |
| `analyze_commit_patterns` | Detect themes | Identify focus areas |
| `compare_previous_release` | Compare releases | Contextualize changes |
| `get_breaking_changes` | Identify breaking changes | Alert users to issues |

## How the AI Decides

### Investigation Strategy

The AI decides which tools to use based on:

1. **Change Complexity**
   - 1-3 files → Use 1-2 tools (simple)
   - 4-10 files → Use 2-4 tools (moderate)
   - 10+ files → Use 4-6 tools (complex)

2. **Change Type**
   - New feature → Check tests, dependencies
   - Bug fix → Review file history, related changes
   - Refactor → Check dependencies, search usage
   - Documentation → Group by concern

3. **Clarity**
   - Clear diff → Fewer tools needed
   - Cryptic diff → Read full files, expand context
   - Multiple concerns → Group files, suggest splits

### Example: AI Investigating a Change

```
User: Generate commit message for auth.ts changes

AI: Let me investigate...
 1. get_file_content(auth.ts) → See full context
 2. get_related_tests(auth.ts) → Find auth.test.ts
 3. get_file_dependencies(auth.ts) → Used by user.ts, api.ts
 4. get_recent_commits(auth.ts) → Last changed 2 days ago
    "refactor: simplify auth flow"

AI: Based on investigation, this adds JWT support to
    existing auth system, affecting user and API modules.
    Tests updated to cover new token validation.

Output: "feat(auth): add JWT token support

         Adds JWT-based authentication alongside existing session auth.
         Updates user and API modules to handle tokens.
         Includes tests for token validation and refresh."
```

## Prompt Engineering

### Commit Message Prompts

**System Prompt** (abbreviated):
```
You are a professional software engineer writing commit messages for your team.

Write naturally and directly:
- Use plain language, not corporate speak
- Be specific and concrete
- Avoid buzzwords and jargon
- No emojis or excessive punctuation
- No phrases like "this commit"
```

**User Prompt**:
```
I have staged changes that need a commit message.

Changed files (3):
  - src/auth.ts
  - src/user.ts
  - tests/auth.test.ts

Diff: [full diff]

Analyze these changes and write a clear commit message.
```

### Release Notes Prompts

**System Prompt** (abbreviated):
```
You are a professional software engineer writing release notes for your team and users.

Focus on:
- What problems does this release solve?
- What new capabilities does it add?
- What's the impact on users?
- Are there breaking changes?

Write naturally and directly:
- Use plain language
- Be specific about what changed and why
- No marketing speak
- No emojis
- Focus on facts, not enthusiasm
```

**User Prompt**:
```
I need release notes for changes from v1.0.0 to v1.1.0.

Commit Log: [commits]
Diff Summary: [diffs]
Milestone Issues: [resolved issues]

Consider:
- What's the main story?
- What problems does it solve?
- Are there breaking changes?
```

## Quality Standards

### Anti-Slop Guidelines

The AI is explicitly instructed to avoid:
- ✗ Emojis (🎉, ✨, 🚀)
- ✗ Marketing language ("excited to announce")
- ✗ Meta-commentary ("this commit", "this PR")
- ✗ Buzzwords ("leverage", "synergy")
- ✗ Excessive punctuation (!!!, ???)
- ✗ Conversational closings ("Let me know")

### What Good Output Looks Like

**Commit Message**:
```
feat(auth): add JWT token support

Adds JWT-based authentication alongside existing session auth. Token
validation happens in middleware, with automatic refresh handling.

Updates user and API modules to accept both auth methods. Backward
compatible - existing session auth continues to work.

Includes tests for token validation, refresh, and mixed auth scenarios.
```

**Release Notes**:
```
## Authentication Improvements

Added JWT token support alongside existing session-based authentication.
Tokens are validated in middleware with automatic refresh handling.

Both authentication methods work simultaneously, allowing gradual migration.
Session-based auth continues to work without changes.

## Breaking Changes

None. This release is fully backward compatible.

## Testing

Added comprehensive tests for token validation, refresh logic, and
compatibility with existing session auth.
```

## Iteration Control

### What Are Iterations?

Each iteration is one loop of AI → Tool Calls → Response.

**Example**:
```
Iteration 1: AI requests get_file_content(auth.ts)
Iteration 2: AI requests get_related_tests(auth.ts)
Iteration 3: AI writes commit message
```

### Controlling Iterations

```bash
# More iterations = more investigation
kodrdriv commit --max-agentic-iterations 15

# Fewer for speed
kodrdriv commit --max-agentic-iterations 5

# Default is 10 for commits, 30 for releases
```

**When to adjust**:
- Simple changes → Use 5-8 iterations
- Complex changes → Use 12-20 iterations
- Large releases → Use 40-50 iterations

### Monitoring Iterations

Enable self-reflection to see iteration details:

```bash
kodrdriv commit --self-reflection
cat output/agentic-reflection-commit-*.md
```

Report shows:
- Number of iterations used
- Tools called per iteration
- Time spent per tool
- Success/failure rates

## Token Budgets

### Understanding Token Limits

Each AI request has a token budget:
- **Commit messages**: ~150K tokens max
- **Release notes**: ~200K tokens max

Includes:
- Your code diffs
- Git history
- Tool outputs
- AI responses

### When Budgets Are Exceeded

Kodrdriv automatically:
1. Compresses oldest messages
2. Removes low-priority context
3. Truncates large diffs
4. Retries with smaller input

You can:
```bash
# Reduce diff size
kodrdriv commit --max-diff-bytes 5120

# Limit commit history
kodrdriv commit --message-limit 5

# Reduce iterations
kodrdriv commit --max-agentic-iterations 8
```

## Reasoning Levels

OpenAI reasoning models support different effort levels:

```yaml
# Fast, less thorough
openaiReasoning: low

# Balanced (default)
openaiReasoning: medium

# Thorough, slower
openaiReasoning: high
```

**When to use**:
- `low`: Simple changes, quick commits
- `medium`: Standard development (default)
- `high`: Complex releases, critical changes

## Context Sources

### Automatic Context

Always included:
- Git diff of changes
- Recent commit history
- File structure
- Repository metadata

### Optional Context

Enable with options:
- `--context "text"` - Free-form context
- `--context-files FILES` - Documentation files
- `-d, --context-directories DIRS` - Code directories
- GitHub issues (automatic for commits)
- Milestone issues (automatic for releases)

### Example: Rich Context

```bash
kodrdriv release \
  --context "This release focuses on performance" \
  --context-files OPTIMIZATION-NOTES.md BENCHMARKS.md \
  -d src/performance -d src/cache \
  --self-reflection
```

AI receives:
- Git diff
- Git history
- Your context text
- Contents of OPTIMIZATION-NOTES.md
- Contents of BENCHMARKS.md
- Directory trees for src/performance and src/cache
- Milestone issues
- Analysis from previous tools

## Observability

### Self-Reflection Reports

Enable with `--self-reflection`:

```markdown
# Agentic Workflow - Self-Reflection Report

## Execution Summary
- Iterations: 12
- Tool Calls: 18
- Unique Tools: 6

## Tool Effectiveness
| Tool | Calls | Success | Duration |
|------|-------|---------|----------|
| get_file_content | 5 | 100% | 450ms |
| get_recent_commits | 3 | 100% | 230ms |
| get_related_tests | 2 | 100% | 180ms |

## Conversation History
[Full AI interaction log]

## Generated Output
[Final commit message]
```

### Debug Files

Enable with `--debug`:

**output/request-*.json**:
```json
{
  "model": "gpt-4o",
  "messages": [...],
  "tools": [...]
}
```

**output/response-*.json**:
```json
{
  "choices": [...],
  "usage": {
    "prompt_tokens": 12450,
    "completion_tokens": 235
  }
}
```

## Best Practices

### For Commit Messages

1. **Enable self-reflection** to improve quality
2. **Use context files** for complex features
3. **Allow commit splitting** for mixed changes
4. **Review interactive** for important commits
5. **Check recent commits** to avoid duplicates

### For Release Notes

1. **Always use context files** for comprehensive notes
2. **Set release focus** to guide framing
3. **Enable self-reflection** to see analysis depth
4. **Use interactive mode** to refine
5. **Check breaking changes** are highlighted

### For Team Use

1. **Document guidelines** in `.kodrdriv/personas/`
2. **Set consistent models** in config
3. **Enable verbose** mode for transparency
4. **Use dry-run** mode for training
5. **Review self-reflection** reports regularly

## Troubleshooting AI Issues

### AI Output is Too Verbose

```yaml
commit:
  maxAgenticIterations: 6  # Reduce investigation depth
```

### AI Output is Too Shallow

```yaml
commit:
  maxAgenticIterations: 15          # More investigation
  contextFiles: ["docs/IMPL.md"]    # More context
```

### AI Misunderstands Changes

```bash
# Pass explicit context
kodrdriv commit --context "This refactors auth for testability"

# Or context files
kodrdriv commit --context-files ARCHITECTURE.md
```

### AI Uses Wrong Tone

Customize persona in `.kodrdriv/personas/committer.md`:
```markdown
You write terse, technical commit messages.
Focus on changed behavior, not implementation details.
```

### Tool Calls Fail

Check self-reflection report:
```bash
kodrdriv commit --self-reflection --verbose
cat output/agentic-reflection-commit-*.md
# Look for tool failures
```

## Advanced: Understanding Tool Selection

The AI chooses tools based on what would help write better output:

**Scenario**: Large refactoring (15 files changed)

```
AI thinking: "Many files changed. Let me group them first."
→ group_files_by_concern(all files)
   Returns: "Auth module (5 files), Database (3 files), Tests (7 files)"

AI: "This might be separate concerns. Let me check dependencies."
→ get_file_dependencies(auth files)
   Returns: "Used by api.ts, user.ts"

AI: "Significant changes. Let me check tests."
→ get_related_tests(auth files)
   Returns: "auth.test.ts, integration.test.ts"

AI: "I understand. This is a unified refactor with tests."
→ Writes single commit message covering all changes
```

## Next Steps

- **[Debugging Guide](./debugging.md)** - Troubleshoot AI issues
- **[Configuration Guide](./configuration.md)** - Fine-tune AI behavior
- **[Development Guide](./development.md)** - Extend the AI system
- **[Commands Reference](./commands.md)** - All available commands

## Quick Reference

| Setting | Purpose | Values |
|---------|---------|--------|
| `model` | AI model to use | gpt-4o, gpt-4o-mini |
| `openaiReasoning` | Reasoning depth | low, medium, high |
| `maxAgenticIterations` | Analysis depth | 5-50 (default: 10/30) |
| `selfReflection` | Generate reports | true/false |
| `contextFiles` | Additional context | File paths |

The AI system is designed to be transparent, controllable, and effective. Use self-reflection reports to understand and improve its decision-making over time.




