# Installation Guide

This guide covers how to install kodrdriv so you can run it as a command-line tool from anywhere on your system.

## Quick Start

The easiest way to install kodrdriv is via npm:

```bash
# Install globally with npm
npm install -g @eldrforge/kodrdriv

# Or with pnpm (recommended)
pnpm add -g @eldrforge/kodrdriv

# Or with yarn
yarn global add @eldrforge/kodrdriv
```

After installation, verify it works:

```bash
kodrdriv --help
```

## Installation Methods

### 1. Install from npm Registry

This is the recommended method for most users:

```bash
# Using npm
npm install -g @eldrforge/kodrdriv

# Using pnpm (faster, more efficient)
pnpm add -g @eldrforge/kodrdriv

# Using yarn
yarn global add @eldrforge/kodrdriv
```

**Pros:**
- Simple and fast
- Automatic updates available
- Works on all platforms

### 2. Install from GitHub

Install directly from the source repository:

```bash
# Using npm
npm install -g git+https://github.com/calenvarek/kodrdriv.git

# Using pnpm
pnpm add -g git+https://github.com/calenvarek/kodrdriv.git
```

**Pros:**
- Get the latest development version
- Access to unreleased features

**Cons:**
- May include unstable features
- Requires git to be installed

### 3. Install from Local Source

For developers who want to contribute or modify kodrdriv:

```bash
# Clone the repository
git clone https://github.com/calenvarek/kodrdriv.git
cd kodrdriv

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Link globally
pnpm link --global
# or with npm
npm link
```

**Pros:**
- Full access to source code
- Easy to make modifications
- Can contribute back to the project

**Cons:**
- Requires build tools
- More complex setup

### 4. Run Without Installing

Use npx to run kodrdriv without installing it globally:

```bash
# Run from npm registry
npx @eldrforge/kodrdriv commit

# Run from GitHub
npx git+https://github.com/calenvarek/kodrdriv.git release
```

**Pros:**
- No installation required
- Always runs the latest version
- Great for trying it out

**Cons:**
- Slower (downloads each time)
- Requires internet connection

## Verification

After installation, verify kodrdriv is working correctly:

```bash
# Check if kodrdriv is in your PATH
which kodrdriv

# Show version information
kodrdriv --version

# Display available commands
kodrdriv --help
```

You should see output similar to:

```
Usage: kodrdriv [options] [command]

Create Intelligent Release Notes or Change Logs from Git

Options:
  -V, --version                             output the version number
  -c, --config-directory <configDirectory>  Config Directory (default: ".kodrdriv")
  -h, --help                                display help for command

Commands:
  commit [options]                          Generate commit notes
  release [options]                         Generate release notes
  help [command]                            display help for command
```

## Basic Usage

Once installed, you can use kodrdriv with these common commands:

```bash
# Generate intelligent commit messages
kodrdriv commit

# Generate release notes
kodrdriv release

# Get help for specific commands
kodrdriv commit --help
kodrdriv release --help
```

## Prerequisites

Before installing kodrdriv, ensure you have:

- **Node.js** (version 16 or higher)
- **npm**, **pnpm**, or **yarn** package manager
- **Git** (for Git repository operations)
- **OpenAI API Key** (set as `OPENAI_API_KEY` environment variable)

### Setting Up OpenAI API Key

kodrdriv requires an OpenAI API key to function. Set it up:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export OPENAI_API_KEY="your-api-key-here"

# Or create a .env file in your project directory
echo "OPENAI_API_KEY=your-api-key-here" > .env
```

## Troubleshooting

### Command Not Found

If you get "command not found" after installation:

1. **Check your PATH:**
   ```bash
   echo $PATH
   ```

2. **Verify npm global bin directory:**
   ```bash
   npm config get prefix
   ```

3. **Add npm global bin to PATH:**
   ```bash
   # Add to your ~/.bashrc or ~/.zshrc
   export PATH="$PATH:$(npm config get prefix)/bin"
   ```

### Permission Issues

If you encounter permission errors:

```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use a Node version manager like nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### Windows Installation

For Windows users:

1. **Use PowerShell or Command Prompt as Administrator**
2. **Install via npm:**
   ```cmd
   npm install -g @eldrforge/kodrdriv
   ```
3. **Verify installation:**
   ```cmd
   kodrdriv --version
   ```

## Updating kodrdriv

Keep kodrdriv up to date:

```bash
# Update global installation
npm update -g @eldrforge/kodrdriv

# Or with pnpm
pnpm update -g @eldrforge/kodrdriv

# Check current version
kodrdriv --version
```

## Uninstalling

To remove kodrdriv:

```bash
# Uninstall global package
npm uninstall -g @eldrforge/kodrdriv

# Or with pnpm
pnpm remove -g @eldrforge/kodrdriv

# For linked local installations
npm unlink -g
# or
pnpm unlink --global
```

## Next Steps

After installation:

1. **Configure your environment** - Set up your OpenAI API key
2. **Read the [Configuration Guide](configuration.md)** - Learn about config files and options
3. **Try the [Examples](examples.md)** - See kodrdriv in action
4. **Check [Commands Reference](commands.md)** - Detailed command documentation

## Getting Help

If you encounter issues:

- Check the [FAQ](../README.md#faq)
- Review [troubleshooting tips](../README.md#troubleshooting)
- Open an issue on [GitHub](https://github.com/calenvarek/kodrdriv/issues)
- Join our community discussions
