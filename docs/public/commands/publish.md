# Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process.

## Command Options

The publish command supports the following options:

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'
- `--from <from>`: Branch or tag to generate release notes from (default: automatically detected - tries `main`, then `master`, then `origin/main`)
  - Useful when releases fail and you need to generate notes from a specific version back
  - Accepts any valid Git reference (branch, tag, or commit hash)
  - **Use Case**: When a previous release failed partway through, you can specify `--from v1.2.0` to generate release notes that include all changes since that version
- `--target-version <targetVersion>`: Target version for the release (default: 'patch')
  - **Explicit version**: Provide a specific version number (e.g., "4.30.0")
  - **Semantic bumps**: Use "patch", "minor", or "major" for automatic version increments
  - **Pre-release handling**: Graduates pre-release versions like "4.23.3-dev.1" to their base version "4.23.3"
  - **Tag conflict detection**: Automatically checks if the target version tag already exists and prevents conflicts
  - **Use Case**: When you need to jump to a specific version or perform non-patch releases
- `--interactive`: Present release notes for interactive review and editing
  - Allows you to modify the generated release notes before they're used in the GitHub release
  - Opens an editor where you can refine the content, add context, or restructure the notes
  - **Version confirmation**: When used with publish, also prompts for version confirmation and allows manual override
  - **Use Case**: For important releases where you want to ensure the release notes are perfect and include additional context
- `--sendit`: Skip all confirmation prompts and proceed automatically (useful for automated workflows)

### Examples

```bash
# Standard publish workflow
kodrdriv publish

# Generate release notes from a specific version (useful for failed releases)
kodrdriv publish --from v1.2.0

# Target a specific version number
kodrdriv publish --target-version 4.30.0

# Semantic version bumps
kodrdriv publish --target-version patch  # Default (4.23.3 -> 4.23.4)
kodrdriv publish --target-version minor  # Minor bump (4.23.3 -> 4.24.0)
kodrdriv publish --target-version major  # Major bump (4.23.3 -> 5.0.0)

# Interactive mode for reviewing and editing release notes
kodrdriv publish --interactive

# Interactive mode with version confirmation
kodrdriv publish --target-version 5.0.0 --interactive

# Combined: publish from specific version with interactive editing
kodrdriv publish --from v0.9.0 --interactive

# Automated publish with custom merge method
kodrdriv publish --sendit --merge-method merge

# Complex scenario: specific version, custom release notes range, and merge method
kodrdriv publish --target-version 5.0.0 --from v4.0.0 --merge-method merge
```

## Tree Mode Execution

The publish command can be executed across multiple packages using the tree command:

```bash
# Execute publish across all packages in dependency order
kodrdriv tree publish



# Resume from a specific package if one fails
kodrdriv tree publish --start-from my-package

# Dry run to preview the execution plan
kodrdriv tree publish --dry-run
```

### Tree Mode Benefits

- **Configuration Isolation**: Each package uses its own `.kodrdriv` configuration and environment variables
- **Dependency Order**: Dependencies are always published before packages that depend on them
- **Individual Release Context**: Each package maintains its own release branch and workflow
- **Coordinated Publishing**: Ensures the entire workspace is published consistently
- **Error Recovery**: Resume from failed packages without re-publishing successful ones

### Tree Mode vs Single Package

| Aspect | Single Package | Tree Mode |
|--------|---------------|-----------|
| **Scope** | Current package only | All packages in workspace |
| **Configuration** | Single `.kodrdriv` config | Per-package configuration |
| **Dependencies** | Manual coordination | Automatic dependency order |
| **Execution** | Single publish operation | Coordinated multi-package publishing |
| **Environment** | Single package environment | Per-package environment isolation |
| **Error Handling** | Single failure point | Per-package error isolation with recovery |

### Tree Mode Configuration

Each package can have its own publish configuration:

```json
// .kodrdriv/config.json in each package
{
  "publish": {
    "mergeMethod": "squash",
    "requiredEnvVars": ["PACKAGE_SPECIFIC_TOKEN", "CUSTOM_REGISTRY_URL"],
    "dependencyUpdatePatterns": ["@mycompany/*", "@utils/*"],
    "targetBranch": "main"
  }
}
```

### Tree Mode Workflow

When using `kodrdriv tree publish`, the following happens for each package:

