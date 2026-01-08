# KodrDriv - Complete AI Guide

**Purpose**: Help AI assistants understand, debug, integrate, and extend kodrdriv.

**Version**: 1.2.133-dev.0 (December 31, 2025)

---

## Quick Overview

**KodrDriv** is an AI-powered Git workflow automation tool that generates intelligent commit messages and release notes by analyzing code changes. It uses an **agentic AI system** with specialized tools to investigate changes before generating documentation.

**Key Differentiator**: Instead of blindly describing diffs, kodrdriv's AI actively investigates your code using 8-13 tools to understand context, relationships, and implications before writing.

---

## For AI Assistants: Start Here

### If helping someone integrate kodrdriv:
→ Start with [`guide/integration.md`](guide/integration.md)

### If debugging an issue:
→ Go to [`guide/debugging.md`](guide/debugging.md)

### If they want to understand how it works:
→ Read [`guide/architecture.md`](guide/architecture.md) and [`guide/ai-system.md`](guide/ai-system.md)

### If working with monorepos:
→ Check [`guide/monorepo.md`](guide/monorepo.md)

### If extending functionality:
→ See [`guide/development.md`](guide/development.md)

---

## Complete Guide Directory

Located in `guide/`:

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [`index.md`](guide/index.md) | Overview and navigation | Starting point |
| [`quickstart.md`](guide/quickstart.md) | 5-minute setup | First-time setup |
| [`usage.md`](guide/usage.md) | Common workflows | Daily operations |
| [`integration.md`](guide/integration.md) | Project integration | Setting up kodrdriv |
| [`commands.md`](guide/commands.md) | Command reference | Finding specific commands |
| [`configuration.md`](guide/configuration.md) | Configuration options | Customizing behavior |
| [`architecture.md`](guide/architecture.md) | System design | Understanding internals |
| [`ai-system.md`](guide/ai-system.md) | AI mechanics | Understanding AI decisions |
| [`debugging.md`](guide/debugging.md) | Troubleshooting | Fixing problems |
| [`development.md`](guide/development.md) | Building & extending | Contributing code |
| [`testing.md`](guide/testing.md) | Test suite | Running tests |
| [`tree-operations.md`](guide/tree-operations.md) | Multi-package ops | Monorepo automation |
| [`monorepo.md`](guide/monorepo.md) | Monorepo workflows | Monorepo projects |

---

## Architecture Summary

### Package Ecosystem

```
@eldrforge/kodrdriv         - Main CLI tool
@eldrforge/ai-service        - AI integration (agentic, prompts, tools)
@eldrforge/tree-core         - Dependency graph algorithms
@eldrforge/tree-execution    - Parallel execution engine
@eldrforge/git-tools         - Git operations
@eldrforge/github-tools      - GitHub API integration
@eldrforge/audio-tools       - Audio recording & transcription
@eldrforge/shared            - Common utilities
```

### Data Flow

```
User Command
    ↓
Configuration Loading (hierarchical merge)
    ↓
Git Analysis (diff, log, status)
    ↓
AI Analysis (agentic investigation with tools)
    ↓
Content Generation (commit message or release notes)
    ↓
Output & Execution (save files, create commits/releases)
```

### Key Technologies

- **TypeScript** - Type safety
- **Node.js** - Runtime
- **OpenAI API** - AI intelligence
- **GitHub API** - Repository integration
- **Zod** - Schema validation
- **CardiganTime** - Configuration management
- **RiotPrompt** - Prompt engineering
- **Vitest** - Testing
- **Vite** - Building

---

## Core Concepts

### 1. Agentic AI (Always On)

Kodrdriv **always** uses agentic mode - AI doesn't just generate text, it investigates:

**Commit Messages** (8 tools):
- `get_file_content` - Read full files
- `get_file_history` - View evolution
- `get_related_tests` - Find test files
- `analyze_diff_section` - Expand context
- `get_recent_commits` - Avoid duplicates
- `search_codebase` - Find usage
- `get_file_dependencies` - Assess impact
- `group_files_by_concern` - Organize logically

**Release Notes** (13 tools):
- All commit tools, plus:
- `get_tag_history` - Release patterns
- `get_release_stats` - Quantify scope
- `analyze_commit_patterns` - Detect themes
- `compare_previous_release` - Context
- `get_breaking_changes` - Alert users

### 2. Context Files (New Feature)

