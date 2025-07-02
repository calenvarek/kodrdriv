# KodrDriv

KodrDriv is a powerful utility designed to automatically generate intelligent release notes and commit messages from your Git repository. It analyzes commit history, pull requests, and related metadata to create comprehensive, well-structured documentation of your project's evolution. By leveraging advanced AI-powered analysis, it helps teams maintain clear visibility into their codebase's development history while reducing the manual effort typically required for changelog maintenance.

## What is KodrDriv?

KodrDriv is an AI-powered Git workflow automation tool designed to solve the common problem of writing meaningful commit messages and release notes. It provides a unified way to:

- **Generate intelligent commit messages** from your code changes
- **Create comprehensive release notes** automatically from Git history
- **Automate the entire release process** with pull request and GitHub integration
- **Manage workspace dependencies** for monorepo and multi-package development
- **Maintain consistent documentation** with minimal manual effort

## Why KodrDriv?

Writing good commit messages and release notes is time-consuming and often done when you're least in the mood for reflection. **KodrDriv was created specifically to solve the "context switch" problem that happens when you've been deep in code and Git asks you to summarize what you've done.**

Without KodrDriv, you need to manually:
- Stop your flow to write commit messages
- Remember all the changes you made across multiple files
- Craft meaningful release notes from scattered commit messages
- Coordinate complex release workflows with multiple steps

KodrDriv reads your code changes and Git history to automatically generate contextual, meaningful documentation that reflects your actual work.

## Installation

Install KodrDriv globally using npm:

```bash
npm install -g @eldrforge/kodrdriv
```

This will make the `kodrdriv` command available globally on your system.

## Quick Start

Here's how to get started with KodrDriv:

### Generate a Commit Message

```bash
# Make some changes to your code
git add .
kodrdriv commit
```

### Generate Release Notes

```bash
# Generate release notes from your recent changes
kodrdriv release
```

### Automate Your Release Process

```bash
# Fully automated release with dependency updates, PR creation, and GitHub release
kodrdriv publish
```

### Link Local Packages for Development

```bash
# Automatically link workspace packages for local development
kodrdriv link --scope-roots '{"@company": "../"}'
```

## Key Features

### AI-Powered Analysis
Uses OpenAI models to understand your code changes and generate contextual commit messages and release notes.

### Comprehensive Release Automation
The `publish` command handles dependency updates, version bumping, PR creation, status checks, merging, and GitHub releases.

### Intelligent Workspace Management
Automatically discovers and links related packages in monorepos and multi-package projects.

### Flexible Configuration
Supports hierarchical configuration with command-line overrides, config files, and environment variables.

### Custom Instructions
Extend or replace default AI instructions to match your project's specific conventions and requirements.

## Documentation

📚 **Complete Documentation**

**Quick Links:**
- [Commands](docs/public/commands.md) - Detailed documentation of all commands (commit, release, publish, link)
- [Configuration](docs/public/configuration.md) - All configuration options, hierarchical config, and environment variables  
- [Advanced Usage](docs/public/advanced-usage.md) - Custom instructions, context, prompt structure, and advanced features
- [Examples](docs/public/examples.md) - Practical usage examples and common workflows

## Basic Command Options

- `--dry-run`: Perform a dry run without saving files
- `--verbose`: Enable verbose logging  
- `--debug`: Enable debug logging
- `--check-config`: Display current configuration hierarchy
- `--version`: Display version information

For complete command-line options and detailed usage, see the [Configuration Documentation](docs/public/configuration.md).

## Environment Variables

KodrDriv requires OpenAI API credentials for AI-powered features:

- `OPENAI_API_KEY`: OpenAI API key (required)
- `GITHUB_TOKEN`: Required for publish command and GitHub operations

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache-2.0 - see [LICENSE](LICENSE) file for details.

## About the Name

Like Thor's hammer, this tool smashes through your repetitive coding tasks. But unlike Mjölnir, it won't make you worthy — it'll just make you faster. Strike through commits, forge releases, and channel the lightning of AI to automate your workflow. Because sometimes you need a hammer, and sometimes you need a tool that actually works. Use it.