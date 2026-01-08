# Architecture Guide

Understanding kodrdriv's system design.

For complete architecture documentation, see: [`docs/public/architecture.md`](../docs/public/architecture.md)

## System Overview

```
┌─────────────────────────────────────────────────┐
│                   kodrdriv CLI                  │
│  (Main entry point, argument parsing, routing) │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────────┐
        │                    │              │
┌───────▼───────┐   ┌────────▼────────┐   │
│   Commands    │   │   Utilities     │   │
│ ─────────────│   │ ───────────────│   │
│ - commit      │   │ - aiAdapter    │   │
│ - release     │   │ - storage      │   │
│ - publish     │   │ - git ops      │   │
│ - review      │   │ - logging      │   │
│ - tree        │   │ - interactive  │   │
│ - audio-*     │   │ - validation   │   │
└───────┬───────┘   └────────┬────────┘   │
        │                    │              │
        └──────┬─────────────┘              │
               │                            │
    ┌──────────▼──────────┬─────────────────▼──────┐
    │                     │                         │
┌───▼───────────┐  ┌──────▼─────────┐   ┌──────────▼────────┐
│  ai-service   │  │   git-tools    │   │  github-tools     │
│ ─────────────│  │ ──────────────│   │ ─────────────────│
│ - Agentic AI  │  │ - Git ops      │   │ - API wrapper     │
│ - Prompts     │  │ - Validation   │   │ - PR management   │
│ - Tools       │  │ - History      │   │ - Issues          │
└───────────────┘  └────────────────┘   └───────────────────┘
```

## Package Structure

### Core Packages

**@eldrforge/kodrdriv** (main package)
- CLI interface
- Command implementations
- Configuration management
- Workflow orchestration

**@eldrforge/ai-service** (AI integration)
- Agentic AI system with tool-calling
- Prompt engineering
- OpenAI API integration
- Interactive workflows

**@eldrforge/tree-core** (dependency analysis)
- Dependency graph algorithms
- Topological sorting
- Package discovery

**@eldrforge/tree-execution** (parallel execution)
- Parallel task execution
- Checkpoint/recovery system
- Progress monitoring

**@eldrforge/git-tools** (Git operations)
- Git command wrappers
- History parsing
- Diff processing

**@eldrforge/github-tools** (GitHub integration)
- GitHub API wrapper
- PR management
- Issue handling
- Release creation

**@eldrforge/audio-tools** (audio processing)
- Audio recording
- Device selection
- File processing

**@eldrforge/shared** (common utilities)
- Storage utilities
- Date/time functions
- Validation helpers
- Logging infrastructure

## Data Flow

### Commit Generation Flow

```
1. User runs: kodrdriv commit --sendit

2. Argument Parsing
   CLI args → Config loading → Validation

3. Git Operations
   Get diff → Get history → Get status

4. Context Gathering
   Read changed files → Check GitHub issues → Load context files

5. AI Analysis (Agentic)
   Initialize tools → AI investigates → Tools execute → AI writes message

6. Post-Processing
   Filter sensitive info → Save to output → Display to user

7. Execution
   Create commit → Push (if configured)
```

### Release Notes Flow

```
1. User runs: kodrdriv release

2. Configuration & Setup
   Load config → Determine refs (from/to) → Set up storage

3. Git Analysis
   Get commit log → Generate diff → Check tags

4. GitHub Integration
   Get milestone issues → Check closed PRs → Get release history

5. Context Gathering
   Load context files → Scan directories → Prepare prompts

6. AI Analysis (Agentic)
   Initialize 13 tools → AI investigates → Generate notes

7. Output
   Filter content → Save files → Display notes
```

### Publish Workflow

```
1. Pre-checks
   Validate environment → Check working directory → Load config

2. Generate Release Notes
   Run release command → Review (if interactive)

3. Create PR
   Push branch → Create PR → Add labels

4. Wait for Checks
   Monitor CI status → Handle timeouts → User confirmation

5. Merge
   Merge PR → Checkout target → Pull latest

6. Create Release
   Create tag → Push tag → Create GitHub release → Close milestone

7. Version Bump
   Merge target to source → Bump version → Push changes
```

## Key Components

### Agentic System

Located in `ai-service/src/agentic/`:
- `executor.ts` - Main agentic loop
- `commit.ts` - Commit message generation
- `release.ts` - Release notes generation
- `publish.ts` - Publish workflow automation

