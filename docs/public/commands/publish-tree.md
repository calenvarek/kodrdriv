# Publish Tree Command

Analyze and manage the build/publish order for multi-package workspaces and monorepos:

```bash
kodrdriv publish-tree
```

The `publish-tree` command is designed for complex workspace environments where you have multiple packages with interdependencies. It analyzes your workspace structure, builds a dependency graph, and determines the correct order for building, testing, or publishing packages to ensure dependencies are processed before dependent packages.

## What It Does

1. **Package Discovery**: Scans the target directory (current directory by default) for all `package.json` files in subdirectories
2. **Dependency Analysis**: Reads each package's dependencies and identifies local workspace dependencies
3. **Topological Sorting**: Creates a dependency graph and performs topological sorting to determine the correct build order
4. **Execution**: Optionally executes scripts, commands, or the publish process in each package in the correct order

## Key Features

- **Circular Dependency Detection**: Identifies and reports circular dependencies between packages
- **Resume Capability**: Can resume from a specific package if a previous run failed
- **Flexible Execution**: Supports custom scripts, shell commands, or the kodrdriv publish command
- **Parallel Execution**: Execute packages in parallel when dependencies allow, significantly speeding up build times
- **Pattern Exclusion**: Exclude specific packages or directories from processing
- **Dry Run Mode**: Preview the build order and execution plan without making changes

## Command Options

- `--directory <directory>`: Target directory containing multiple packages (defaults to current directory)
- `--start-from <startFrom>`: Resume build order from this package directory name (useful for restarting failed builds)
- `--script <script>`: Script command to execute in each package directory (e.g., `"npm run build"`)
- `--cmd <cmd>`: Shell command to execute in each package directory (e.g., `"npm audit fix"`)
- `--publish`: Execute kodrdriv publish command in each package directory
- `--parallel`: Execute packages in parallel when dependencies allow (packages with no interdependencies run simultaneously)
- `--excluded-patterns <patterns>`: Patterns to exclude packages from processing (e.g., `"**/node_modules/**"`, `"dist/*"`)

> [!NOTE]
> ### Command Precedence
>
> If multiple execution options are provided, they are processed in this priority order:
> 1. `--publish` (highest priority)
> 2. `--cmd`
> 3. `--script` (lowest priority)
>
> Higher priority options will override lower priority ones with a warning.

## Parallel Execution

When using the `--parallel` flag, packages are executed in dependency levels rather than strict sequential order:

- **Level 0**: Packages with no local dependencies run first (in parallel with each other)
- **Level 1**: Packages that only depend on Level 0 packages run next (in parallel with each other)
- **Level N**: Packages that depend on packages from previous levels

This approach ensures dependency order is respected while maximizing parallelization opportunities.

### Example Parallel Execution

For a workspace with these dependencies:
- `core` (no dependencies)
- `utils` (no dependencies)
- `api` (depends on `core`)
- `ui` (depends on `core` and `utils`)
- `app` (depends on `api` and `ui`)

Parallel execution would group them as:
- **Level 1**: `core` and `utils` (execute in parallel)
- **Level 2**: `api` and `ui` (execute in parallel, after Level 1 completes)
- **Level 3**: `app` (execute after Level 2 completes)

This reduces total execution time compared to sequential processing.

## Usage Examples

**Analyze workspace structure (dry run):**
```bash
kodrdriv publish-tree
```

**Build all packages in dependency order:**
```bash
kodrdriv publish-tree --script "npm run build"
```

**Publish all packages using kodrdriv:**
```bash
kodrdriv publish-tree --publish
```

**Build packages in parallel for faster execution:**
```bash
kodrdriv publish-tree --script "npm run build" --parallel
```

**Resume from a specific package after failure:**
```bash
kodrdriv publish-tree --publish --start-from my-failed-package
```

**Execute custom shell commands:**
```bash
kodrdriv publish-tree --cmd "npm run test && npm run build"
```

**Process specific workspace directory with exclusions:**
```bash
kodrdriv publish-tree --directory ./packages --excluded-patterns "**/test-packages/**" --script "npm run build"
```

**Complex workspace with specific scope:**
```bash
kodrdriv publish-tree \
  --directory ./workspace \
  --excluded-paths "examples/**,**/*-demo" \
  --script "npm run lint && npm run build" \
  --start-from core-package
```

## Configuration

You can configure publish-tree behavior in your `.kodrdriv/config.json` file:

```json
{
  "publishTree": {
    "directory": "./packages",
    "excludedPatterns": ["**/node_modules/**", "**/dist/**", "**/examples/**"],
    "script": "npm run build",
    "startFrom": null,
    "cmd": null,
    "publish": false
  }
}
```

**Configuration Options:**
- `directory`: Target directory for package scanning (no default, uses current directory if not specified)
- `excludedPatterns`: Array of glob patterns to exclude packages (no default, uses empty array if not specified)
- `script`: Script to execute in each package (no default)
- `cmd`: Shell command to execute in each package (no default)
- `publish`: Whether to run kodrdriv publish (defaults to false)
- `startFrom`: Package to start from for resuming (no default)

## Typical Workflows

**CI/CD Pipeline Build:**
```bash
# Build all packages in correct dependency order
kodrdriv publish-tree --script "npm run build"
```

**Incremental Publishing:**
```bash
# Publish packages that have changes
kodrdriv publish-tree --publish --start-from updated-package
```

**Quality Assurance:**
```bash
# Run tests across all packages
kodrdriv publish-tree --script "npm run test"
```

**Version Management:**
```bash
# Update version numbers across workspace
kodrdriv publish-tree --cmd "npm version patch"
```

## Error Handling

If a command fails in any package:
- The process stops immediately
- Error details are logged with the failing package name
- A resume command suggestion is provided with the `--start-from` option
- The number of successfully processed packages is reported

**Example failure output:**
```
❌ Script failed in package @mycompany/api-client: Command 'npm run build' failed with exit code 1
Failed after 3 successful packages.
To resume from this package, use: --start-from api-client
```

## Performance Tips

- Use `--excluded-paths` to skip unnecessary packages (tests, examples, etc.)
- Consider using `--start-from` for large workspaces when resuming failed builds
- Use dry run mode first to verify the build order makes sense
- For parallel-safe operations, consider running commands in parallel per dependency level
