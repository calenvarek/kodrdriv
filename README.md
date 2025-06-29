# KodrDriv

KodrDriv is a powerful utility designed to automatically generate intelligent release notes and change logs from your Git repository. It analyzes commit history, pull requests, and related metadata to create comprehensive, well-structured documentation of your project's evolution. By leveraging advanced parsing and analysis techniques, it helps teams maintain clear visibility into their codebase's development history while reducing the manual effort typically required for changelog maintenance.

## Installation

Install KodrDriv globally using npm:

```bash
npm install -g @eldrforge/kodrdriv
```

This will make the `kodrdriv` command available globally on your system.

## Commands

KodrDriv provides two main commands:

### Commit Command

Generate intelligent commit messages:

```bash
kodrdriv commit
```

> [!TIP]
> ### Working with Staged Changes
> 
> When you have staged changes using `git add`, the `kodrdriv commit` command will automatically analyze the diff of your staged changes. This allows you to selectively stage files and generate a commit message that specifically addresses those changes, rather than all uncommitted changes in your working directory.

> [!TIP]
> ### Quick Commit with --sendit
> 
> If you trust the quality of the generated commit messages, you can use the `--sendit` flag to automatically commit your changes with the generated message without review. This is useful for quick, routine changes where you want to streamline your workflow.


### Release Command

Generate comprehensive release notes based on changes since the last release:

```bash
kodrdriv release
```

> [!TIP]
> ### Custom Release Range
> 
> The `kodrdriv release` command supports customizing the range of commits to analyze using the `--from` and `--to` options. By default, it compares changes between the `main` branch and `HEAD`, but you can specify any valid Git reference (branch, tag, or commit hash) for either endpoint. This flexibility allows you to generate release notes for specific version ranges or between different branches.

> [!TIP]
> ### Comparing Releases
> 
> You can use the `--from` and `--to` options to generate release notes comparing two different releases. For example, to see what changed between v1.0.0 and v1.1.0, you could use `kodrdriv release --from v1.0.0 --to v1.1.0`. This is particularly useful for creating detailed changelogs when preparing release documentation.

### Publish Command

Automate the entire release process, from dependency updates to GitHub release creation:

```bash
kodrdriv publish
```

The `publish` command orchestrates a comprehensive release workflow, designed to ensure a safe and consistent release process. Here's what it does:

1.  **Dependency Management**: If a `pnpm-workspace.yaml` file is present, it's temporarily renamed to switch from workspace dependencies to registry versions. It then runs `pnpm update --latest` to ensure dependencies are up to date. You can configure specific dependency patterns to update instead of updating all dependencies using the `dependencyUpdatePatterns` configuration option.

2.  **Pre-flight Checks**: Before committing any changes, it runs the `prepublishOnly` script from your `package.json`. This script should contain your project's pre-flight checks (e.g., `clean`, `lint`, `build`, `test`) to ensure the project is in a good state. **Note**: A `prepublishOnly` script is required in your `package.json` - the publish command will fail if this script is not present.

3.  **Release Commit**: If there are changes to `package.json` or `pnpm-lock.yaml`, it creates an intelligent commit message for the dependency updates.

4.  **Version Bump**: It automatically bumps the patch version of your project.

5.  **Release Notes**: It generates release notes based on the recent changes and saves them to `RELEASE_NOTES.md`.

6.  **Pull Request Automation**:
    *   It pushes the changes and tags to the origin.
    *   It creates a new pull request for the release.
    *   It waits for all status checks on the pull request to pass.
    *   Once checks are complete, it automatically merges the pull request using the configured merge method (default: squash).

7.  **GitHub Release**: After the PR is merged, it checks out the `main` branch, pulls the latest changes, and creates a new GitHub release with the tag and release notes.

8.  **New Release Branch**: Finally, it creates and pushes a new release branch for the next version (e.g., `release/0.0.5`).

This command is designed for repositories that follow a pull-request-based release workflow with required status checks. It streamlines the process, reducing manual steps and potential for error.

> [!TIP]
> ### Choosing the Right Merge Method
> 
> The merge method you choose affects your Git history and can impact your team's workflow:
> 
> - **Squash** (default): Best for keeping a clean, linear history. All commits from the feature branch are combined into a single commit, making it easier to understand what was changed in each release.
> 
> - **Merge**: Preserves the complete commit history from the feature branch. Use this when you want to maintain detailed development history and individual commit information.
> 
> - **Rebase**: Creates a linear history without merge commits. The commits from the feature branch are replayed on top of the target branch. This keeps history clean while preserving individual commits.
> 
> Consider your team's preferences and any branch protection rules when choosing a merge method.

