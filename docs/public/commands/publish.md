# Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process.

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
- **⚠️ Repository without workflows**: Detects absence after checking multiple times, prompts user (or proceeds automatically if `skipUserConfirmation` is enabled)
- **⏰ Timeout reached**: Prompts user whether to proceed or abort
- **❌ Failed checks**: Immediately stops and reports failing check names

### Release Workflows (After Tag Creation)

**When tag is pushed to main branch:**
1. **Release Trigger Detection**: Auto-detects workflows triggered by release/tag events (or uses configured `releaseWorkflowNames`)
2. **Initial Wait**: Waits 30 seconds for GitHub to trigger workflows before checking
3. **Extended Timeout**: Waits up to 10 minutes (configurable) for release workflows to complete
4. **Workflow Monitoring**: Tracks status of deployment, publishing, or notification workflows
5. **Smart Detection**: Automatically detects if no release workflows are configured and prompts user or proceeds based on configuration

### Configuration Options for Workflow Management

```json
{
  "publish": {
    "checksTimeout": 300000,              // PR check timeout (5 min default)
    "skipUserConfirmation": false,        // Auto-proceed when no workflows found
    "sendit": false,                      // Skip ALL confirmations
    "waitForReleaseWorkflows": true,      // Wait for release workflows
    "releaseWorkflowsTimeout": 600000,    // Release workflow timeout (10 min)
    "releaseWorkflowNames": ["deploy", "publish"] // Specific workflows to wait for
  }
}
```

### User Interaction Scenarios

**Interactive Mode (default):**
```bash
kodrdriv publish
# Prompts when no workflows found:
# "⚠️ No GitHub Actions workflows found. Proceed anyway? [y/N]"
```

**Automated Mode:**
```bash
kodrdriv publish --sendit
# Skips all workflow confirmations, proceeds immediately
```

**Custom Timeout:**
```json
{
  "publish": {
    "checksTimeout": 600000  // Wait 10 minutes for PR checks
  }
}
```

> [!TIP]
> ### Workflow Management Best Practices
>
> - **For repositories with CI/CD**: Use default settings, kodrdriv will wait for your workflows
> - **For repositories without workflows**: Set `skipUserConfirmation: true` for automation
> - **For deployment workflows**: Configure `targetWorkflows` to wait for specific release workflows
> - **For CI environments**: Use `--sendit` flag to skip all interactive prompts

> [!NOTE]
> ### No Workflows Detected
>
> If your repository doesn't have GitHub Actions workflows or status checks configured, the publish command will:
> 1. Check multiple times for workflows/checks to confirm none exist
> 2. Prompt for user confirmation (unless `skipUserConfirmation` is enabled)
> 3. Proceed safely without waiting indefinitely
>
> This ensures the tool works seamlessly with any repository configuration.

## Command Options

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'
- `--sendit`: Skip all confirmation prompts and proceed automatically (useful for automated workflows)

## Configuration

You can configure the publish command behavior in your `.kodrdriv/config.json` file:

```json
{
  "publish": {
    "mergeMethod": "squash",
    "dependencyUpdatePatterns": ["@mycompany/*", "@utils/*"],
    "requiredEnvVars": ["NPM_TOKEN", "GITHUB_TOKEN"],
    "linkWorkspacePackages": true,
    "unlinkWorkspacePackages": true,
    "checksTimeout": 300000,
    "skipUserConfirmation": false,
    "sendit": false
  }
}
```

**Configuration Options:**
- `mergeMethod`: Default merge method for pull requests ('merge', 'squash', 'rebase')
- `dependencyUpdatePatterns`: Array of patterns to match dependencies for updating (if not specified, all dependencies are updated)
- `requiredEnvVars`: Array of environment variables that must be set before publishing (additional variables referenced in .npmrc are automatically detected)
- `linkWorkspacePackages`: Whether to restore linked packages after publishing (default: true)
- `unlinkWorkspacePackages`: Whether to unlink workspace packages before publishing (default: true)
- `checksTimeout`: Maximum time in milliseconds to wait for PR checks (default: 300000 = 5 minutes)
- `skipUserConfirmation`: Skip user confirmation when no checks are configured (default: false, useful for CI/CD environments)
- `sendit`: Skip all confirmation prompts and proceed automatically (default: false, overrides `skipUserConfirmation` when true)
- `waitForReleaseWorkflows`: Whether to wait for workflows triggered by release tag creation (default: true)
- `releaseWorkflowsTimeout`: Maximum time in milliseconds to wait for release workflows (default: 600000 = 10 minutes)
- `releaseWorkflowNames`: Array of specific workflow names to wait for on release (if not specified, auto-detects workflows triggered by release events)

## Examples

```bash
# Standard publish workflow
kodrdriv publish

# Publish with merge instead of squash
kodrdriv publish --merge-method merge

# Publish with rebase
kodrdriv publish --merge-method rebase

# Automated publish workflow (skip all confirmations)
kodrdriv publish --sendit

# Automated publish with custom merge method
kodrdriv publish --sendit --merge-method merge
```

### Workflow Management Examples

**Repository with CI/CD workflows:**
```bash
# Standard workflow - waits for all checks and release workflows
kodrdriv publish

# Custom timeout for long-running tests
kodrdriv publish  # with checksTimeout: 600000 in config
```

**Repository without workflows:**
```bash
# Interactive - will prompt when no workflows detected
kodrdriv publish

# Automated - skips prompts, proceeds immediately
kodrdriv publish --sendit
```

**Advanced workflow configuration:**
```json
{
  "publish": {
    "checksTimeout": 450000,
    "releaseWorkflowsTimeout": 900000,
    "releaseWorkflowNames": ["deploy-production", "notify-slack"],
    "skipUserConfirmation": true
  }
}
```