**How it works**:
1. AI receives task and available tools
2. AI decides which tools to use
3. Tools execute and return results
4. AI uses results to make next decision
5. Repeats until AI has enough information
6. AI generates final output

### Tool System

Located in `ai-service/src/tools/`:
- `registry.ts` - Tool registration and management
- `commit-tools.ts` - 8 tools for commits
- `release-tools.ts` - 13 tools for releases

**Tool interface**:
```typescript
{
  name: "get_file_content",
  description: "Read complete file contents",
  parameters: {...},
  execute: async (params) => { ... }
}
```

### Prompt System

Located in `ai-service/src/prompts/`:
- `commit.ts` - Commit prompt builder
- `release.ts` - Release prompt builder
- `review.ts` - Review prompt builder
- `instructions/*.md` - Instruction templates

Uses **RiotPrompt** for structured prompt engineering.

### Configuration System

Located in `kodrdriv/src/`:
- `arguments.ts` - CLI argument parsing
- `types.ts` - TypeScript types & Zod schemas
- `constants.ts` - Default values

Uses **CardiganTime** for hierarchical configuration.

## Design Principles

### 1. AI-First

Every text generation operation uses AI with tools for investigation. No hard-coded templates or mechanical text generation.

### 2. Fail-Safe

- Dry-run mode for all operations
- Comprehensive validation
- Graceful error handling
- Recovery from failures

### 3. Modular

Each package has a single responsibility:
- `kodrdriv` - CLI and orchestration
- `ai-service` - AI intelligence
- `tree-*` - Multi-package operations
- `git-tools` - Git operations
- `github-tools` - GitHub operations

### 4. Testable

- Mocked external APIs
- Dependency injection
- Isolated components
- Comprehensive test suites

### 5. Configurable

- Hierarchical configuration
- Command-line overrides
- Environment-based settings
- Per-command customization

## Performance Characteristics

### Commit Generation

**Time**: 5-15 seconds
- Git operations: ~1s
- AI analysis: 3-10s (depends on iterations)
- Post-processing: <1s

**API Cost**: $0.01-0.05 per commit (gpt-4o-mini)

### Release Notes Generation

**Time**: 15-45 seconds
- Git operations: ~2s
- GitHub API: 1-3s
- AI analysis: 10-35s (depends on iterations and tools)
- Post-processing: <1s

**API Cost**: $0.05-0.20 per release (gpt-4o-mini)

### Tree Operations (10 packages)

**Sequential**: 5-20 minutes
**Parallel (4 concurrent)**: 2-8 minutes

Depends on command being executed.

## Security Considerations

### Secrets Management

- API keys via environment variables only
- No secrets in configuration files
- Stop-context filtering for output
- Validation of all external inputs

### File System

- Operations scoped to project directory
- Validation of all file paths
- No arbitrary code execution
- Safe handling of symlinks

### External APIs

- Validated API responses
- Error wrapping
- Rate limiting awareness
- Timeout protection

## Extensibility

### Adding Commands

1. Create module in `src/commands/`
2. Add type definitions in `src/types.ts`
3. Register in `src/main.ts`
4. Add CLI interface in `src/arguments.ts`

### Adding AI Tools

1. Define tool in `ai-service/src/tools/`
2. Register in appropriate tool set
3. Update prompts to reference new tool

### Adding Integrations

1. Create utility module
2. Add configuration options
3. Handle authentication
4. Implement error handling

## Implementation References

Detailed implementation documentation in root directory:

- **AI System**: `AI-SERVICE-INTEGRATION-COMPLETE.md`
- **Tree Operations**: `TREE-TOOLKIT-COMPLETE.md`
- **Parallel Execution**: `PARALLEL-PUBLISH-QUICK-REFERENCE.md`
- **Prompt Engineering**: `RIOTPROMPT-COMPLETE-SUMMARY.md`
- **Monorepo Workflows**: `MONOREPO-PUBLISH-IMPROVEMENTS.md`
- **Recovery System**: `CHECKPOINT-RECOVERY-FIX.md`

## Next Steps

- **[Development Guide](./development.md)** - Build and extend kodrdriv
- **[Testing Guide](./testing.md)** - Test structure and execution
- **[AI System Guide](./ai-system.md)** - Deep dive into AI
- **[Full Architecture Docs](../docs/public/architecture.md)** - Complete details

This architecture enables kodrdriv to be powerful, reliable, and extensible while maintaining simplicity for end users.