Pass documentation files for better context:

```bash
kodrdriv commit --context-files IMPL.md ARCHITECTURE.md
kodrdriv release --context-files CHANGELOG.md MIGRATION.md
```

Files are read and injected into prompts, giving AI rich context about your changes.

### 3. Self-Reflection

Generate detailed analysis reports:

```bash
kodrdriv commit --self-reflection
# Creates: output/agentic-reflection-commit-*.md

# Report includes:
# - Tools used and effectiveness
# - Execution timeline
# - Conversation history
# - Performance metrics
```

### 4. Tree Operations

Execute commands across multiple packages:

```bash
kodrdriv tree publish --parallel
# → Analyzes dependencies
# → Executes in topological order
# → Parallel where possible
# → Recovers from failures
```

---

## Recent Major Changes (Dec 31, 2025)

### 1. Self-Reflection Files → output/

Files now save to `output/` directory instead of project root.

### 2. Human-Readable Prompts

Redesigned to avoid AI slop:
- No emojis
- No marketing speak
- No meta-commentary
- Plain, professional language

### 3. Context Files Support

New `--context-files` option:
```bash
kodrdriv release --context-files file1.md file2.md
```

### 4. Agentic-Only

Removed `--agentic` flag - everything uses AI analysis by default:
```bash
# Old: kodrdriv commit --agentic
# New: kodrdriv commit  (agentic is automatic)
```

See complete details: `SESSION-SUMMARY-DEC-31.md`

---

## Implementation Documentation

The root directory contains extensive implementation docs:

### AI System
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - AI service extraction (1,463 lines)
- `AGENTIC-RELEASE-NOTES-COMPLETE.md` - Release notes implementation
- `AGENTIC-COMMIT-IMPROVEMENTS.md` - Commit generation
- `AI-FRIENDLY-LOGGING-GUIDE.md` - Logging patterns
- `RIOTPROMPT-COMPLETE-SUMMARY.md` - Prompt engineering (6,200 lines)

### Tree Operations
- `TREE-TOOLKIT-COMPLETE.md` - Tree system extraction (6,200 lines)
- `PARALLEL-PUBLISH-QUICK-REFERENCE.md` - Parallel execution
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Troubleshooting
- `CHECKPOINT-RECOVERY-FIX.md` - Recovery mechanisms

### Publishing & Releases
- `MONOREPO-PUBLISH-IMPROVEMENTS.md` - Monorepo workflows
- `PUBLISH_IMPROVEMENTS_IMPLEMENTED.md` - Publish features
- `WORKFLOW-PRECHECK-IMPLEMENTATION.md` - Pre-checks

### Recent Updates
- `SESSION-SUMMARY-DEC-31.md` - Today's session summary
- `SELF-REFLECTION-IMPROVEMENTS.md` - Reflection file fixes
- `CONTEXT-FILES-AND-HUMAN-PROMPTS.md` - Context files feature
- `AGENTIC-ONLY-SIMPLIFICATION.md` - Agentic-only migration

### Configuration & Architecture
- `CONFIG-FIX-RELEASE-AGENTIC.md` - Configuration system
- `COMPLETE-IMPLEMENTATION-SUMMARY.md` - Overall architecture
- `INTEGRATION-COMPLETE.md` - Integration patterns

---

## Quick Command Reference

### Essential Commands

```bash
# Commit with AI analysis
kodrdriv commit [--sendit] [--context-files FILES]

# Release notes with AI analysis
kodrdriv release [--context-files FILES] [--interactive]

# Complete release workflow
kodrdriv publish [--sendit] [--parallel]

# Multi-package operations
kodrdriv tree COMMAND [--parallel]

# Audio-driven
kodrdriv audio-commit [--sendit]
kodrdriv audio-review [--sendit]
```

### Essential Options

```bash
--dry-run                    # Preview without changes
--verbose                    # Detailed logging
--debug                      # Maximum detail + debug files
--self-reflection            # Generate analysis reports
--context-files FILES        # Pass context files
--max-agentic-iterations N   # Control analysis depth
--interactive                # Review before executing
--sendit                     # Skip confirmations
```

### Essential Configuration

```yaml
model: gpt-4o                      # AI model
outputDirectory: output            # Output location

commit:
  selfReflection: true             # Analysis reports
  maxAgenticIterations: 10         # Investigation depth

release:
  selfReflection: true
  maxAgenticIterations: 30

tree:
  directories: [packages/*]        # Package locations
  parallel: true                   # Parallel execution
```

