# Tree Command

Analyze dependency order and execute commands across multiple packages in a workspace:

```bash
# Execute custom commands
kodrdriv tree --cmd "npm install"

# Execute built-in kodrdriv commands
kodrdriv tree commit
kodrdriv tree publish
kodrdriv tree link
kodrdriv tree unlink
```

The `tree` command is designed for workspace environments where you have multiple packages with interdependencies. It provides two execution modes:

1. **Custom Command Mode**: Execute any shell command across packages (original functionality)
2. **Built-in Command Mode**: Execute kodrdriv commands with proper configuration isolation

The command analyzes your workspace structure, builds a dependency graph, determines the correct order for processing packages, and executes operations in each package in the correct dependency order.

## Execution Modes

### Custom Command Mode
Execute any shell command across all packages:
```bash
kodrdriv tree --cmd "npm install"
kodrdriv tree --cmd "git status"
kodrdriv tree --cmd "npm run build" --parallel
```

### Built-in Command Mode
Execute kodrdriv commands with configuration isolation:
```bash
kodrdriv tree commit --parallel
kodrdriv tree publish --start-from my-package
kodrdriv tree link --excluded-patterns "test-*"
kodrdriv tree unlink --dry-run
```

**Supported Built-in Commands**: `commit`, `publish`, `link`, `unlink`

> [!IMPORTANT]
> ### Configuration Isolation in Built-in Command Mode
>
> When using built-in commands, tree shells out to separate `kodrdriv` processes for each package. This preserves individual project configurations - each package can have its own `.kodrdriv` configuration, preferences, and context directories. This is crucial for maintaining package-specific settings in multi-project workspaces.

For detailed documentation of built-in commands, see [Tree Built-in Commands](tree-built-in-commands.md).

## What It Does

1. **Package Discovery**: Scans the target directories (current directory by default) for all `package.json` files in subdirectories
2. **Dependency Analysis**: Reads each package's dependencies and identifies local workspace dependencies
3. **Topological Sorting**: Creates a dependency graph and performs topological sorting to determine the correct build order
4. **Command Execution**: Executes the specified command in each package directory in the correct dependency order

## Key Features

- **Multi-Directory Analysis**: Analyze dependencies across multiple directory trees in a single command
- **Circular Dependency Detection**: Identifies and reports circular dependencies between packages
- **Resume Capability**: Can resume from a specific package if a previous run failed
- **Flexible Command Execution**: Execute any shell command across all packages
- **Parallel Execution**: Execute packages in parallel when dependencies allow, significantly speeding up operations
- **Pattern Exclusion**: Exclude specific packages or directories from processing
- **Dry Run Mode**: Preview the build order and execution plan without making changes

## Command Options

- `[command]`: Built-in kodrdriv command to execute (`commit`, `publish`, `link`, `unlink`)
- `--directories [directories...]`: Target directories containing multiple packages (defaults to current directory). Multiple directories can be specified to analyze dependencies across separate directory trees.
- `--start-from <startFrom>`: Resume execution from this package directory name (useful for restarting failed operations)
- `--cmd <cmd>`: Shell command to execute in each package directory (e.g., `"npm install"`, `"git status"`)
- `--parallel`: Execute packages in parallel when dependencies allow (packages with no interdependencies run simultaneously)
- `--excluded-patterns [excludedPatterns...]`: Patterns to exclude packages from processing (e.g., `"**/node_modules/**"`, `"dist/*"`)

> [!NOTE]
> ### Command Priority
>
> If both a built-in command and `--cmd` are specified, the built-in command takes precedence and `--cmd` is ignored.

## Multi-Directory Dependency Analysis

One of the powerful features of the `tree` command is its ability to analyze dependencies across multiple separate directory trees. This is particularly useful in development environments where:

- **Open Source Dependencies**: Your main codebase references open source modules that are maintained in separate directory structures
- **Microservices Architecture**: Different services are stored in separate repositories or directories but share common libraries
- **Monorepo with External Dependencies**: Your monorepo depends on packages that are developed and maintained outside the main repository structure

### Common Multi-Directory Scenarios

#### Scenario 1: Main Codebase + Open Source Modules
```
project-root/
├── main-app/           # Your main application
│   ├── api/
│   ├── ui/
│   └── core/
└── oss-modules/        # Open source modules you maintain
    ├── shared-utils/
    ├── auth-lib/
    └── data-models/
```

