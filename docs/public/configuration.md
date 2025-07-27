# Configuration

KodrDriv provides flexible configuration options through command-line arguments, configuration files, and environment variables. This section covers all available configuration methods and options.

## Getting Started with Configuration

### Initialize Configuration

To quickly get started with KodrDriv configuration, you can use the `--init-config` command to generate an initial configuration file with common default values:

```bash
kodrdriv --init-config
```

This command will:

1. Create a `.kodrdriv` directory in your current working directory (if it doesn't exist)
2. Generate a `config.yaml` file with sensible defaults based on your project structure
3. Include commonly used configuration options that you can customize

The generated configuration file will contain default settings for:
- AI model preferences
- Common command options
- Context directories for your project
- Basic exclude patterns

**Custom Configuration Directory:**

You can also specify a custom location for the configuration:

```bash
kodrdriv --init-config --config-dir ~/my-custom-kodrdriv-config
```

This is particularly useful if you want to:
- Create global configuration in your home directory
- Set up configuration for a specific environment
- Initialize configuration in a shared team location

> [!TIP]
> After running `--init-config`, review and customize the generated `config.yaml` file to match your project's specific needs. The generated file serves as a starting point that you can modify to fit your workflow.

## Configuration File

You can create a `config.yaml` file in your `.kodrdriv` directory to set default options for all commands. This allows you to avoid repeating command-line options and ensures consistent behavior across your project.

Example configuration file (`.kodrdriv/config.yaml`):

```yaml
model: gpt-4o-mini
verbose: true
contextDirectories:
  - src
  - docs
publish:
  mergeMethod: merge
  dependencyUpdatePatterns:
    - "@company/*"
    - "@myorg/*"
  requiredEnvVars:
    - NODE_AUTH_TOKEN
    - CUSTOM_TOKEN
  linkWorkspacePackages: true
  unlinkWorkspacePackages: true
commit:
  add: true
  messageLimit: 5
release:
  from: main
  to: HEAD
  messageLimit: 10
link:
  scopeRoots:
    "@company": "../"
    "@myorg": "../../org-packages/"
    "@tools": "../shared-tools/"
publishTree:
  directory: "./packages"
  excludedPatterns:
    - "**/*-demo"
    - "**/test-packages/**"
  parallel: true
  script: "npm run build"
excludedPatterns:
  - node_modules
  - dist
  - "*.log"
```

Configuration options set in the file can be overridden by command-line arguments. The precedence order is:
1. Command-line arguments (highest priority)
2. Configuration file
3. Default values (lowest priority)

## Hierarchical Configuration

KodrDriv supports hierarchical configuration, which means it will automatically search for and merge configuration files from parent directories. This allows you to set global defaults at higher directory levels while still being able to override them for specific projects.

**How it works:**

1. **Directory Traversal**: Starting from your current working directory, KodrDriv searches upward through parent directories looking for `.kodrdriv/config.yaml` files.

2. **Automatic Merging**: Configuration files found in parent directories are merged together, with configurations closer to your current directory taking precedence over those higher up.

3. **Final Override**: Command-line arguments have the highest precedence and will override any configuration file settings.

**Example Hierarchy:**

```
/home/user/
├── .kodrdriv/
│   └── config.yaml          # Global user defaults
└── projects/
    ├── .kodrdriv/
    │   └── config.yaml      # Project-specific defaults
    └── my-app/
        ├── .kodrdriv/
        │   └── config.yaml  # App-specific overrides
        └── src/             # Your working directory
```

When running KodrDriv from `/home/user/projects/my-app/src/`, the configuration hierarchy would be:

1. **Base defaults** (built into KodrDriv)
2. **Global config** (`/home/user/.kodrdriv/config.yaml`)
3. **Project config** (`/home/user/projects/.kodrdriv/config.yaml`)
4. **App config** (`/home/user/projects/my-app/.kodrdriv/config.yaml`)
5. **Command-line arguments** (highest priority)

**Use Cases:**

- **Team Standards**: Store team-wide configuration defaults in your repository root
- **Personal Preferences**: Keep personal defaults in your home directory
- **Project-Specific Settings**: Override settings for specific projects or environments
- **Monorepo Management**: Different packages in a monorepo can have their own settings while inheriting common defaults

**Debugging Configuration:**

Use the `--check-config` flag to see exactly how your configuration is being merged:

```bash
kodrdriv --check-config
```

This will show you which configuration files are being loaded and how the final configuration values are determined.

## Configuration Directory

KodrDriv uses a configuration directory to store custom settings, instructions, and other configuration files. You can specify a custom location using the `--config-dir` option:

```bash
kodrdriv --config-dir ~/custom-kodrdriv-config
```

By default, the configuration directory is set to `.kodrdriv` in your current working directory. This directory is created automatically if it doesn't exist.

The configuration directory structure is as follows:

```
.kodrdriv/
├── instructions/
│   ├── commit.md         # Override for commit instructions
│   ├── commit-pre.md     # Content prepended to default commit instructions
│   ├── commit-post.md    # Content appended to default commit instructions
│   ├── release.md        # Override for release instructions
│   ├── release-pre.md    # Content prepended to default release instructions
│   └── release-post.md   # Content appended to default release instructions
├── config.yaml           # Main configuration file
└── ...                   # Other configuration files
```

## Environment Variables

### OpenAI Configuration

KodrDriv requires OpenAI API credentials for AI-powered features:

- `OPENAI_API_KEY`: OpenAI API key (required)

You can also set the model via command line:

- `--model <model>`: OpenAI model to use (default: 'gpt-4o-mini')

> [!NOTE]
> ### Security Considerations
>
> The OpenAI API key should be handled securely and is only available via environment variables. KodrDriv automatically loads environment variables from a `.env` file in your current working directory.
>
> While environment variables are a common approach for configuration, they can still pose security risks if not properly managed. We strongly encourage users to utilize secure credential management solutions like 1Password, HashiCorp Vault, or other keystores to protect sensitive information. This helps prevent accidental exposure of API keys and other credentials in logs, process listings, or environment dumps.

### GitHub Configuration

For publish command functionality:

- `GITHUB_TOKEN`: Required for GitHub API operations (creating pull requests, releases, etc.)

### Editor Configuration

For interactive workflows like review and issue editing:

- `EDITOR`: Your preferred text editor (optional, defaults to `vi`)
- `VISUAL`: Alternative editor variable (used as fallback if `EDITOR` is not set)

KodrDriv will use your configured editor to open temporary files during interactive workflows. Common examples:

**For vi/vim users:**
```bash
export EDITOR=vi
# Or for vim with specific options
export EDITOR="vim -c 'set textwidth=80'"
```

**For emacs users:**
```bash
export EDITOR=emacs
# Or for emacs in terminal mode
export EDITOR="emacs -nw"
```

**For other editors:**
```bash
export EDITOR=nano
export EDITOR=code        # VS Code (requires --wait flag: "code --wait")
export EDITOR=subl        # Sublime Text (requires --wait flag: "subl --wait")
```

> [!TIP]
> ### GUI Editor Configuration
>
> When using GUI editors like VS Code or Sublime Text, make sure to include the `--wait` flag so the editor waits for you to close the file before continuing:
> ```bash
> export EDITOR="code --wait"
> export EDITOR="subl --wait"
> ```

### Additional Environment Variables

The publish command supports configurable additional environment variables specific to your project:

```yaml
publish:
  requiredEnvVars:
    - NODE_AUTH_TOKEN
    - DEPLOY_KEY
    - CUSTOM_API_TOKEN
    - CODECOV_TOKEN
```

## Excluded Patterns

Filter out specific files or directories from analysis:

- `--excluded-paths [excludedPatterns...]`: Paths to exclude from the diff (can specify multiple patterns)

Examples:
```bash
# Exclude specific files or directories from diff analysis
kodrdriv commit --excluded-paths "*.lock" "dist/" "node_modules/"

# Exclude patterns from release notes
kodrdriv release --excluded-paths "package-lock.json"
```

You can also configure excluded patterns in your configuration file:

```yaml
excludedPatterns:
  - node_modules
  - dist
  - "*.log"
  - "*.lock"
```

## Command-Specific Configuration

### Commit Configuration

```yaml
commit:
  add: true
  messageLimit: 5
  cached: false
  sendit: false
```

### Release Configuration

```yaml
release:
  from: main
  to: HEAD
  messageLimit: 10
```

### Publish Configuration

```yaml
publish:
  mergeMethod: squash
  dependencyUpdatePatterns:
    - "@company/*"
  requiredEnvVars:
    - NODE_AUTH_TOKEN
  linkWorkspacePackages: true
  unlinkWorkspacePackages: true
  waitForReleaseWorkflows: true
  releaseWorkflowsTimeout: 600000
  releaseWorkflowNames:
    - "Release to NPM"
    - "Deploy to Production"
```

#### Automatic Workflow Detection

By default, KodrDriv will automatically detect which GitHub Actions workflows will be triggered by release events by analyzing your workflow files (`.github/workflows/*.yml`). This includes workflows that:

- Are triggered by `release` events (e.g., `on: release` or `on: { release: { types: [published] } }`)
- Are triggered by `push` events on version tags (e.g., `on: { push: { tags: ['v*'] } }`)

If you want to override this automatic detection, you can specify `releaseWorkflowNames` in your configuration. When specified, KodrDriv will only wait for those specific workflows to complete.

**Example workflow patterns that are automatically detected:**

```yaml
# Release event trigger
on:
  release:
    types: [published, created]

# Tag push trigger
on:
  push:
    tags:
      - 'v*'
      - 'release/*'

# Multiple triggers including release
on: [push, release]
```

### Link Configuration

```yaml
link:
  scopeRoots:
    "@company": "../"
    "@myorg": "../../org-packages/"
```

### Publish Tree Configuration

```yaml
publishTree:
  directory: "./packages"
  excludedPatterns:
    - "**/*-demo"
    - "**/test-packages/**"
  startFrom: "core-package"
  script: "npm run build"
  cmd: "npm test && npm run lint"
  publish: false
  parallel: true
```

The `publishTree` configuration allows you to control how KodrDriv manages multi-package workspaces and monorepos:

- `directory`: Target directory containing multiple packages (defaults to current directory)
- `excludedPatterns`: Array of glob patterns to exclude packages from processing
- `startFrom`: Resume build order from this package directory name (useful for restarting failed builds)
- `script`: Script command to execute in each package directory (e.g., `"npm run build"`)
- `cmd`: Shell command to execute in each package directory (e.g., `"git add -A"`)
- `publish`: Whether to execute the kodrdriv publish command in each package directory
- `parallel`: Execute packages in parallel when dependencies allow (packages with no interdependencies run simultaneously)

**Parallel Execution Benefits:**

When `parallel: true` is enabled, packages are grouped into dependency levels and executed in parallel where possible:

- **Level 0**: Packages with no local dependencies (run simultaneously)
- **Level 1**: Packages that depend only on Level 0 packages (run simultaneously after Level 0)
- **Level N**: Continue this pattern through all dependency levels

This can significantly reduce total execution time for large monorepos while maintaining proper dependency order.

**Command Priority:**

If multiple execution options are provided, they follow this priority order:
1. `publish` (highest priority)
2. `cmd`
3. `script` (lowest priority)

## Basic Options

Global options that apply to all commands:

- `--dry-run`: Perform a dry run without saving files (default: false)
- `--verbose`: Enable verbose logging (default: false)
- `--debug`: Enable debug logging (default: false)
- `--overrides`: Enable instruction overrides (allows custom instruction files to override defaults)
- `--config-dir <configDir>`: Specify a custom configuration directory (default: '.kodrdriv')
- `--check-config`: Display the current configuration hierarchy showing how values are merged from defaults, config files, and CLI arguments. This is useful for debugging configuration issues and understanding which settings are active.
- `--init-config`: Generate an initial configuration file with common default values in the specified config directory (default: '.kodrdriv')
- `--version`: Display version information