## Command Line Options

KodrDriv provides several command line options to customize its behavior:

### Basic Options

- `--dry-run`: Perform a dry run without saving files (default: false)
- `--verbose`: Enable verbose logging (default: false)
- `--debug`: Enable debug logging (default: false)
- `--version`: Display version information

### Commit Command Options

- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review (default: false)
- `--context <context>`: Provide additional context (as a string or file path) to guide the commit message generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the commit.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the prompt for context (default: 10). This can help focus the AI on the most relevant recent changes.

### Publish Command Options

- `--merge-method <method>`: Method to merge pull requests during the publish process (default: 'squash')
  - Available methods: 'merge', 'squash', 'rebase'
  - `merge`: Creates a merge commit that combines the feature branch into the target branch
  - `squash`: Combines all commits from the feature branch into a single commit on the target branch
  - `rebase`: Replays commits from the feature branch onto the target branch without creating a merge commit

#### Dependency Update Configuration

The publish command supports selective dependency updates through the `dependencyUpdatePatterns` configuration option. This allows you to specify which dependencies should be updated during the release process instead of updating all dependencies.

**Configuration:**
```json
{
  "publish": {
    "dependencyUpdatePatterns": ["@company/*", "@myorg/*", "specific-package"]
  }
}
```

**Behavior:**
- When patterns are specified, only dependencies matching those patterns will be updated
- Patterns can include npm scopes (e.g., `@company/*`) or specific package names
- If no patterns are configured, all dependencies are updated (default behavior)
- This is particularly useful when developing a set of related packages where you want to ensure you're using the latest versions of your organization's packages while keeping other dependencies stable

#### Environment Variable Configuration

The publish command includes comprehensive environment variable validation to ensure all required credentials and tokens are available before starting the release process. This prevents failures partway through the publication workflow.

**Core Required Environment Variables:**

The following environment variables are required by default for all publish operations:

- `GITHUB_TOKEN`: Required for GitHub API operations (creating pull requests, releases, etc.)
- `OPENAI_API_KEY`: Required for AI-powered commit message and release note generation

**Configurable Additional Environment Variables:**

You can specify additional required environment variables specific to your project or organization:

**Configuration (config.yaml):**
```yaml
publish:
  requiredEnvVars:
    - NODE_AUTH_TOKEN        # Often needed for publishing to npm
    - DEPLOY_KEY            # Custom deployment credentials
    - CUSTOM_API_TOKEN      # Organization-specific tokens
    - CODECOV_TOKEN         # Code coverage reporting
```

**Configuration (config.json):**
```json
{
  "publish": {
    "requiredEnvVars": [
      "NODE_AUTH_TOKEN",
      "DEPLOY_KEY", 
      "CUSTOM_API_TOKEN",
      "CODECOV_TOKEN"
    ]
  }
}
```

**Automatic .npmrc Scanning:**

The publish command automatically scans your `.npmrc` file for environment variable references and includes them in the validation. It detects common patterns like:

- `${NODE_AUTH_TOKEN}` - Curly brace syntax
- `$NODE_AUTH_TOKEN` - Direct variable reference

