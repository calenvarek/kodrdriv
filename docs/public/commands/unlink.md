# Unlink Command

Remove workspace links and clean up problematic dependencies that could cause CI/CD build failures:

```bash
kodrdriv unlink
```

The `unlink` command performs comprehensive cleanup of workspace dependencies by:

1. **Restoring original dependencies** from backups created by the `link` command
2. **Scanning and removing problematic dependencies** that cause GitHub build failures:
   - `file:` dependencies
   - `link:` dependencies
   - Relative path patterns (`../`, `./`, `/`)
   - `workspace:` protocol dependencies
   - Workspace configurations in package.json
   - Problematic overrides (npm 8.3+)
   - Problematic resolutions (Yarn)
3. **Automatically rebuilding dependencies** with `npm install`
4. **Verifying cleanup completion** to ensure no problematic dependencies remain

## Tree Mode Execution

The unlink command can be executed across multiple packages using the tree command:

```bash
# Execute unlink across all packages in workspace
kodrdriv tree unlink

# Execute with parallel processing
kodrdriv tree unlink --parallel

# Dry run to preview what would be unlinked
kodrdriv tree unlink --dry-run

# Resume from a specific package if one fails
kodrdriv tree unlink --start-from my-package

# Exclude certain packages from unlinking
kodrdriv tree unlink --excluded-patterns "build-*" "temp-*"
```

### Tree Mode Benefits

- **Configuration Isolation**: Each package uses its own workspace and unlinking configuration
- **Workspace-wide Cleanup**: Automatically discovers and unlinks all workspace dependencies
- **Consistent Release Environment**: Ensures all packages are properly prepared for CI/CD
- **Parallel Execution**: Independent packages can be unlinked simultaneously
- **Error Recovery**: Resume from failed packages without affecting completed ones

### Tree Mode vs Single Package

| Aspect | Single Package | Tree Mode |
|--------|---------------|-----------|
| **Scope** | Current package only | All packages in workspace |
| **Configuration** | Single workspace config | Per-package configuration |
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

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories (same as link command)
- `--workspace-file <workspaceFile>`: Workspace file to use (defaults to `pnpm-workspace.yaml`)
- `--dry-run`: Show what would be cleaned up without making any changes

## How It Works

The unlink command reads from a `.kodrdriv-link-backup.json` file created by the `link` command to restore original dependency versions. It also performs a comprehensive scan of all package.json files to identify and remove various types of problematic dependencies that could cause build failures in CI/CD environments.

## Examples

```bash
# Remove workspace links and clean up problematic dependencies
kodrdriv unlink --scope-roots '{"@mycompany": "../"}'

# Preview what would be cleaned up (dry run)
kodrdriv unlink --dry-run

# Use custom workspace file
kodrdriv unlink --workspace-file "custom-workspace.yaml"
```

## Output

The command provides detailed information about:
- Number of dependencies restored from backup
- Number of problematic dependencies cleaned up
- Verification results
- npm install status

## Notes

- If no scope roots are configured, the command will still scan for and clean up problematic dependencies
- The command automatically runs `npm install` after cleanup to rebuild dependencies
- A verification step ensures no problematic dependencies remain after cleanup
- The backup file is updated to remove restored entries and deleted if empty
