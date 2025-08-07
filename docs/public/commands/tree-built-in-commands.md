# Tree Built-in Commands

The tree command supports executing kodrdriv's built-in commands across multiple packages with dependency analysis and configuration isolation.

## Overview

Built-in commands provide dependency-aware execution of core kodrdriv functionality:

```bash
kodrdriv tree commit    # Run commit operations across packages
kodrdriv tree publish   # Run publish operations across packages
kodrdriv tree link      # Link workspace packages across packages
kodrdriv tree unlink    # Unlink workspace packages across packages
```

## Key Features

### Configuration Isolation
Each package executes with its own kodrdriv configuration:
- Individual `.kodrdriv` configuration directories
- Package-specific preferences and context directories
- Separate OpenAI API usage and logging per package

### Dependency-Aware Execution
Commands execute in topological dependency order:
- Dependencies are processed before dependents
- Parallel execution when dependencies allow
- Proper error handling and recovery points

### Unified Error Handling
Consistent error reporting and recovery:
- Shows which packages completed successfully
- Provides restart commands for failed operations
- Maintains execution context across package boundaries

## Supported Commands

### `kodrdriv tree commit`

Executes commit operations across all packages that have uncommitted changes.

**What it does:**
- Runs `kodrdriv commit` in each package directory
- Uses each package's individual commit configuration
- Maintains package-specific git history and context

**Usage:**
```bash
# Commit across all packages
kodrdriv tree commit

# Commit with parallel execution
kodrdriv tree commit --parallel

# Resume from a specific package
kodrdriv tree commit --start-from my-package

# Exclude certain packages
kodrdriv tree commit --excluded-patterns "test-*" "temp-*"
```

**Configuration:**
Each package can have its own commit settings in `.kodrdriv/config.json`:
```json
{
  "commit": {
    "messageLimit": 25,
    "context": "This package handles user authentication"
  }
}
```

### `kodrdriv tree publish`

Executes publish operations across all packages in dependency order.

**What it does:**
- Runs `kodrdriv publish` in each package directory
- Ensures dependencies are published before dependents
- Uses each package's individual publish configuration

**Usage:**
```bash
# Publish all packages in dependency order
kodrdriv tree publish

# Publish with parallel execution (respects dependencies)
kodrdriv tree publish --parallel

# Resume from a specific package
kodrdriv tree publish --start-from my-package

# Dry run to see execution plan
kodrdriv tree publish --dry-run
```

**Configuration:**
Each package can have its own publish settings:
```json
{
  "publish": {
    "mergeMethod": "squash",
    "requiredEnvVars": ["PACKAGE_SPECIFIC_TOKEN"],
    "dependencyUpdatePatterns": ["@company/*"],
    "targetBranch": "main"
  }
}
```

### `kodrdriv tree link`

Links workspace packages across all packages for local development.

**What it does:**
- Runs `kodrdriv link` in each package directory
- Creates `file:` dependencies for local workspace packages
- Respects each package's scope and linking configuration

**Usage:**
```bash
# Link all workspace packages
kodrdriv tree link

# Link with parallel execution
kodrdriv tree link --parallel

# Link specific directories only
kodrdriv tree link --directories ./apps ./packages

# Exclude certain packages from linking
kodrdriv tree link --excluded-patterns "build-*"
```

**Configuration:**
Each package can have its own linking scope:
```json
{
  "link": {
    "scopeRoots": {
      "@company": "../packages/",
      "@utils": "../../shared/"
    }
  }
}
```

### `kodrdriv tree unlink`

Unlinks workspace packages across all packages, restoring registry dependencies.

**What it does:**
- Runs `kodrdriv unlink` in each package directory
- Removes `file:` dependencies and restores registry versions
- Cleans up development artifacts per package configuration

**Usage:**
```bash
# Unlink all workspace packages
kodrdriv tree unlink

# Unlink with parallel execution
kodrdriv tree unlink --parallel

# Dry run to see what would be unlinked
kodrdriv tree unlink --dry-run

# Resume from a specific package
kodrdriv tree unlink --start-from my-package
```

## Execution Order and Dependencies

### Dependency Levels

Built-in commands execute in dependency levels:

```
Level 1: Packages with no local dependencies
Level 2: Packages depending only on Level 1 packages
Level 3: Packages depending on Level 1 and/or Level 2 packages
...
```

### Parallel Execution

When using `--parallel`, packages within the same dependency level execute simultaneously:

```bash
# Execute packages in parallel where possible
kodrdriv tree publish --parallel
```

Example execution flow:
```
Level 1: utils, constants (parallel)
Level 2: core, helpers (parallel, after Level 1 completes)
Level 3: api, ui (parallel, after Level 2 completes)
Level 4: app (sequential, after Level 3 completes)
```

## Error Handling and Recovery

### Failure Recovery

If a command fails in any package:

1. **Error Context**: Shows which package failed and why
2. **Success Count**: Reports how many packages completed successfully
3. **Recovery Command**: Provides exact restart command

Example failure scenario:
```
[3/5] api: ❌ Failed - Command failed in package api
Failed after 2 successful packages.
To resume from this package, run:
    kodrdriv tree publish --start-from api
```

### Resume Execution

Resume from the failed package:
```bash
kodrdriv tree publish --start-from api
```

This continues from where the previous execution failed, skipping successfully completed packages.

## Best Practices

### Package Organization

1. **Consistent Structure**: Maintain similar directory structures across packages
2. **Configuration Management**: Use hierarchical configuration for common settings
3. **Dependency Clarity**: Keep local dependencies explicit and well-documented

### Execution Strategy

1. **Start with Linking**: `kodrdriv tree link` before development
2. **Regular Commits**: Use `kodrdriv tree commit` for coordinated commits
3. **Dependency Order**: Always publish in dependency order with `kodrdriv tree publish`
4. **Clean Unlinking**: `kodrdriv tree unlink` before final release

### Configuration Tips

1. **Global Defaults**: Set common configuration in root `.kodrdriv/config.json`
2. **Package Overrides**: Override specific settings in package-level configurations
3. **Environment Variables**: Use package-specific environment variables when needed

## Integration Examples

### Complete Development Workflow

```bash
# 1. Set up development environment
kodrdriv tree --cmd "npm install"
kodrdriv tree link

# 2. Development iteration
kodrdriv tree --cmd "npm run build" --parallel
kodrdriv tree --cmd "npm test"

# 3. Commit changes
kodrdriv tree commit

# 4. Prepare for release
kodrdriv tree unlink
kodrdriv tree --cmd "npm run build" --parallel

# 5. Publish release
kodrdriv tree publish
```

### CI/CD Pipeline Integration

```bash
# In CI/CD pipeline
kodrdriv tree --cmd "npm ci"           # Install exact dependencies
kodrdriv tree --cmd "npm run build"    # Build all packages
kodrdriv tree --cmd "npm test"         # Test all packages
kodrdriv tree publish                  # Publish if tests pass
```

## Troubleshooting

### Common Issues

1. **Configuration Conflicts**: Ensure package-level configs don't conflict with global settings
2. **Dependency Loops**: Tree command will detect and report circular dependencies
3. **Environment Variables**: Each package needs access to required environment variables
4. **Git State**: Ensure git repositories are in expected state for commit/publish operations

### Debug Information

Use `--debug` flag for detailed execution information:
```bash
kodrdriv tree commit --debug
```

This shows:
- Dependency analysis details
- Package-by-package execution logs
- Configuration resolution per package
- Detailed error information

For more general tree command information, see [Tree Command](tree.md).
