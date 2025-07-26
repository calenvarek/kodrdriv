# Customization

KodrDriv provides extensive customization options through directory structures that allow you to override default behaviors and provide project-specific context.

## Context Directories

KodrDriv can use contextual information about your project to generate more meaningful commit messages and release notes. Context is provided through Markdown files stored in a dedicated directory.

### Setting Up Context

By default, KodrDriv looks for context in the `.kodrdriv/context` directory within your project. You can specify a custom location using the `--context-dir` option:

```bash
kodrdriv commit --context-dir ~/my-custom-context
```

### Directory Structure

The structure of your context directory is entirely flexible. You can organize your context files in whatever way makes the most sense for your project and team.

#### Hierarchical Structure Example

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

```
.kodrdriv/context/
├── context.md                # Main context file describing sections
├── people/                   # Directory for individual people information
│   ├── context.md            # Description of the people section
│   ├── john-doe.md           # Information specific to John Doe
│   ├── jane-smith.md         # Information specific to Jane Smith
│   └── alex-johnson.md       # Information specific to Alex Johnson
```

### Context File Format

#### Main Context Files

The `context.md` file in each directory serves as an introduction to that section. For example:

```markdown
## People

This section contains information about team members and their roles.
```

#### Content Files

After loading the `context.md` file, the system reads all other Markdown files in the directory. It uses the first header in each file as the section name:

```markdown
## Team Members

- John Doe: Lead Developer, focuses on backend systems
- Jane Smith: UX Designer, specializes in responsive interfaces
- Alex Johnson: DevOps Engineer, manages deployment pipelines
```

### Context Storage Options

1. **Project Directory**: Store context files in your project repository at `.kodrdriv/context/`. This is useful when the context is specific to the project and should be versioned with the code.

2. **External Directory**: Store context separately if it contains sensitive information or should be shared across multiple projects.

## Override Directory Structure

KodrDriv allows you to customize its behavior by overriding default instructions and personas through a structured directory approach.

### Configuration Directory

All customizations are stored in the `.kodrdriv` directory within your project:

```
.kodrdriv/
├── context/                  # Project context (covered above)
├── instructions/             # Custom instructions
└── personas/                 # Custom personas
```

### Overriding Instructions

Instructions guide the AI in generating commit messages and release notes. You can customize them at different levels:

#### Complete Override

Replace default instructions entirely by creating these files:

```
.kodrdriv/instructions/
├── commit.md                 # Complete replacement for commit instructions
└── release.md                # Complete replacement for release instructions
```

**Note**: Complete replacement should be done with caution, as default instructions handle many edge cases and follow best practices.

#### Extending Default Instructions

Extend default instructions by adding content before or after:

```
.kodrdriv/instructions/
├── commit-pre.md             # Prepended to default commit instructions
├── commit-post.md            # Appended to default commit instructions
├── release-pre.md            # Prepended to default release instructions
└── release-post.md           # Appended to default release instructions
```

#### Legacy Override

For backward compatibility, you can also place a general instructions file:

```
.kodrdriv/instructions.md     # General instructions (legacy approach)
```

### Overriding Personas

Personas define the "personality" and role of the AI for different commands. KodrDriv uses different personas for different tasks:

- **you.md**: Used for commit, review, audio-commit, and audio-review commands
- **releaser.md**: Used for release commands

#### Complete Persona Override

Replace default personas entirely:

```
.kodrdriv/personas/
├── you.md                    # Complete replacement for default persona
└── releaser.md               # Complete replacement for releaser persona
```

#### Extending Default Personas

Extend default personas by adding content before or after:

```
.kodrdriv/personas/
├── you-pre.md                # Prepended to default "you" persona
├── you-post.md               # Appended to default "you" persona
├── releaser-pre.md           # Prepended to default "releaser" persona
└── releaser-post.md          # Appended to default "releaser" persona
```

### Example Persona Customization

Here's an example of extending the default "you" persona to add project-specific context:

**`.kodrdriv/personas/you-post.md`**:
```markdown
## Project-Specific Guidelines

- Always reference the ticket number in commit messages
- Use the team's preferred conventional commit format
- Consider accessibility implications in all UI changes
```

### Using Overrides

To enable instruction and persona overrides, use the `--overrides` flag:

```bash
kodrdriv commit --overrides
kodrdriv release --overrides
```

This tells KodrDriv to look for and apply your custom instructions and personas instead of using only the defaults.
