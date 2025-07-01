# Commands

KodrDriv provides four main commands for automating Git workflows and generating intelligent documentation.

## Commit Command

Generate intelligent commit messages:

```bash
kodrdriv commit
```

The commit command analyzes your changes and generates contextual commit messages using AI. It can work with both staged and unstaged changes.

> [!TIP]
> ### Working with Staged Changes
> 
> When you have staged changes using `git add`, the `kodrdriv commit` command will automatically analyze the diff of your staged changes. This allows you to selectively stage files and generate a commit message that specifically addresses those changes, rather than all uncommitted changes in your working directory.

> [!TIP]
> ### Quick Commit with --sendit
> 
> If you trust the quality of the generated commit messages, you can use the `--sendit` flag to automatically commit your changes with the generated message without review. This is useful for quick, routine changes where you want to streamline your workflow.

### Commit Command Options

- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review (default: false)
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the prompt for context (default: 10). This can help focus the AI on the most relevant recent changes.

## Release Command

Generate comprehensive release notes based on changes since the last release:

```bash
kodrdriv release
```

The release command analyzes changes between two Git references and generates structured release notes.

> [!TIP]
> ### Custom Release Range
> 
> The `kodrdriv release` command supports customizing the range of commits to analyze using the `--from` and `--to` options. By default, it compares changes between the `main` branch and `HEAD`, but you can specify any valid Git reference (branch, tag, or commit hash) for either endpoint. This flexibility allows you to generate release notes for specific version ranges or between different branches.

> [!TIP]
> ### Comparing Releases
> 
> You can use the `--from` and `--to` options to generate release notes comparing two different releases. For example, to see what changed between v1.0.0 and v1.1.0, you could use `kodrdriv release --from v1.0.0 --to v1.1.0`. This is particularly useful for creating detailed changelogs when preparing release documentation.

### Release Command Options

- `--from <from>`: Branch or reference to generate release notes from (default: 'main')
- `--to <to>`: Branch or reference to generate release notes to (default: 'HEAD')
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the release notes prompt (default: 10). Reducing this number can make the summary more focused, while increasing it provides broader historical context.

## Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process. Here's what it does:

1. **Dependency Management**: If a `pnpm-workspace.yaml` file is present, it's temporarily renamed to switch from workspace dependencies to registry versions. It then runs `pnpm update --latest` to ensure dependencies are up to date. You can configure specific dependency patterns to update instead of updating all dependencies using the `dependencyUpdatePatterns` configuration option.

2. **Pre-flight Checks**: Before committing any changes, it runs the `prepublishOnly` script from your `package.json`. This script should contain your project's pre-flight checks (e.g., `clean`, `lint`, `build`, `test`) to ensure the project is in a good state. **Note**: A `prepublishOnly` script is required in your `package.json` - the publish command will fail if this script is not present.

3. **Release Commit**: If there are changes to `package.json` or `pnpm-lock.yaml`, it creates an intelligent commit message for the dependency updates.

4. **Version Bump**: It automatically bumps the patch version of your project.

5. **Release Notes**: It generates release notes based on the recent changes and saves them to `RELEASE_NOTES.md`.

6. **Pull Request Automation**:
   - It pushes the changes and tags to the origin.
   - It creates a new pull request for the release.
   - It waits for all status checks on the pull request to pass.
   - Once checks are complete, it automatically merges the pull request using the configured merge method (default: squash).

7. **GitHub Release**: After the PR is merged, it checks out the `main` branch, pulls the latest changes, and creates a new GitHub release with the tag and release notes.

8. **New Release Branch**: Finally, it creates and pushes a new release branch for the next version (e.g., `release/0.0.5`).

This command is designed for repositories that follow a pull-request-based release workflow with required status checks. It streamlines the process, reducing manual steps and potential for error.

### Publish Command Options

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'

## Link Command

Manage pnpm workspace links for local development with sibling projects:

```bash
kodrdriv link
```

The `link` command automates the creation and management of pnpm workspace configurations for local development. It scans your project's dependencies and automatically discovers matching sibling packages in configured scope directories, then updates your `pnpm-workspace.yaml` file to link them for local development.

This is particularly useful when working with monorepos or related packages where you want to use local versions of dependencies instead of published registry versions during development.

### Link Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories for package discovery
  - **Format**: `'{"@scope": "path", "@another": "path"}'`
  - **Example**: `'{"@company": "../", "@myorg": "../../packages/"}'`
  - **Required**: At least one scope mapping must be provided
- `--workspace-file <workspaceFile>`: Path to the workspace file to create/update (default: 'pnpm-workspace.yaml')

For detailed information about each command, including advanced configuration options and use cases, see the complete [Commands Documentation](commands.md). 