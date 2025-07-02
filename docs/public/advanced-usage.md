# Advanced Usage

This section covers advanced features and customization options for KodrDriv.

## Custom Instructions

KodrDriv comes with default instructions that guide the AI in generating release notes or change logs. These instructions can be customized to match your project's specific needs and conventions.

### Default Instructions

The default instructions are defined in the source code:

- **Commit Instructions**: The default instructions for commit message generation are defined in [src/prompt/instructions/commit.ts](https://github.com/eldrforge/kodrdriv/blob/main/src/prompt/instructions/commit.ts).

- **Release Instructions**: The default instructions for release notes generation are defined in [src/prompt/instructions/release.ts](https://github.com/eldrforge/kodrdriv/blob/main/src/prompt/instructions/release.ts).

These instruction files contain detailed guidelines for the AI on how to format and structure the output, including examples and specific requirements for different types of changes.

### Customizing Instructions

You can override these default instructions in several ways:

1. **Default Location**: KodrDriv will automatically look for an instructions file at `./.kodrdriv/instructions.md` in your current working directory.

2. **File Format**: While the default file is named `instructions.md`, you can use any text file with any extension. The content doesn't have to be in Markdown format - any plain text content will work. This gives you flexibility to use your preferred text editor or format for writing instructions.

### Extending Default Instructions

The configuration directory (configDir) allows you to further customize both commit and release instructions by adding pre and post content to the default instructions. This is done by creating additional files in your `.kodrdriv/instructions` directory:

#### Release Instructions
1. **Pre-Content**: Create a file named `release-pre.md` to add content that will be prepended to the default release instructions.
2. **Post-Content**: Create a file named `release-post.md` to add content that should be appended to the default release instructions.

#### Commit Instructions
1. **Pre-Content**: Create a file named `commit-pre.md` to add content that will be prepended to the default commit instructions.
2. **Post-Content**: Create a file named `commit-post.md` to add content that should be appended to the default commit instructions.

For example, if you want to add specific formatting requirements before the default release instructions, you could create `.kodrdriv/instructions/release-pre.md`, and if you want to add instructions to the end of the commit instructions, you would have a file in `.kodrdriv/instructions/commit-post.md`.

### Overriding Default Instructions

While the pre and post content files provide a way to extend the default instructions, you can also completely replace them by creating either `commit.md` or `release.md` in your `.kodrdriv/instructions` directory. This gives you full control over the instruction content.

However, please note that completely replacing the default instructions should be done with caution. The default instructions are carefully crafted to:
- Ensure consistent formatting
- Maintain proper context awareness
- Follow best practices for commit messages and release notes
- Handle edge cases and special scenarios

By replacing these instructions entirely, you may lose these benefits and potentially create inconsistencies in your documentation. It's recommended to use the pre and post content files to extend the default instructions rather than replacing them entirely, unless you have a specific need to do so.

To enable instruction overrides, you'll need to use the `--overrides` flag when running the command.

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

## Prompt Structure

When KodrDriv sends a request to the LLM, it structures the prompt using XML-like tags to organize different components of the input. The prompt is composed of three main sections:

```
<instructions>
[Your custom instructions or the default instructions]
</instructions>

<log>
[Git log output]
</log>

<diff>
[Git diff output]
</diff>
```

Each section serves a specific purpose:
- `<instructions>`: Contains the guidance for the LLM on how to format and structure the output
- `<log>`: Contains the git log output, providing commit history and messages
- `<diff>`: Contains the git diff output, showing the actual code changes

## About the Name

Ski carving and efficient software development have a lot in common. Carving uses edge control to follow a smooth, energy-efficient arc — just like automation uses clean, repeatable scripts to replace manual work. Both are about flow: linking turns or commits without hesitation. As carving unlocks speed and control, automation unlocks scalability and momentum. The result is clean tracks — razor-thin arcs on snow, or tidy diffs in code. And when you've mastered your craft, you don't stop to think about your last move. Your code leaves a clean trail — and your commit message can be automated straight from the diff. And — snowboarders carve too. Different board, same beauty. We won't hold it against you if you're dropping clean edges on a single plank.

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