---

## Common Scenarios

### Scenario 1: "Help me integrate kodrdriv"

```bash
# 1. Install
npm install -g @eldrforge/kodrdriv

# 2. Setup
export OPENAI_API_KEY="your-key"
kodrdriv --init-config

# 3. Test
kodrdriv commit --dry-run

# 4. Use
kodrdriv commit --sendit
```

**Full guide**: [`guide/integration.md`](guide/integration.md)

### Scenario 2: "Kodrdriv isn't working"

```bash
# Diagnose
kodrdriv --check-config
kodrdriv commit --dry-run --verbose

# Common fixes:
# - Set OPENAI_API_KEY
# - Stage changes (git add)
# - Check config syntax
# - Verify in git repo
```

**Full guide**: [`guide/debugging.md`](guide/debugging.md)

### Scenario 3: "How do I use kodrdriv for releases?"

```bash
# Generate notes
kodrdriv release --context-files CHANGELOG.md

# Review
cat output/RELEASE_NOTES.md

# Publish
kodrdriv publish --interactive
```

**Full guide**: [`guide/usage.md`](guide/usage.md)

### Scenario 4: "How does the AI work?"

**Answer**: Agentic system with tools:
1. AI receives task and available tools
2. AI investigates using tools (reads files, checks history, etc.)
3. Tools return results
4. AI uses results to decide next action
5. Repeats until AI has enough information
6. AI generates final output

**Full guide**: [`guide/ai-system.md`](guide/ai-system.md)

### Scenario 5: "How do I use with monorepos?"

```bash
# Setup
kodrdriv tree link

# Develop
kodrdriv tree precommit --parallel

# Release
kodrdriv tree publish --parallel --context-files MIGRATION.md
```

**Full guide**: [`guide/monorepo.md`](guide/monorepo.md)

---

## Debugging Checklist

When something doesn't work:

1. **Environment**
   - [ ] OPENAI_API_KEY set?
   - [ ] GITHUB_TOKEN set (if using publish)?
   - [ ] In git repository?
   - [ ] Node.js v18+?

2. **Configuration**
   - [ ] `kodrdriv --check-config` shows settings?
   - [ ] Config file syntax valid?
   - [ ] Model name correct?

3. **Git State**
   - [ ] Changes staged (`git diff --cached`)?
   - [ ] Repository has commits?
   - [ ] On correct branch?

4. **Diagnosis**
   - [ ] Try `--dry-run` first
   - [ ] Enable `--verbose` logging
   - [ ] Use `--debug` for detail
   - [ ] Generate `--self-reflection` report

5. **Review**
   - [ ] Check `output/` directory
   - [ ] Review debug files
   - [ ] Check reflection reports
   - [ ] Read error messages carefully

---

## API Cost Guidelines

### Model Costs (per 1M tokens)

- **gpt-4o-mini**: $0.15 input, $0.60 output
- **gpt-4o**: $2.50 input, $10.00 output

### Typical Usage

**Commit message** (gpt-4o-mini):
- Input: 10-20K tokens (diff + history + tool outputs)
- Output: 100-200 tokens
- Cost: ~$0.01-0.02 per commit

**Release notes** (gpt-4o):
- Input: 30-80K tokens (commits + diffs + tool outputs)
- Output: 500-1000 tokens
- Cost: ~$0.10-0.25 per release

### Cost Optimization

```yaml
# Use cheaper model for commits
model: gpt-4o-mini

# But quality model for releases
release:
  model: gpt-4o

# Reduce iterations
commit:
  maxAgenticIterations: 6   # vs default 10

# Limit context
commit:
  messageLimit: 5           # vs default 10
  maxDiffBytes: 10240       # vs default 20480
```

---

## Package Documentation

Each package has detailed docs:

### ai-service
- `README.md` - Package overview
- `QUICKSTART.md` - Quick start
- `USAGE.md` - Usage patterns
- `INTEGRATION.md` - Integration guide
- `DOCUMENTATION_INDEX.md` - Complete docs
- `examples/` - Working examples

### tree-core & tree-execution
- `README.md` - Package docs
- `EXTRACTION-COMPLETE.md` - Implementation details

