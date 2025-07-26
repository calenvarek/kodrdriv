# Installation Guide

## Global Installation (Recommended)

### Via npm

```bash
# Install globally via npm
npm install -g @eldrforge/kodrdriv

# Or with npm (recommended)
npm add -g @eldrforge/kodrdriv
```

### Via Yarn

```bash
# Install globally via yarn
yarn global add @eldrforge/kodrdriv
```

### Verify Installation

```bash
kodrdriv --version
```

## Package Manager Comparison

### npm (Recommended)

npm is the default package manager for Node.js and provides excellent compatibility and performance:

```bash
# Using npm (fast, well-supported)
npm add -g @eldrforge/kodrdriv
```

npm offers:
- ✅ **Universal compatibility** - Works everywhere Node.js does
- ✅ **Built-in security** - Automatic security audit on install
- ✅ **Excellent caching** - Fast subsequent installs
- ✅ **Workspaces support** - For monorepo development

### Alternative Package Managers

#### Yarn

```bash
# Using yarn
yarn global add @eldrforge/kodrdriv
```



## Development Installation

If you want to contribute to the project or install from source:

```bash
# Clone the repository
git clone https://github.com/calenvarek/kodrdriv.git
cd kodrdriv

# Install dependencies
npm install

# Build the project
npm run build

# Link for global access
npm link --global
```

## System Requirements

- **Node.js**: Version 18 or higher (20+ recommended)
- **npm** or **yarn** package manager
- **Git**: For repository operations
- **OpenAI API Key**: Required for AI-powered features

### Verifying Node.js Version

```bash
node --version  # Should show v18.0.0 or higher
```

### Setting up OpenAI API Key

```bash
# Set environment variable (recommended)
export OPENAI_API_KEY="your-api-key-here"

# Or add to your shell profile (.bashrc, .zshrc, etc.)
echo 'export OPENAI_API_KEY="your-api-key-here"' >> ~/.zshrc
```

## Optional Dependencies

### GitHub Integration

For GitHub-specific features like pull request creation and issue management:

```bash
# Set GitHub token (optional but recommended)
export GITHUB_TOKEN="your-github-token-here"
```

### Audio Features

For audio recording and transcription features:

- **macOS**: No additional dependencies
- **Linux**: May require `sox` and `alsa-utils`
- **Windows**: May require Windows Media Format SDK

```bash
# Linux (Ubuntu/Debian)
sudo apt-get install sox alsa-utils

# Linux (CentOS/RHEL)
sudo yum install sox alsa-utils
```

## Configuration

After installation, you can generate a default configuration:

```bash
kodrdriv --init-config
```

This creates a configuration file in `~/.kodrdriv/config.yaml` where you can customize default behaviors.

## Updating

### npm

```bash
# Or with npm
npm update -g @eldrforge/kodrdriv
```

### Yarn

```bash
yarn global upgrade @eldrforge/kodrdriv
```

## Uninstalling

```bash
# Or with npm
npm remove -g @eldrforge/kodrdriv

# Remove configuration (optional)
rm -rf ~/.kodrdriv
```

### Remove Global Link (Development)

If you installed via `npm link`:

```bash
npm unlink --global
```