#### Scenario 2: Separate Client and Shared Libraries
```
workspace/
├── client-apps/        # Frontend applications
│   ├── web-app/
│   ├── mobile-app/
│   └── admin-portal/
└── shared-libs/        # Shared libraries
    ├── ui-components/
    ├── business-logic/
    └── api-client/
```

### Multi-Directory Usage Examples

#### Analyze Dependencies Across Multiple Trees
```bash
kodrdriv tree --directories ./main-app ./oss-modules
```

#### Execute Commands Across All Directory Trees
```bash
kodrdriv tree --directories ./client-apps ./shared-libs --cmd "npm install"
```

#### Build Dependencies in Correct Order Across Trees
```bash
kodrdriv tree --directories ./main-app ./oss-modules --cmd "npm run build" --parallel
```

#### Custom Directory Structures
```bash
kodrdriv tree --directories /path/to/workspace /path/to/external-deps /path/to/shared-libs --cmd "npm test"
```

### Benefits of Multi-Directory Analysis

1. **Unified Dependency Resolution**: Resolves dependencies across all specified directories as if they were part of a single workspace
2. **Correct Build Order**: Ensures packages are built in the correct order even when dependencies span multiple directory trees
3. **Simplified Workflow**: Execute commands across your entire development ecosystem with a single command
4. **Cross-Directory Linking**: Identifies when packages in one directory depend on packages in another directory

### Multi-Directory Best Practices

1. **Consistent Naming**: Use consistent package naming across all directories to avoid conflicts
2. **Clear Separation**: Keep different types of packages (applications, libraries, utilities) in separate directories
3. **Documentation**: Document which directories contain which types of packages for team clarity
4. **Version Management**: Consider how package versions are managed across different directory trees

## Usage Examples

### Built-in Command Execution

Execute kodrdriv commands across all packages in dependency order:

```bash
# Commit changes across all packages that need it
kodrdriv tree commit

# Publish all packages in dependency order
kodrdriv tree publish --parallel

# Link all workspace packages for development
kodrdriv tree link

# Unlink workspace packages
kodrdriv tree unlink --dry-run
```

### Custom Command Execution

Execute shell commands across all packages in dependency order:

```bash
# Install dependencies in all packages
kodrdriv tree --cmd "npm install"

# Run tests across all packages
kodrdriv tree --cmd "npm test"
```

### Parallel Execution

Speed up operations by running independent packages in parallel:

```bash
# Parallel built-in commands
kodrdriv tree commit --parallel
kodrdriv tree publish --parallel

# Parallel custom commands
kodrdriv tree --cmd "npm run build" --parallel
```

### Resume from Failed Package

If a command fails, resume from the failed package:

```bash
# Resume built-in commands
kodrdriv tree commit --start-from my-package
kodrdriv tree publish --start-from my-package

# Resume custom commands
kodrdriv tree --cmd "npm run test" --start-from my-package
```

### Multiple Custom Directories

Analyze packages across multiple directory trees:

```bash
kodrdriv tree --directories /path/to/main-workspace /path/to/shared-libs --cmd "npm audit"
```

### Exclude Patterns

Skip certain packages from processing:

```bash
kodrdriv tree --cmd "npm run lint" --excluded-patterns "test-*" "internal-*"
```

### Dry Run

Preview the execution plan without running commands:

```bash
kodrdriv tree --cmd "npm run build" --dry-run
```

### Display Only

Show dependency order without executing any commands:

```bash
kodrdriv tree
```

## Common Use Cases

### Package Installation
```bash
# Install dependencies in all packages
kodrdriv tree --cmd "npm install"

# Install and build everything in parallel
kodrdriv tree --cmd "npm install && npm run build" --parallel
```

### Code Quality
```bash
# Run linting across all packages
kodrdriv tree --cmd "npm run lint"

# Run tests in dependency order
kodrdriv tree --cmd "npm test"
```

### Development Workflow
```bash
# Clean all packages
kodrdriv tree --cmd "npm run clean"

# Check git status across packages
kodrdriv tree --cmd "git status"

# Update all packages to latest versions
kodrdriv tree --cmd "npm update"
```

### Environment Setup
```bash
# Install dependencies and link packages
kodrdriv tree --cmd "npm install"
kodrdriv link

# Build everything after linking
kodrdriv tree --cmd "npm run build" --parallel
```

## Understanding Dependency Levels

When using `--parallel`, the command groups packages into dependency levels:

- **Level 1**: Packages with no local dependencies (can run immediately)
- **Level 2**: Packages that only depend on Level 1 packages
- **Level 3**: Packages that depend on Level 1 and/or Level 2 packages
- And so on...