Example `.npmrc` file:
```
@myorg:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

In this case, `NODE_AUTH_TOKEN` would be automatically detected and validated.

**Validation Behavior:**
- All environment variable checks happen during the initial prechecks phase
- If any required environment variables are missing, the publish command fails immediately with a clear error message
- The error message lists all missing variables at once, making it easy to set them all before retrying
- Variables from configuration, .npmrc scanning, and core requirements are combined and deduplicated

**Example Error:**
```
Missing required environment variables: NODE_AUTH_TOKEN, DEPLOY_KEY. 
Please set these environment variables before running publish.
```

**Security Best Practices:**
- Store sensitive environment variables in your CI/CD system's secure variable storage
- Use tools like 1Password CLI, HashiCorp Vault, or similar for local development
- Never commit environment variables or tokens to your repository
- Consider using `.env` files (with proper .gitignore configuration) for local development

#### prepublishOnly Script Requirement

The publish command requires a `prepublishOnly` script to be defined in your `package.json`. This script should contain all the checks and builds necessary to verify your project is ready for release.

**Example package.json:**
```json
{
  "scripts": {
    "prepublishOnly": "pnpm run clean && pnpm run lint && pnpm run build && pnpm run test",
    "clean": "rimraf dist",
    "lint": "eslint src/",
    "build": "tsc",
    "test": "vitest run"
  }
}
```

**Why prepublishOnly?**
- The `prepublishOnly` script is an npm/pnpm standard that runs automatically before publishing packages
- It ensures consistent pre-flight checks regardless of how the package is published
- It allows projects to define their own specific validation pipeline
- The publish command validates this script exists during the initial prechecks phase

**Common prepublishOnly Patterns:**
- `"prepublishOnly": "npm run test"` - Run tests only
- `"prepublishOnly": "npm run build && npm run test"` - Build and test
- `"prepublishOnly": "npm run lint && npm run build && npm run test"` - Full validation pipeline
- `"prepublishOnly": "npm run ci"` - Delegate to a CI script that includes all checks

If this script is missing, the publish command will fail immediately with a helpful error message explaining the requirement.

### OpenAI Configuration

- `--openai-api-key <key>`: OpenAI API key (can also be set via OPENAI_API_KEY environment variable)
- `--model <model>`: OpenAI model to use (default: 'gpt-4o-mini')

> [!NOTE]
> ### Security Considerations
> 
> The OpenAI API key should be handled securely. While the `--openai-api-key` option is available, it's recommended to use environment variables instead. Git Intelligent Change automatically loads environment variables from a `.env` file in your current working directory.
> 
> While environment variables are a common approach for configuration, they can still pose security risks if not properly managed. We strongly encourage users to utilize secure credential management solutions like 1Password, HashiCorp Vault, or other keystores to protect sensitive information. This helps prevent accidental exposure of API keys and other credentials in logs, process listings, or environment dumps.

### Content Configuration

- `-c, --content-types [types...]`: Content types to include in the summary (default: ['diff'])
  - Available types: 'log', 'diff'
  - Can specify multiple types: `--content-types log diff`

### Instructions

- `-i, --instructions <file>`: Path to custom instructions file for the AI (default: './.kodrdriv/instructions.md')

### Examples

Basic usage with default settings:
```bash
kodrdriv commit
```

Generate a commit message and automatically commit it:
```bash
kodrdriv commit --sendit
```

Generate release notes:
```bash
kodrdriv release
```

Generate a summary including both git log and diff information:
```bash
kodrdriv release --content-types log diff
```

Run in verbose mode with a custom OpenAI model:
```bash
kodrdriv commit --verbose --model gpt-4
```

Use custom instructions from a file:
```bash
kodrdriv release --instructions ./my-custom-instructions.md
```

Use custom context and message limit:
```bash
kodrdriv commit --context "Refactoring for performance" --message-limit 5
kodrdriv release --context "Quarterly release, focus on stability" --message-limit 20
```

Publish with different merge methods:
```bash
# Use default squash merge
kodrdriv publish

# Use merge commit (preserves individual commits)
kodrdriv publish --merge-method merge

# Use rebase (clean linear history)
kodrdriv publish --merge-method rebase
```

### Configuration Directory

KodrDriv uses a configuration directory to store custom settings, instructions, and other configuration files. You can specify a custom location using the `--config-dir` option:

```bash
kodrdriv --config-dir ~/custom-kodrdriv-config
```

By default, the configuration directory is set to `.kodrdriv` in your current working directory. This directory is created automatically if it doesn't exist.

The configuration directory structure is as follows:

```
.kodrdriv/
├── instructions/
│   ├── commit.md         # Override for commit instructions
│   ├── commit-pre.md     # Content prepended to default commit instructions
│   ├── commit-post.md    # Content appended to default commit instructions
│   ├── release.md        # Override for release instructions
│   ├── release-pre.md    # Content prepended to default release instructions
│   └── release-post.md   # Content appended to default release instructions
├── config.json           # Main configuration file
└── ...                   # Other configuration files
```

### Configuration File

You can create a `config.json` file in your `.kodrdriv` directory to set default options for all commands. This allows you to avoid repeating command-line options and ensures consistent behavior across your project.

Example configuration file (`.kodrdriv/config.json`):

```json
{
  "model": "gpt-4o-mini",
  "verbose": true,
  "contextDirectories": ["src", "docs"],
  "publish": {
    "mergeMethod": "merge",
    "dependencyUpdatePatterns": ["@company/*", "@myorg/*"],
    "requiredEnvVars": ["NODE_AUTH_TOKEN", "CUSTOM_TOKEN"]
  },
  "commit": {
    "add": true,
    "messageLimit": 5
  },
  "release": {
    "from": "main",
    "to": "HEAD",
    "messageLimit": 10
  },
  "excludedPatterns": [
    "node_modules",
    "dist",
    "*.log"
  ]
}
```

Configuration options set in the file can be overridden by command-line arguments. The precedence order is:
1. Command-line arguments (highest priority)
2. Configuration file
3. Default values (lowest priority)

## Default Instructions

KodrDriv comes with default instructions that guide the AI in generating release notes or change logs. These instructions are defined in the source code:

- **Commit Instructions**: The default instructions for commit message generation are defined in [src/prompt/instructions/commit.ts](https://github.com/eldrforge/kodrdriv/blob/main/src/prompt/instructions/commit.ts).

- **Release Instructions**: The default instructions for release notes generation are defined in [src/prompt/instructions/release.ts](https://github.com/eldrforge/kodrdriv/blob/main/src/prompt/instructions/release.ts).

These instruction files contain detailed guidelines for the AI on how to format and structure the output, including examples and specific requirements for different types of changes.

### Customizing Instructions

You can override these default instructions in several ways:

1. **Command Line Option**: Use the `--instructions` flag to specify a custom instructions file:
   ```bash
   kodrdriv --instructions ./my-custom-instructions.txt
   ```

2. **Default Location**: Even without specifying a command line option, Git Intelligent Change will automatically look for an instructions file at `./.kodrdriv/instructions.md` in your current working directory.

3. **File Format**: While the default file is named `instructions.md`, you can use any text file with any extension. The content doesn't have to be in Markdown format - any plain text content will work. This gives you flexibility to use your preferred text editor or format for writing instructions.

## Prompt Structure

When KodrDriv sends a request to the LLM, it structures the prompt using XML-like tags to organize different components of the input. The prompt is composed of three main sections:

```
<instructions>
[Your custom instructions or the default instructions]
</instructions>