### git-tools & github-tools
- `README.md` - API documentation
- `COVERAGE_REPORT.md` - Test coverage

### audio-tools
- `README.md` - Audio functionality
- `DOCUMENTATION_COMPLETE.md` - Complete guide
- `examples/` - Usage examples

### shared
- `README.md` - Shared utilities
- `FINAL_COVERAGE_REPORT.md` - Test details

---

## Implementation Deep Dives

Root directory contains comprehensive implementation documentation:

### Major Features (Read These First)

**AI System** (Most Important):
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - How AI service works (293 lines)
- `AGENTIC-ONLY-SIMPLIFICATION.md` - Why everything is agentic (216 lines)
- `RIOTPROMPT-COMPLETE-SUMMARY.md` - Prompt engineering system (detailed)

**Tree Operations** (For Monorepos):
- `TREE-TOOLKIT-COMPLETE.md` - Multi-package automation (166 lines)
- `PARALLEL-PUBLISH-QUICK-REFERENCE.md` - Parallel execution guide
- `MONOREPO-PUBLISH-IMPROVEMENTS.md` - Monorepo workflows

**Recent Changes** (Context for Current State):
- `SESSION-SUMMARY-DEC-31.md` - Today's improvements (261 lines)
- `SELF-REFLECTION-IMPROVEMENTS.md` - File location & prompt fixes (157 lines)
- `CONTEXT-FILES-AND-HUMAN-PROMPTS.md` - Context files feature (261 lines)

### All Implementation Docs (Alphabetically)

**AI & Prompts**:
- AI-FRIENDLY-LOGGING-GUIDE.md
- AI-LOGGING-MIGRATION-COMPLETE.md
- AI-SERVICE-EXTRACTION-COMPLETE.md
- AI-SERVICE-INTEGRATION-COMPLETE.md
- AI-SERVICE-INTEGRATION-VERIFIED.md
- AGENTIC-COMMIT-IMPROVEMENTS.md
- AGENTIC-ONLY-SIMPLIFICATION.md
- AGENTIC-PUBLISH-IMPLEMENTATION.md
- AGENTIC-RELEASE-NOTES-COMPLETE.md
- AGENTIC-RELEASE-SELF-REFLECTION-FIX.md
- AGENTIC-SEARCH-CODEBASE-FIX.md
- AGENTIC-SEARCH-FIX.md
- AGENTIC-TOOLS-FIX.md

**Configuration & Architecture**:
- COMPLETE-IMPLEMENTATION-SUMMARY.md
- CONFIG-FIX-RELEASE-AGENTIC.md
- COMPREHENSIVE-DUPLICATION-REPORT.md
- DUPLICATION-CLEANUP-COMPLETE.md
- INTEGRATION-COMPLETE.md
- FINAL-INTEGRATION-REPORT.md
- FINAL-SUMMARY.md

**Tree & Parallel Execution**:
- TREE-TOOLKIT-COMPLETE.md
- TREE-COMMIT-AGENTIC-FIX.md
- PARALLEL_EXECUTION_FIX.md
- PARALLEL-EXECUTION-FIXES.md
- PARALLEL-PUBLISH-DEBUGGING-GUIDE.md
- PARALLEL-PUBLISH-FIXES-IMPLEMENTED.md
- PARALLEL-PUBLISH-IMPROVEMENTS-IMPLEMENTED.md
- PARALLEL-PUBLISH-LOGGING-FIXES.md
- PARALLEL-PUBLISH-QUICK-REFERENCE.md

**Publishing & Workflows**:
- MONOREPO-PUBLISH-IMPROVEMENTS.md
- PUBLISH_IMPROVEMENTS_IMPLEMENTED.md
- PUBLISH-AGENTIC-RELEASE-FIX.md
- WORKFLOW-PRECHECK-IMPLEMENTATION.md
- WORKFLOW-SKIP-SUMMARY.md

**Recovery & Debugging**:
- CHECKPOINT-RECOVERY-FIX.md
- RECOVERY-FIXES.md
- AUDIT-BRANCHES-PROGRESS-FIX.md
- AUDIT-EXAMPLE-OUTPUT.md
- BUG-FIXES-COMPLETE.md
- BUG-FIXES-REPORT.md