Packages within the same level can execute in parallel, while levels execute sequentially.

## Error Handling and Recovery

If a command fails in any package:

1. **Error Details**: Shows the full error message including stderr and stdout
2. **Recovery Command**: Provides the exact command to resume from the failed package
3. **Context**: Shows which packages completed successfully before the failure

Example recovery workflow:
```bash
# Command fails at package-b
kodrdriv tree --cmd "npm run build"
# Error: Command failed in package package-b

# Resume from the failed package
kodrdriv tree --cmd "npm run build" --start-from package-b
```

## Exclusion Patterns

Use glob patterns to exclude packages:

- `"test-*"`: Exclude packages starting with "test-"
- `"**/internal/**"`: Exclude any packages in "internal" directories
- `"dist/*"`: Exclude packages in dist directories
- `"*.temp"`: Exclude packages ending with ".temp"

## Integration with Other Commands

The tree command works well with other kodrdriv commands. With built-in command mode, you can now execute most workflow steps through tree:

```bash
# 1. Install dependencies
kodrdriv tree --cmd "npm install"

# 2. Link workspace packages for development
kodrdriv tree link

# 3. Build all packages
kodrdriv tree --cmd "npm run build" --parallel

# 4. Run tests
kodrdriv tree --cmd "npm test"

# 5. Commit changes across packages that need it
kodrdriv tree commit

# 6. Publish packages in dependency order
kodrdriv tree publish
```

### Migration from Legacy Commands

The built-in command mode replaces the legacy tree commands:

```bash
# DEPRECATED: Legacy commands (still work but show warnings)
kodrdriv commit-tree
kodrdriv publish-tree

# NEW: Use built-in commands instead
kodrdriv tree commit
kodrdriv tree publish
```

## Comparison with Other Commands

| Command | Purpose | Key Difference |
|---------|---------|----------------|
| `tree --cmd` | Execute any command | Generic command execution |
| `tree commit` | Git commit workflow | Runs `kodrdriv commit` with config isolation |
| `tree publish` | Publishing workflow | Runs `kodrdriv publish` with config isolation |
| `tree link` | Workspace linking | Runs `kodrdriv link` with config isolation |
| `tree unlink` | Workspace unlinking | Runs `kodrdriv unlink` with config isolation |
| `commit-tree` *(deprecated)* | Git commit workflow | Legacy command, use `tree commit` |
| `publish-tree` *(deprecated)* | Publishing workflow | Legacy command, use `tree publish` |

The `tree` command is now the central hub for all dependency-aware operations across your workspace.

## Performance Tips

1. **Use Parallel Execution**: Add `--parallel` for commands that can run independently
2. **Exclude Unnecessary Packages**: Use `--excluded-patterns` to skip packages that don't need processing
3. **Resume from Failures**: Use `--start-from` instead of restarting from the beginning
4. **Combine Operations**: Use shell operators to combine multiple commands: `"npm install && npm run build"`

## Output Format

The command outputs:
1. **Discovery**: Number of packages found
2. **Build Order**: Numbered list showing dependency order
3. **Execution Progress**: Real-time progress for each package
4. **Success Summary**: Final count of completed packages

Example output:
```
Analyzing workspace at: /path/to/workspace
Found 5 package.json files
Build order determined:

Build Order for 5 packages:
==========================================

1. utils (1.0.0)
   Path: /path/to/workspace/utils
   Local Dependencies: none

2. core (1.0.0)
   Path: /path/to/workspace/core
   Local Dependencies: utils

3. api (1.0.0)
   Path: /path/to/workspace/api
   Local Dependencies: core

4. ui (1.0.0)
   Path: /path/to/workspace/ui
   Local Dependencies: core, utils

5. app (1.0.0)
   Path: /path/to/workspace/app
   Local Dependencies: api, ui

Executing command "npm install" in 5 packages (with parallel execution)...
Level 1: Executing utils...
[1/5] utils: ✅ Execution completed successfully
Level 2: Executing core...
[2/5] core: ✅ Execution completed successfully
Level 3: Executing 2 packages in parallel: api, ui...
[3/5] api: ✅ Execution completed successfully
[4/5] ui: ✅ Execution completed successfully
✅ Level 3 completed: all 2 packages finished successfully
Level 4: Executing app...
[5/5] app: ✅ Execution completed successfully

All 5 packages completed successfully! 🎉
```
