# Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process.

## Tree Mode Execution

The publish command can be executed across multiple packages using the tree command:

```bash
# Execute publish across all packages in dependency order
kodrdriv tree publish

# Execute with parallel processing (respects dependencies)
kodrdriv tree publish --parallel

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
    "linkWorkspacePackages": true,
    "unlinkWorkspacePackages": true
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

1. **Workspace Package Management**: For projects with npm workspaces, it temporarily unlinks workspace packages (converting `file:` dependencies back to registry versions) at the start, and restores linked packages at the end using a try/finally block to ensure cleanup.

2. **Dependency Updates**: Runs `npm update` to ensure dependencies are up to date. You can configure specific dependency patterns to update instead of updating all dependencies using the `dependencyUpdatePatterns` configuration option.

3. **Existing Pull Request Check**: Checks if there's already an open pull request for the current release branch. If found, skips directly to waiting for checks.

4. **Release Preparation** (if no existing PR):
   - Stages changes to `package.json` and `package-lock.json`
   - Runs the `prepublishOnly` script (your pre-flight checks like clean, lint, build, test)
   - Creates a commit for dependency updates (only if there are staged changes)
   - **Version Bump**: Manually increments the patch version in package.json and creates a separate commit
   - **Release Notes**: Generates release notes and saves them to `RELEASE_NOTES.md` and `RELEASE_TITLE.md` in the output directory

5. **Pull Request Creation**:
   - Pushes the release branch to origin
   - Creates a new pull request for the release

6. **Pull Request Automation**:
   - Waits for all status checks on the pull request to pass
   - If no GitHub Actions workflows or status checks are configured, the command will detect this automatically and either proceed immediately or ask for user confirmation (depending on configuration)
   - Once checks are complete (or if no checks exist), it automatically merges the pull request using the configured merge method (default: squash)

7. **Release Creation**:
   - Checks out the `main` branch and pulls the latest changes
   - Creates and pushes a git tag for the new version (with retry logic to handle existing tags)
   - Creates a GitHub release with the tag and release notes (with retry logic to handle GitHub tag processing delays)

8. **Release Workflows**: Optionally waits for GitHub Actions workflows triggered by the release/tag creation (configurable via `waitForReleaseWorkflows`)

9. **New Release Branch**: Creates and pushes a new release branch for the next version (e.g., `release/0.0.5`), checking for existing branches to avoid conflicts

This command is designed for repositories that follow a pull-request-based release workflow with or without status checks. It automatically handles repositories that have no CI/CD configured and streamlines the process, reducing manual steps and potential for error.

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
