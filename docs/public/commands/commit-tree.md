# commit-tree

Analyze package dependencies in workspace and run commit operations (git add -A + kodrdriv commit) in dependency order.

## Description

The `commit-tree` command is designed to streamline the commit process across multiple packages in a monorepo or workspace environment. It automatically:

1. Scans for package.json files in subdirectories
2. Analyzes local dependencies between packages
3. Determines the correct dependency order using topological sorting
4. Executes `git add -A` followed by `kodrdriv commit` in each package directory
5. Maintains proper dependency ordering to ensure commits happen in the right sequence

This command replaces the common workflow of running:
```bash
kodrdriv publish-tree --cmd "git add -A"
kodrdriv publish-tree --cmd "kodrdriv commit"
```

## Usage

```bash
kodrdriv commit-tree [options]
```

### Basic Examples

Commit all packages in the current workspace:
```bash
kodrdriv commit-tree
```

Commit packages in a specific directory:
```bash
kodrdriv commit-tree --directory /path/to/workspace
```

Run in dry-run mode to see what would be executed:
```bash
kodrdriv commit-tree --dry-run
```

### Advanced Examples

Resume from a specific package (useful after failures):
```bash
kodrdriv commit-tree --start-from package-name
```

Execute packages in parallel when dependencies allow:
```bash
kodrdriv commit-tree --parallel
```

Exclude specific packages:
```bash
kodrdriv commit-tree --excluded-patterns "**/test/**" "**/docs/**"
```

## Options

### Workspace Options

**`--directory <directory>`**
Target directory containing multiple packages (defaults to current directory).

**`--excluded-patterns [patterns...]`**
Patterns to exclude packages from processing. Uses glob-style patterns.
- Examples: `"**/node_modules/**"`, `"**/test/**"`, `"dist/*"`

### Execution Control

**`--start-from <package>`**
Resume commit order from this package directory name. Useful for restarting after failed commits.

**`--parallel`**
Execute packages in parallel when dependencies allow. Packages with no interdependencies run simultaneously, while maintaining proper dependency ordering.

### Global Options

**`--dry-run`**
Perform a dry run without actually executing commands. Shows what would be executed.

**`--verbose`**
Enable verbose logging to see detailed information about the process.

**`--debug`**
Enable debug logging for troubleshooting.

## How It Works

### Dependency Resolution

1. **Package Discovery**: Scans for `package.json` files in subdirectories
2. **Dependency Analysis**: Examines `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`
3. **Local Dependencies**: Identifies which dependencies are local to the workspace
4. **Topological Sort**: Determines execution order based on dependency relationships
5. **Circular Detection**: Throws an error if circular dependencies are detected

### Execution Process

For each package in dependency order:

1. **Change Directory**: `cd` to the package directory
2. **Git Add**: Execute `git add -A` to stage all changes
3. **Commit**: Execute `kodrdriv commit` to generate and create commit message
4. **Restore Directory**: Return to original working directory

### Parallel Execution

When `--parallel` is enabled:

1. Packages are grouped into dependency levels
2. All packages in the same level can run simultaneously
3. Higher levels wait for lower levels to complete
4. Maintains dependency ordering while maximizing parallelism

## Error Handling

### Common Errors and Solutions

**Package not found error**:
```
Package directory 'package-name' not found
```
- Check that the package name matches a directory name in the workspace
- Use `--verbose` to see available packages

**Circular dependency error**:
```
Circular dependency detected involving package: package-name
```
- Review and fix circular dependencies in your package.json files
- Dependencies should form a directed acyclic graph (DAG)

**Commit failure**:
```
Commit operations failed in package package-name
```
- Check the error details for the specific failure
- Use `--start-from package-name` to resume after fixing the issue

### Resume After Failure

If a commit fails partway through:

1. Fix the issue that caused the failure
2. Resume using: `kodrdriv commit-tree --start-from failed-package-name`
3. The command will skip successfully completed packages

## Configuration

The commit-tree command respects all commit configuration options from your kodrdriv config files:

```yaml
commit:
  add: true              # Automatically included in commit-tree
  sendit: false         # Control auto-commit behavior
  direction: "..."      # Custom commit direction
  context: "..."        # Additional context for commits
```

## Output

The command provides detailed output showing:

- Package discovery and dependency analysis
- Build order determination
- Real-time execution progress with package-specific logging
- Success/failure status for each package
- Resume instructions if failures occur

### Example Output

```
Analyzing workspace for commit operations at: /workspace
Found 3 package.json files
Building dependency graph...
Determining build order...

Build order determined for commit operations:
1. core-package (no local dependencies)
2. utils-package (depends on: core-package)
3. app-package (depends on: core-package, utils-package)

Running commit operations (git add -A + kodrdriv commit) in 3 packages...

[1/3] core-package: Starting commit operations...
[1/3] core-package: Adding all changes to git...
[1/3] core-package: Running commit command...
[1/3] core-package: ✅ All commit operations completed successfully

[2/3] utils-package: Starting commit operations...
[2/3] utils-package: Adding all changes to git...
[2/3] utils-package: Running commit command...
[2/3] utils-package: ✅ All commit operations completed successfully

[3/3] app-package: Starting commit operations...
[3/3] app-package: Adding all changes to git...
[3/3] app-package: Running commit command...
[3/3] app-package: ✅ All commit operations completed successfully

All 3 packages completed commit operations successfully! 🎉
```

## Related Commands

- [`commit`](./commit.md) - Generate and create commit messages for individual packages
- [`publish-tree`](./publish-tree.md) - Analyze and publish packages in dependency order
- [`review`](./review.md) - Generate code review summaries