**RiotPrompt Integration**:
- RIOTPROMPT-COMPLETE-SUMMARY.md
- RIOTPROMPT-DONE.md
- RIOTPROMPT-FINAL-IMPLEMENTATION.md
- RIOTPROMPT-IMPLEMENTATION-MAP.md
- RIOTPROMPT-INTEGRATION-ANALYSIS.md
- RIOTPROMPT-MASTER-SUMMARY.md
- RIOTPROMPT-MIGRATION-GUIDE.md
- RIOTPROMPT-PHASE-1-COMPLETE.md
- RIOTPROMPT-PHASE-2-3-COMPLETE.md
- RIOTPROMPT-PHASE-2-3-IMPLEMENTATION.md
- RIOTPROMPT-PHASE-2-3-SUMMARY.md
- RIOTPROMPT-QUICK-REFERENCE.md
- RIOTPROMPT-REVIEW-SUMMARY.md

**Specific Fixes**:
- ALREADY-PUBLISHED-PACKAGES-FIX.md
- CODE-DIFF-SUMMARY.md
- LOGGING-MIGRATION-STATUS.md
- MIGRATION-VERIFICATION.md
- SUBMODULE-LOCK-FIX.md
- VERSION-AUDIT-FIX.md

**Recent Session**:
- SESSION-SUMMARY-DEC-31.md
- SELF-REFLECTION-IMPROVEMENTS.md
- CONTEXT-FILES-AND-HUMAN-PROMPTS.md

---

## Common Integration Tasks

### Task: Add kodrdriv to Existing Project

1. Install: `npm install -g @eldrforge/kodrdriv`
2. Setup: `kodrdriv --init-config`
3. Configure: Edit `.kodrdriv/config.yaml`
4. Test: `kodrdriv commit --dry-run`
5. Use: `kodrdriv commit --sendit`

**Detailed steps**: [`guide/integration.md`](guide/integration.md)

### Task: Debug kodrdriv Issues

1. Check environment: `echo $OPENAI_API_KEY`
2. Verify config: `kodrdriv --check-config`
3. Test with dry-run: `kodrdriv commit --dry-run --verbose`
4. Review logs: `kodrdriv commit --debug`
5. Generate report: `kodrdriv commit --self-reflection`

**Full checklist**: [`guide/debugging.md`](guide/debugging.md)

### Task: Extend kodrdriv

1. Clone repository
2. Setup: `npm install && npm link`
3. Create command: `src/commands/new-command.ts`
4. Add types: `src/types.ts`
5. Register: `src/main.ts` and `src/arguments.ts`
6. Test: `tests/commands/new-command.test.ts`

**Full process**: [`guide/development.md`](guide/development.md)

### Task: Use in Monorepo

1. Configure tree: `.kodrdriv/config.yaml`
2. Link packages: `kodrdriv tree link`
3. Develop: Work normally
4. Check: `kodrdriv tree precommit --parallel`
5. Publish: `kodrdriv tree publish --parallel`

**Complete workflow**: [`guide/monorepo.md`](guide/monorepo.md)

---

## Key Files to Understand

### For Integration
- `guide/integration.md` - Integration patterns
- `guide/quickstart.md` - Quick setup
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - AI system details

### For Development
- `guide/development.md` - Build & extend
- `src/types.ts` - Type definitions
- `src/constants.ts` - Defaults
- `src/arguments.ts` - CLI parsing

### For Debugging
- `guide/debugging.md` - Troubleshooting
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Parallel issues
- `RECOVERY-FIXES.md` - Recovery mechanisms

### For Understanding AI
- `guide/ai-system.md` - AI mechanics
- `ai-service/README.md` - AI service docs
- `AGENTIC-ONLY-SIMPLIFICATION.md` - Why agentic

### For Monorepos
- `guide/monorepo.md` - Monorepo guide
- `TREE-TOOLKIT-COMPLETE.md` - Tree implementation
- `MONOREPO-PUBLISH-IMPROVEMENTS.md` - Workflows

---

## Testing & Validation

### Run All Tests

```bash
cd kodrdriv && npm test
cd ai-service && npm test
cd tree-core && npm test
cd tree-execution && npm test
cd shared && npm test
cd git-tools && npm test
cd github-tools && npm test
```

### Precommit Checks

```bash
# In each package
npm run precommit

# Or use kodrdriv itself
kodrdriv tree precommit --parallel
```

### Build Verification

