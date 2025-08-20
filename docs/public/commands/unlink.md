# Unlink Command

Remove npm links and clean up local development dependencies that could cause CI/CD build failures:

```bash
kodrdriv unlink
```

The `unlink` command performs cleanup of local development setup by:

1. **Removing global npm link** with `npm unlink -g`
2. **Optionally cleaning node_modules** (with `--clean-node-modules` flag):
   - Removes `node_modules` and `package-lock.json`
   - Reinstalls dependencies with `npm install`
3. **Checking for remaining links** that could cause issues in CI/CD
4. **Verifying cleanup completion** to ensure no problematic links remain

## Single Project Mode (Default)

When run without arguments, `kodrdriv unlink` operates on the current project:

```bash
# Basic unlink (removes global link only)
kodrdriv unlink

# With clean installation (removes node_modules and reinstalls)
kodrdriv unlink --clean-node-modules
```

## Scope-based Unlinking

When provided with a scope or package name, unlinks specific packages in the workspace:

```bash
# Unlink all packages in a scope
kodrdriv unlink @mycompany

# Unlink a specific package
kodrdriv unlink @mycompany/core
```

## Tree Mode Execution

The unlink command can be executed across multiple packages in dependency order using the tree command:

```bash
# Execute unlink across all packages in dependency order
kodrdriv tree unlink

# With clean installation for all packages
kodrdriv tree unlink --clean-node-modules



# Dry run to preview what would be unlinked
kodrdriv tree unlink --dry-run

# Resume from a specific package if one fails
kodrdriv tree unlink --start-from my-package

# Exclude certain packages from unlinking
kodrdriv tree unlink --exclude "build-*" "temp-*"
```

### Tree Mode Benefits

- **Dependency Order**: Unlinks packages in the correct dependency order
- **Workspace-wide Cleanup**: Automatically discovers and unlinks all workspace packages
- **Consistent Release Environment**: Ensures all packages are properly prepared for CI/CD

- **Error Recovery**: Resume from failed packages without affecting completed ones

### Tree Mode vs Single Package

| Aspect | Single Package | Tree Mode |
|--------|---------------|-----------|
| **Scope** | Current package only | All packages in workspace |
| **Order** | Single package | Dependency-ordered execution |
| **Cleanup** | Limited to current package | Workspace-wide cleanup |
| **Execution** | Single unlinking operation | Coordinated multi-package unlinking |
| **Release Prep** | Manual coordination required | Automatic workspace-wide preparation |

### Tree Mode Configuration

Each package can have its own unlinking configuration:

```json
// .kodrdriv/config.json in each package
{
  "unlink": {
    "scopeRoots": {
      "@company": "../packages/",
      "@utils": "../../shared/"
    },
    "workspaceFile": "custom-workspace.yaml",
    "cleanNodeModules": true
  }
}
```

### Tree Mode Workflow

When using `kodrdriv tree unlink`, the following happens for each package:

1. **Package Discovery**: Scans all packages in the workspace
2. **Individual Unlinking**: Each package runs its own `kodrdriv unlink` process
3. **Configuration Isolation**: Each package uses its own scope roots and workspace files
4. **Coordinated Cleanup**: All packages end up properly prepared for CI/CD deployment
5. **Verification**: Each package is verified to ensure no problematic dependencies remain

For detailed tree mode documentation, see [Tree Built-in Commands](tree-built-in-commands.md#kodrdriv-tree-unlink).

## Command Options

- `--clean-node-modules`: Remove `node_modules` and `package-lock.json`, then reinstall dependencies
- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories (for scope-based unlinking)
- `--dry-run`: Show what would be cleaned up without making any changes

## How It Works

### Single Project Mode

When run without arguments, the unlink command:

1. **Removes global npm link**: Runs `npm unlink -g` to remove the global link for the current package
2. **Optionally cleans dependencies**: If `--clean-node-modules` is specified:
   - Removes `node_modules` and `package-lock.json`
   - Runs `npm install` to reinstall clean dependencies
3. **Checks for remaining links**: Uses `npm ls --link --json` to detect any remaining linked packages
4. **Reports warnings**: If links to packages in the same scope are found

### Scope-based Mode

When provided with a scope or package name, the unlink command finds all matching packages in the workspace and for each package:

1. **Unlinks consuming packages**: Finds packages that depend on the target and runs `npm unlink <target>` in each
2. **Unlinks source package**: Runs `npm unlink` in the target package directory

## Examples

```bash
# Basic unlink (removes global link only)
kodrdriv unlink

# With clean installation (removes node_modules and reinstalls)
kodrdriv unlink --clean-node-modules

# Preview what would be done (dry run)
kodrdriv unlink --dry-run

# Unlink all packages in a scope
kodrdriv unlink @mycompany

# Unlink a specific package
kodrdriv unlink @mycompany/core

# Tree mode: unlink all packages in dependency order
kodrdriv tree unlink

# Tree mode with clean installation
kodrdriv tree unlink --clean-node-modules
```

## Output

The command provides detailed information about:
- Whether the global link was removed successfully
- Results of `node_modules` cleanup (if `--clean-node-modules` specified)
- Dependencies installation status
- Any remaining links detected

## Notes

- Without `--clean-node-modules`, only the global link is removed
- The `--clean-node-modules` flag provides a more thorough cleanup but is more destructive
- Link detection helps identify potential CI/CD issues before deployment
- Tree mode executes unlink commands in dependency order to avoid breaking inter-package dependencies