<log>
[Git log output if --content-types includes 'log']
</log>

<diff>
[Git diff output if --content-types includes 'diff']
</diff>
```

Each section serves a specific purpose:
- `<instructions>`: Contains the guidance for the LLM on how to format and structure the output
- `<log>`: Contains the git log output, providing commit history and messages
- `<diff>`: Contains the git diff output, showing the actual code changes

## Context

KodrDriv can use contextual information about your project to generate more meaningful commit messages and release notes. Context is provided through Markdown files stored in a dedicated directory.

### Context Directory Structure

The structure of your context directory is entirely up to you. There are no strict requirements for how you organize your context files - you can structure them in whatever way makes the most sense for your project and team.

Here are two example approaches to organizing context files:

#### Hierarchical Structure Example

You can organize context in a hierarchical structure with subdirectories for different categories:

```
.kodrdriv/context/
├── context.md                # Main context file describing sections
├── people/                   # Directory for information about people
│   ├── context.md            # Description of the people section
│   ├── team-members.md       # Information about team members
│   └── contributors.md       # Information about contributors
├── projects/                 # Directory for project information
│   ├── context.md            # Description of the projects section
│   └── project-details.md    # Details about various projects
└── technologies/             # Directory for technical information
    ├── context.md            # Description of the technologies section
    ├── frameworks.md         # Information about frameworks used
    └── libraries.md          # Information about libraries used
```

#### Individual Records Example

Alternatively, you can use a flatter structure with individual files for each entity:

```
.kodrdriv/context/
├── context.md                # Main context file describing sections
├── people/                   # Directory for individual people information
│   ├── context.md            # Description of the people section
│   ├── john-doe.md           # Information specific to John Doe
│   ├── jane-smith.md         # Information specific to Jane Smith
│   └── alex-johnson.md       # Information specific to Alex Johnson
```

Choose the organization that works best for your needs. The system will process the context files regardless of the structure, as long as they follow the basic Markdown formatting guidelines.

### Main Context File

The `context.md` file in each directory serves as an introduction to that section. The system loads this file first to understand the structure of the information. For example, a `context.md` file in the people directory might look like:

```markdown
## People

This section contains subsections that have information about people.
```

### Context Files

After loading the `context.md` file, the system reads all other Markdown files in the directory. It uses the first header in each file as the name of the section or subsection. For example:

```markdown
## Team Members

