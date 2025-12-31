# KodrDriv

KodrDriv is an AI-powered Git workflow automation tool that generates intelligent commit messages and release notes from your code changes. It analyzes your repository to create meaningful documentation while automating the entire release process.

## 🤖 For AI Assistants

**Complete AI Guide**: [`AI-GUIDE.md`](AI-GUIDE.md) - Comprehensive documentation for AI assistants helping with kodrdriv

**Quick Start**: [`guide/index.md`](guide/index.md) - Navigation hub for all guides

## Why KodrDriv?

Writing good commit messages and release notes is time-consuming and often done when you're least in the mood for reflection. **KodrDriv was created specifically to solve the "context switch" problem** that happens when you've been deep in code and Git asks you to summarize what you've done.

KodrDriv reads your code changes and Git history to automatically generate contextual, meaningful documentation that reflects your actual work.

## Installation

```bash
npm install -g @eldrforge/kodrdriv
```


## Quick Start

### Generate a Commit Message
```bash
git add .
kodrdriv commit

# With detailed analysis report
kodrdriv commit --self-reflection

# With context files
kodrdriv commit --context-files IMPLEMENTATION.md --sendit
```

### Generate Release Notes
```bash
kodrdriv release

# With context and analysis
kodrdriv release --context-files CHANGELOG.md --self-reflection
```

### Automate Your Release Process
```bash
kodrdriv publish
```

### Audio-Driven Development
```bash
kodrdriv select-audio  # Configure microphone (one-time setup)
kodrdriv audio-commit  # Record audio to generate commit messages
```

## Key Features

- **AI-Powered Analysis** - Uses OpenAI models with tool-calling for deep investigation
  - Always-on agentic mode for intelligent analysis
  - 13 specialized tools for release notes generation
  - 8 tools for commit message generation
  - Self-reflection reports with tool effectiveness metrics
  - Configurable iteration limits for complex releases
- **Context Files (NEW)** - Pass documentation files as context for better AI understanding
- **Human-Readable Output** - Professional tone without AI slop, emojis, or marketing speak
- **GitHub Issues Integration** - Automatically analyzes recently closed issues to provide context for commit messages, prioritizing milestone-relevant issues
- **Stop-Context Filtering** - Automatically filters sensitive information from AI-generated content to maintain privacy across projects
- **Adaptive Diff Management** - Automatically handles large diffs with intelligent truncation and retry logic to ensure reliable LLM processing
- **Comprehensive Release Automation** - Handles dependency updates, version bumping, PR creation, and GitHub releases
- **Audio-Driven Workflows** - Record audio to provide context for commits and reviews
- **Intelligent Workspace Management** - Provides tools for linking and managing related packages in monorepos
- **Flexible Configuration** - Hierarchical configuration with command-line overrides

## Configuration

Set up your environment variables:
```bash
export OPENAI_API_KEY="your-openai-api-key"
export GITHUB_TOKEN="your-github-token"  # Required for publish command
```

Initialize configuration files:
```bash
kodrdriv --init-config
kodrdriv --check-config
```

## Documentation

📚 **Comprehensive Documentation**

### 🤖 AI-Friendly Guides

**NEW**: Complete guide system designed for AI assistants and developers:
- **[AI Guide (Master)](AI-GUIDE.md)** - Complete reference for AI assistants
- **[Guide Directory](guide/)** - 13 focused guides covering everything
  - [Quick Start](guide/quickstart.md) - 5-minute setup
  - [Integration](guide/integration.md) - Add to your project
  - [Usage](guide/usage.md) - Common workflows
  - [Commands](guide/commands.md) - Quick reference
  - [Configuration](guide/configuration.md) - All options
  - [AI System](guide/ai-system.md) - How AI works
  - [Debugging](guide/debugging.md) - Troubleshooting
  - [Architecture](guide/architecture.md) - System design
  - [Development](guide/development.md) - Extend kodrdriv
  - [Testing](guide/testing.md) - Test suite
  - [Tree Operations](guide/tree-operations.md) - Multi-package
  - [Monorepo](guide/monorepo.md) - Monorepo workflows

### Commands
- **[All Commands Overview](docs/public/commands.md)** - Complete command reference with examples
- **[commit](docs/public/commands/commit.md)** - Generate intelligent commit messages
- **[audio-commit](docs/public/commands/audio-commit.md)** - Record audio for commit context
- **[review](docs/public/commands/review.md)** - Analyze review notes and create GitHub issues
- **[audio-review](docs/public/commands/audio-review.md)** - Record audio for review analysis
- **[release](docs/public/commands/release.md)** - Generate comprehensive release notes
- **[publish](docs/public/commands/publish.md)** - Automate the entire release process
- **[link](docs/public/commands/link.md)** - Link local packages for development
- **[unlink](docs/public/commands/unlink.md)** - Remove workspace links
- **[clean](docs/public/commands/clean.md)** - Clean generated files
- **[select-audio](docs/public/commands/select-audio.md)** - Configure audio device

### Configuration & Customization
- **[Configuration](docs/public/configuration.md)** - All configuration options and environment variables
- **[Customization](docs/public/customization.md)** - Custom instructions, personas, and override structures
- **[Examples](docs/public/examples.md)** - Practical usage examples and common workflows

### Technical Details
- **[Architecture](docs/public/architecture.md)** - Technical architecture and design
- **[Assumptions](docs/public/assumptions.md)** - Development assumptions and conventions

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache-2.0 - see [LICENSE](LICENSE) file for details.

## About the Name

Like Thor's hammer, this tool smashes through your repetitive coding tasks. But unlike Mjölnir, it won't make you worthy — it'll just make you faster. Strike through commits, forge releases, and channel the lightning of AI to automate your workflow. Because sometimes you need a hammer, and sometimes you need a tool that actually works. Pirate.
TEST
