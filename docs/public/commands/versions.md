# Versions Command

Update dependency versions in package.json files across workspace packages:

```bash
kodrdriv versions <subcommand>
```

The `versions` command helps manage dependency versions across packages in a workspace environment. It provides tools for normalizing and updating dependency version patterns to maintain consistency across related packages.

## Supported Subcommands

### `minor` - Normalize Same-Scope Dependencies

Updates all same-scope dependencies to use major.minor format for more flexible version ranges:

```bash
kodrdriv versions minor
```

This subcommand normalizes version patterns for packages within the same scope, removing patch versions and keeping only major.minor format. This is useful for internal package dependencies where you want to allow patch-level updates automatically.

## `versions minor` Command

### What It Does

The `minor` subcommand processes all packages in the workspace and:

1. **Discovers Packages**: Scans directories for all package.json files
2. **Groups by Scope**: Organizes packages by their npm scope (e.g., `@company`, `@utils`)
3. **Normalizes Dependencies**: Updates same-scope dependencies to major.minor format
4. **Preserves Prefixes**: Maintains version prefixes like `^`, `~`, etc.

### Version Normalization Examples

| Before | After | Description |
|--------|-------|-------------|
| `^1.2.3` | `^1.2` | Removes patch version, keeps caret |
| `~2.1.5` | `~2.1` | Removes patch version, keeps tilde |
| `>=3.0.1` | `>=3.0` | Removes patch version, keeps operator |
| `1.4.2` | `1.4` | Removes patch version, exact version |

### Scope-Based Processing

Only dependencies within the same scope are normalized:

**Example Workspace:**
```
@company/utils     - Contains @company/core: ^1.2.3
@company/core      - Contains @company/shared: ~2.1.5
@company/api       - Contains @company/utils: 1.4.2
@utils/helpers     - Contains @utils/common: >=3.0.1
```

**After `kodrdriv versions minor`:**
```
@company/utils     - Contains @company/core: ^1.2
@company/core      - Contains @company/shared: ~2.1
@company/api       - Contains @company/utils: 1.4
@utils/helpers     - Contains @utils/common: >=3.0
```

External dependencies (different scopes) remain unchanged.

## Command Options

- `--directories [directories...]`: Directories to scan for packages (defaults to current directory)
  - Allows processing specific directory trees
  - Multiple directories can be specified
  - Recursively discovers package.json files in subdirectories

## Usage Examples

### Basic Usage

```bash
# Normalize same-scope dependencies in current directory
kodrdriv versions minor

# Process specific directories
kodrdriv versions minor --directories ./packages ./apps

# Process multiple directory trees
kodrdriv versions minor --directories ./client-modules ./server-packages ./shared-libs
```

### Dry Run Mode

```bash
# See what changes would be made without applying them
kodrdriv versions minor --dry-run
```

Example dry run output:
```
🔄 Normalizing same-scope dependencies to major.minor format...
Found 5 packages
Found 2 scopes: @company, @utils

📦 Processing scope: @company (3 packages)
Would update dependencies.@company/core: ^1.2.3 → ^1.2
Would update devDependencies.@company/shared: ~2.1.5 → ~2.1

📦 Processing scope: @utils (2 packages)
Would update dependencies.@utils/common: >=3.0.1 → >=3.0

✅ Dry run complete. Would update 2 of 5 packages with dependency changes.
```

### With Tree Command

```bash
# Apply version normalization across entire workspace
kodrdriv tree versions minor

# Apply with parallel processing
kodrdriv tree versions minor --parallel
```

## Configuration

Configure default behavior in your `.kodrdriv/config.json`:

```json
{
  "versions": {
    "directories": ["./packages", "./apps", "./shared"],
    "subcommand": "minor"
  }
}
```

**Configuration Options:**
- `directories`: Default directories to scan for packages
- `subcommand`: Default subcommand when none specified

## Affected Dependency Sections

The command processes these package.json sections:
- `dependencies`
- `devDependencies`
- `peerDependencies`

All other sections (`optionalDependencies`, etc.) are left unchanged.

## Scope Detection

The command determines package scope from package names:

**Scoped Packages:**
- `@company/package-name` → Scope: `@company`
- `@utils/helper-lib` → Scope: `@utils`
- `@namespace/core` → Scope: `@namespace`

**Unscoped Packages:**
- `lodash` → No scope (skipped)
- `express` → No scope (skipped)
- `my-package` → No scope (skipped)

Only scoped packages are processed, and only same-scope dependencies are normalized.

## Use Cases

### Monorepo Development

Normalize internal package dependencies for flexible development:

```bash
# Before: Exact patch versions lock development
"@company/core": "1.2.3"
"@company/utils": "2.1.5"

# After: Major.minor allows patch updates
"@company/core": "1.2"
"@company/utils": "2.1"
```

### Release Preparation

Standardize version patterns before publishing:

```bash
# Normalize all internal dependencies
kodrdriv versions minor

# Build and test with normalized versions
npm run build
npm test

# Publish with consistent versioning
kodrdriv tree publish
```

### Dependency Management

Maintain consistent version patterns across teams:

```bash
# After adding new internal dependencies
kodrdriv versions minor

# Commit normalized versions
kodrdriv commit "normalize internal dependency versions"
```

## Integration with Other Commands

### With Development Command
```bash
# Set up development environment
kodrdriv development

# Normalize versions for development work
kodrdriv versions minor

# Make changes and commit
kodrdriv commit "update features with normalized dependencies"
```

### With Publish Workflow
```bash
# Normalize before release
kodrdriv versions minor
kodrdriv commit "normalize dependency versions for release"

# Publish with consistent versioning
kodrdriv publish
```

### With Tree Commands
```bash
# Workspace-wide version normalization
kodrdriv tree versions minor

# Verify changes across all packages
kodrdriv tree --cmd "npm ls" --parallel
```

## Output and Logging

### Verbose Output
Shows detailed processing information:

```bash
kodrdriv versions minor --verbose
```

Example output:
```
Found 8 packages
Scanning directory: ./packages
Found package: @company/core@1.2.3
Found package: @company/utils@2.1.0
Found package: @company/api@3.0.1

Found 2 scopes: @company, @utils
Found 3 unscoped packages (will be skipped)

📦 Processing scope: @company (5 packages)
Processing @company/core for scope @company
Updating dependencies.@company/utils: ^2.1.5 → ^2.1
Updated dependencies in @company/core

✅ Dependencies updated successfully. Updated 3 of 8 packages with dependency changes.
```

### Error Handling
- **Invalid package.json**: Warns and skips malformed files
- **Permission issues**: Reports files that cannot be written
- **Invalid versions**: Skips dependencies with unparseable version strings
- **Missing directories**: Warns about directories that don't exist

## Best Practices

1. **Run Before Releases**: Normalize versions before publishing to ensure consistency
2. **Use with Dry Run**: Always preview changes with `--dry-run` first
3. **Commit Changes**: Commit version normalization as a separate, focused change
4. **Team Coordination**: Run consistently across team to maintain standard patterns
5. **CI Integration**: Include in CI pipeline to catch inconsistent version patterns

## Future Subcommands

The versions command is designed to support additional subcommands in the future:

- `versions patch`: Update to specific patch versions
- `versions latest`: Update to latest available versions
- `versions sync`: Synchronize versions across packages
- `versions audit`: Report version inconsistencies

The current `minor` subcommand provides the foundation for these future enhancements.