- John Doe: Lead Developer, focuses on backend systems
- Jane Smith: UX Designer, specializes in responsive interfaces
- Alex Johnson: DevOps Engineer, manages deployment pipelines
```

### Context Location

You can specify where to store your context files in two recommended ways:

1. **Project Directory**: Store context files in your project repository at `.kodrdriv/context/`. This is useful when the context is specific to the project and should be versioned with the code.

2. **gitignore Directory**: Alternatively, you can store context in your `.gitignore` directory if you want to keep it separate from your project files or if the context contains sensitive information that shouldn't be committed to the repository.

To specify a custom context directory, use the `--context-dir` option:

```bash
kodrdriv commit --context-dir ~/my-custom-context
```

By default, KodrDriv looks for context in the `.kodrdriv/context` directory within your project.

## Configuration Directory

The configuration directory (configDir) allows you to further customize both commit and release instructions by adding pre and post content to the default instructions. This is done by creating additional files in your `.kodrdriv/instructions` directory:

### Release Instructions
1. **Pre-Content**: Create a file named `release-pre.md` to add content that will be prepended to the default release instructions.
2. **Post-Content**: Create a file named `release-post.md` to add content that should be appended to the default release instructions.

### Commit Instructions
1. **Pre-Content**: Create a file named `commit-pre.md` to add content that will be prepended to the default commit instructions.
2. **Post-Content**: Create a file named `commit-post.md` to add content that should be appended to the default commit instructions.

For example, if you want to add specific formatting requirements before the default release instructions, you could create `.kodrdriv/instructions/release-pre.md`, and if you want to add instructions to the end of the commit instrucitons, you would have a file in `.kodrdriv/instructions/commit-post.md`.

### Overriding Default Instructions

While the pre and post content files provide a way to extend the default instructions, you can also completely replace them by creating either `commit.md` or `release.md` in your `.kodrdriv/instructions` directory. This gives you full control over the instruction content.

However, please note that completely replacing the default instructions should be done with caution. The default instructions are carefully crafted to:
- Ensure consistent formatting
- Maintain proper context awareness
- Follow best practices for commit messages and release notes
- Handle edge cases and special scenarios

By replacing these instructions entirely, you may lose these benefits and potentially create inconsistencies in your documentation. It's recommended to use the pre and post content files to extend the default instructions rather than replacing them entirely, unless you have a specific need to do so.

To enable instruction overrides, you'll need to use the `--overrides` flag when running the command.

## About the Name

Ski carving and efficient software development have a lot in common. Carving uses edge control to follow a smooth, energy-efficient arc — just like automation uses clean, repeatable scripts to replace manual work. Both are about flow: linking turns or commits without hesitation. As carving unlocks speed and control, automation unlocks scalability and momentum. The result is clean tracks — razor-thin arcs on snow, or tidy diffs in code. And when you've mastered your craft, you don't stop to think about your last move. Your code leaves a clean trail — and your commit message can be automated straight from the diff.  And — snowboarders carve too. Different board, same beauty. We won't hold it against you if you're dropping clean edges on a single plank.

## Origin Story: kodrdriv

It always happened at the same moment.

You've just spent the entire day in a flow state — the kind that only comes when everything clicks. Whether it was writing code for a critical feature or hammering out chapters of a Markdown or AsciiDoc book, you were locked in. Maybe you were racing the clock to hit a deadline. Maybe you were just up late trying to carve something beautiful out of nothing. Either way, you went right up to the wire, focused, dialed in, exhausted but satisfied.

And then… Git hits you with the meta-question:
"What did you do?"

That one prompt — to sum it all up in a commit message — feels totally out of place. It asks you to stop, zoom out, and articulate everything you've just done, right when your brain is at its least reflective. You're not in summary mode. You're still in it. Still shaping. Still carving.

And that's the thing: it sounds silly, like it shouldn't be a real problem. But every developer, every writer who lives in Git knows that exact moment. The friction is real. The context switch is jarring. It's like being asked to narrate your entire ski run after you've blasted through powder, dodged trees, hit the cliff drop — and now you're out of breath, standing at the bottom, being asked to give a PowerPoint.

That's why I built kodrdriv.

It's not just a tool — it's a mindset shift. The idea is simple: you've already carved your line in the snow. Your code is there. Your diffs are real. Instead of making you explain it, kodrdriv uses an LLM to read the trail you left behind and generate a clean, meaningful commit message. One that actually reflects your work — without breaking your flow or making you guess what mattered most.

Whether you're merging branches or writing books, kodrdriv is built for that end-of-day moment when you want to commit and move on — not pause for existential reflection. It reads the line you've drawn, and it helps you push it forward.

### Release Command Options

- `--from <from>`: Branch or reference to generate release notes from
- `--to <to>`: Branch or reference to generate release notes to
- `--context <context>`: Provide additional context (as a string or file path) to guide the release notes generation. This context is included in the prompt sent to the AI and can be used to specify the purpose, theme, or any special considerations for the release.
- `--message-limit <messageLimit>`: Limit the number of recent commit messages (from git log) to include in the release notes prompt (default: 10).

### Explanation

- The `--context` option allows you to inject custom context into the AI prompt, which can help tailor the generated commit message or release notes to your specific needs or project conventions. You can provide a string directly or a path to a file containing the context.
- The `--message-limit` option controls how many recent commit messages are included in the prompt. Reducing this number can make the summary more focused, while increasing it can provide broader historical context.








