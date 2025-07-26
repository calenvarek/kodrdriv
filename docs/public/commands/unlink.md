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