1. **Dependency Resolution**: Packages are ordered by their interdependencies
2. **Individual Execution**: Each package runs its own `kodrdriv publish` process
3. **Configuration Isolation**: Each package uses its own environment and configuration
4. **Error Isolation**: If one package fails, others continue or can be resumed individually

For detailed tree mode documentation, see [Tree Built-in Commands](tree-built-in-commands.md#kodrdriv-tree-publish).

## Prerequisites

- Must be run from within a git repository
- Must be on a release branch (name starts with "release/")
- Working directory must have no uncommitted changes
- Must have a `prepublishOnly` script in package.json
- All required environment variables must be set

Here's what the command does:

## Prechecks

Before starting any release work, the command performs several critical validations:

1. **Git Repository Check**: Ensures you're running the command within a git repository
2. **Uncommitted Changes Check**: Verifies there are no uncommitted changes in your working directory
3. **Release Branch Requirement**: Confirms you're currently on a release branch (must start with "release/")
4. **Package.json Validation**: Ensures package.json exists and is valid JSON
5. **prepublishOnly Script Requirement**: Verifies that a `prepublishOnly` script exists in your package.json - **this script is required and the command will fail if not present**
6. **Environment Variables Check**: Validates that all required environment variables are set (both from config and any referenced in .npmrc files)

## Main Workflow

1. **Existing Pull Request Check**: Checks if there's already an open pull request for the current release branch. If found, skips directly to waiting for checks.

2. **Release Preparation** (if no existing PR):
   - **Dependency Updates**: Runs `npm update` to ensure dependencies are up to date
   - You can configure specific dependency patterns to update using the `dependencyUpdatePatterns` configuration option
   - Stages changes to `package.json` and `package-lock.json`
   - Runs the `prepublishOnly` script (your pre-flight checks like clean, lint, build, test)
   - Creates a commit for dependency updates (only if there are staged changes)
   - **Version Bump**: Manually increments the patch version in package.json and creates a separate commit
   - **Release Notes**: Generates release notes and saves them to `RELEASE_NOTES.md` and `RELEASE_TITLE.md` in the output directory

3. **Pull Request Creation**:
   - Pushes the release branch to origin
   - Creates a new pull request for the release

4. **Pull Request Automation**:
   - Waits for all status checks on the pull request to pass
   - If no GitHub Actions workflows or status checks are configured, the command will detect this automatically and either proceed immediately or ask for user confirmation (depending on configuration)
   - Once checks are complete (or if no checks exist), it automatically merges the pull request using the configured merge method (default: squash)

5. **Release Creation**:
   - Checks out the target branch (default: `main`) and pulls the latest changes
   - Creates and pushes a git tag for the new version (with retry logic to handle existing tags)
   - Creates a GitHub release with the tag and release notes (with retry logic to handle GitHub tag processing delays)

6. **Release Workflows**: Optionally waits for GitHub Actions workflows triggered by the release/tag creation (configurable via `waitForReleaseWorkflows`)

7. **Completion**: Switches to the target branch and completes the process

This command is designed for repositories that follow a pull-request-based release workflow with or without status checks. It automatically handles repositories that have no CI/CD configured and streamlines the process, reducing manual steps and potential for error.

## Release Necessity Check

Before performing any heavy operations, `kodrdriv publish` evaluates whether a release is necessary by comparing the current branch to the configured `targetBranch` (default: `main`).

- **Skip rule**: If the only detected change is the `version` field in `package.json` (with optional `package-lock.json` updates), the publish process is skipped.
- **Proceed rule**: Any other file changes, or any other `package.json` changes beyond `version`, will proceed with the publish workflow.
- **Conservative defaults**: If the tool cannot conclusively compare changes, it proceeds with publish to avoid missing a required release.

This allows pre-release version bumps without forcing a full publish when there are no substantive changes.

## Workflow and Status Check Management

The publish command intelligently manages GitHub Actions workflows and status checks throughout the release process:

### Pull Request Checks

**When PR is created on release branch:**
1. **Automatic Check Detection**: Scans for GitHub Actions workflows and status checks on the PR
2. **Intelligent Waiting**: Waits up to 5 minutes (configurable) for all checks to complete
3. **Progress Monitoring**: Reports check completion status every 10 seconds
4. **Failure Handling**: Stops the process if any checks fail

**Scenarios handled:**

- **✅ Repository with workflows**: Waits for all checks, proceeds when green
- **⚠️ Repository without workflows**: Detects absence after checking multiple times, prompts user (or proceeds automatically if `skipUserConfirmation`