```bash
# Build all packages
cd ai-service && npm run build
cd ../tree-core && npm run build
cd ../tree-execution && npm run build
cd ../shared && npm run build
cd ../git-tools && npm run build
cd ../github-tools && npm run build
cd ../kodrdriv && npm run build
```

---

## FAQs for AI Assistants

### Q: What's the most important thing to understand?

**A**: Kodrdriv uses **agentic AI** - it doesn't just generate text, it actively investigates code changes using tools before writing. This is always on, not optional.

### Q: How do I help someone get started?

**A**: Point them to [`guide/quickstart.md`](guide/quickstart.md) and help them:
1. Set OPENAI_API_KEY
2. Run `kodrdriv --init-config`
3. Test with `kodrdriv commit --dry-run`

### Q: What if kodrdriv generates poor output?

**A**: Check:
1. Enable `--self-reflection` to see what AI did
2. Pass `--context-files` for more context
3. Increase `--max-agentic-iterations` for deeper investigation
4. Use `gpt-4o` instead of `gpt-4o-mini`

### Q: How do I debug issues?

**A**: Use [`guide/debugging.md`](guide/debugging.md):
1. `--dry-run` to preview
2. `--verbose` for detail
3. `--debug` for maximum info
4. Check `output/` directory
5. Review self-reflection reports

### Q: Where is detailed implementation info?

**A**: Root directory has 40+ implementation docs. Most important:
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - AI system
- `TREE-TOOLKIT-COMPLETE.md` - Tree operations
- `SESSION-SUMMARY-DEC-31.md` - Recent changes
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Troubleshooting

### Q: How do I contribute?

**A**: See [`guide/development.md`](guide/development.md):
1. Clone repo
2. `npm install && npm link`
3. Make changes
4. `npm run precommit`
5. Submit PR

---

## Directory Structure Reference

```
/Users/tobrien/gitw/grunnverk/
├── kodrdriv/                    # Main package
│   ├── guide/                   # AI-friendly guides ⭐
│   ├── docs/                    # Detailed documentation
│   ├── src/                     # Source code
│   ├── tests/                   # Test suite
│   └── output/                  # Generated files
│
├── ai-service/                  # AI integration
├── tree-core/                   # Dependency analysis
├── tree-execution/              # Parallel execution
├── git-tools/                   # Git operations
├── github-tools/                # GitHub API
├── audio-tools/                 # Audio processing
├── shared/                      # Common utilities
│
└── *.md                         # Implementation docs ⭐
    (40+ files with detailed technical info)
```

---

## Success Criteria

### For Integration

- [ ] kodrdriv generates commit messages
- [ ] Generated messages are accurate
- [ ] Release notes are comprehensive
- [ ] publish command completes successfully
- [ ] Configuration works as expected

### For Debugging

- [ ] Issue identified and diagnosed
- [ ] Solution found in guides
- [ ] Fix applied and tested
- [ ] Documentation updated if needed

### For Development

- [ ] New feature works correctly
- [ ] Tests pass
- [ ] No regressions
- [ ] Documentation updated
- [ ] Precommit checks pass

---

## External Resources

### Official Documentation

- Repository: https://github.com/username/kodrdriv
- npm: https://www.npmjs.com/package/@eldrforge/kodrdriv

### Dependencies

- **RiotPrompt**: https://github.com/riotprompt/riotprompt
- **CardiganTime**: https://github.com/theunwalked/cardigantime
- **OpenAI API**: https://platform.openai.com/docs
- **GitHub API**: https://docs.github.com/en/rest

---

## Summary for AI Assistants

**kodrdriv** is a mature, well-tested AI-powered Git workflow tool with:

✅ **Comprehensive guides** in `guide/` directory
✅ **Extensive documentation** in 40+ root `.md` files
✅ **Well-architected** with 8 focused packages
✅ **Thoroughly tested** with 2,500+ tests
✅ **Production-ready** and actively maintained

**To help users**:
1. Start with the appropriate guide from `guide/` directory
2. Reference implementation docs for technical details
3. Check recent session summaries for latest changes
4. Use debugging guides for troubleshooting
5. Leverage the extensive test suite as examples

**Key principle**: kodrdriv is designed to be transparent and observable. Use `--verbose`, `--debug`, and `--self-reflection` to understand what's happening at every step.

---

This guide is your complete reference for working with kodrdriv. Start with the guide directory, dive into implementation docs as needed, and leverage the extensive documentation to help users succeed!




