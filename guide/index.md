# KodrDriv AI Guide

This directory contains comprehensive documentation designed to help developers and AI assistants understand, integrate, debug, and extend kodrdriv - an AI-powered Git workflow automation tool.

## What is KodrDriv?

KodrDriv automates Git workflows by using AI to generate intelligent commit messages and release notes. It analyzes your code changes, Git history, and project context to create meaningful documentation while automating the entire release process.

**Core Value**: Solves the "context switch" problem - when you're deep in code and Git asks you to summarize what you've done, kodrdriv analyzes your changes and writes documentation that reflects your actual work.

## Guide Contents

### Getting Started
- [**Quick Start**](./quickstart.md): Get kodrdriv working in 5 minutes
- [**Usage**](./usage.md): Common workflows and command examples
- [**Integration**](./integration.md): How to integrate kodrdriv into your project

### Understanding KodrDriv
- [**Architecture**](./architecture.md): System design, packages, and data flow
- [**Commands**](./commands.md): Complete command reference with examples
- [**Configuration**](./configuration.md): All configuration options and patterns

### Development & Debugging
- [**Development**](./development.md): Building, testing, and extending kodrdriv
- [**Debugging**](./debugging.md): Common issues and troubleshooting strategies
- [**Testing**](./testing.md): Test structure and how to run tests

### Advanced Topics
- [**AI System**](./ai-system.md): How AI analysis works (agentic mode, tools, prompts)
- [**Tree Operations**](./tree-operations.md): Multi-package workflow automation
- [**Monorepo Guide**](./monorepo.md): Using kodrdriv in monorepos

## Project Structure

```
kodrdriv/                   - Main CLI tool
├── src/
│   ├── commands/          - Command implementations
│   ├── util/              - Utility functions
│   ├── content/           - Content generation (diffs, logs)
│   └── types.ts           - TypeScript types
├── tests/                 - Test suite
└── docs/                  - Detailed documentation

ai-service/                - AI integration package
├── src/
│   ├── agentic/          - Tool-calling AI agents
│   ├── prompts/          - Prompt engineering
│   └── tools/            - AI tools for analysis
└── tests/                - AI service tests

tree-core/                 - Dependency graph analysis
tree-execution/            - Parallel execution engine
shared/                    - Shared utilities
git-tools/                 - Git operations
github-tools/              - GitHub API integration
audio-tools/               - Audio recording & transcription
```

## Key Capabilities

### 1. Intelligent Commit Messages
Uses AI to analyze your code changes and generate meaningful commit messages:
- Investigates file relationships and dependencies
- Reviews recent commit history to avoid duplicates
- Checks related tests to understand behavior changes
- Suggests splitting unrelated changes into multiple commits

### 2. Comprehensive Release Notes
Generates detailed release notes from Git history:
- Analyzes commits and identifies patterns
- Detects breaking changes automatically
- Integrates with GitHub issues and milestones
- Provides context about how changes relate

### 3. Automated Publishing
Complete release workflow automation:
- Generates release notes
- Creates pull request
- Waits for CI checks
- Merges to main
- Creates GitHub release
- Bumps to next dev version

### 4. Multi-Package Support
Manages monorepos with complex dependencies:
- Analyzes dependency graphs
- Executes commands in correct order
- Parallel execution where possible
- Recovery from failures

### 5. Audio-Driven Workflows
Voice-powered development:
- Record audio for commit context
- Transcribe review notes
- Voice-driven issue creation

## Quick Reference

### Essential Commands

```bash
# Generate commit message
kodrdriv commit --sendit

# Generate release notes
kodrdriv release

# Publish a release
kodrdriv publish

# Multi-package operations
kodrdriv tree publish --parallel

# With context files
kodrdriv release --context-files IMPLEMENTATION.md

# With self-reflection
kodrdriv commit --self-reflection
```

### Essential Configuration

```json
{
  "model": "gpt-4o",
  "outputDirectory": "output",
  "commit": {
    "selfReflection": true,
    "maxAgenticIterations": 10
  },
  "release": {
    "selfReflection": true,
    "maxAgenticIterations": 30
  }
}
```

### Environment Variables

```bash
export OPENAI_API_KEY="your-key"      # Required
export GITHUB_TOKEN="your-token"      # For publish
```

## Key Features

- **AI Analysis (Always On)**: Uses tool-calling to investigate changes before generating content
- **Context Files**: Pass documentation files as context (`--context-files`)
- **Self-Reflection**: Generate reports showing tool effectiveness and analysis quality
- **GitHub Integration**: Issues, milestones, pull requests, releases
- **Flexible Configuration**: Hierarchical config with command-line overrides
- **Stop-Context Filtering**: Automatically remove sensitive information
- **Dry Run Mode**: Preview everything before execution

## Implementation Guides in Root Directory

The `/Users/tobrien/gitw/calenvarek/` directory contains extensive implementation documentation:

### Recent Improvements
- `SELF-REFLECTION-IMPROVEMENTS.md` - File location and prompt improvements
- `CONTEXT-FILES-AND-HUMAN-PROMPTS.md` - Context files and anti-slop prompts
- `AGENTIC-ONLY-SIMPLIFICATION.md` - Simplified to always use AI analysis
- `SESSION-SUMMARY-DEC-31.md` - Complete overview of recent changes

### AI System
- `AI-SERVICE-INTEGRATION-COMPLETE.md` - AI service extraction and integration
- `AGENTIC-RELEASE-NOTES-COMPLETE.md` - Agentic release notes implementation
- `AGENTIC-COMMIT-IMPROVEMENTS.md` - Commit generation improvements
- `AI-FRIENDLY-LOGGING-GUIDE.md` - Logging best practices

### Architecture & Features
- `TREE-TOOLKIT-COMPLETE.md` - Tree operations extraction
- `PARALLEL-PUBLISH-QUICK-REFERENCE.md` - Parallel execution guide
- `RIOTPROMPT-COMPLETE-SUMMARY.md` - Prompt engineering system
- `MONOREPO-PUBLISH-IMPROVEMENTS.md` - Monorepo workflows

### Debugging & Fixes
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Troubleshooting parallel execution
- `RECOVERY-FIXES.md` - Error recovery mechanisms
- `CHECKPOINT-RECOVERY-FIX.md` - Checkpoint system details

## For AI Assistants

If you're an AI helping someone use kodrdriv:

1. **Start with** [`quickstart.md`](./quickstart.md) to get the basics
2. **Read** [`integration.md`](./integration.md) to understand how to integrate into projects
3. **Reference** [`commands.md`](./commands.md) for specific command details
4. **Check** [`debugging.md`](./debugging.md) when troubleshooting
5. **Review** root directory `.md` files for implementation details

## For Developers

If you're integrating kodrdriv:

1. **Install**: `npm install -g @eldrforge/kodrdriv`
2. **Configure**: `kodrdriv --init-config`
3. **Try it**: `kodrdriv commit --dry-run`
4. **Customize**: Edit `.kodrdriv/config.yaml`
5. **Automate**: Add to your CI/CD pipeline

## Next Steps

- 🚀 [Get started in 5 minutes](./quickstart.md)
- 📖 [Learn common workflows](./usage.md)
- 🔧 [Integrate into your project](./integration.md)
- 🐛 [Troubleshoot issues](./debugging.md)
- 🧠 [Understand the AI system](./ai-system.md)

**Need help?** Start with the guide that matches your goal, and refer to the implementation documents in the root directory for detailed technical information.




