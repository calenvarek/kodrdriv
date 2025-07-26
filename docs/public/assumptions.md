# KodrDriv Assumptions

## Overview

Before diving into KodrDriv, it's essential to understand the core assumptions and philosophical approach that drive this project. These assumptions fundamentally shape how KodrDriv works and why certain design decisions were made.

## Core Philosophy

KodrDriv is built on a **strong aversion to monolithic workspaces in source control**. The creator of this project has experienced too many situations where building collections of related projects ultimately yields an "inscrutable monolithic disaster."

### The Problem with Monolithic Workspaces

When multiple related projects are checked into Git as part of a larger workspace, several problems emerge:

- **Complexity Explosion**: Dependencies between projects become tangled and difficult to understand
- **Build System Nightmares**: Coordinating builds across multiple projects becomes increasingly complex
- **Deployment Challenges**: It becomes difficult to deploy individual components independently
- **Team Coordination Issues**: Different teams working on different parts of the monolith step on each other
- **Version Management**: Managing versions across tightly-coupled projects becomes a coordination nightmare

## Main Assumptions

KodrDriv operates under these key assumptions:

### 1. **Separate Entities in Source Control**

Each project should be checked into source control as a **completely separate entity** with little to no awareness of dependencies other than coordinates from npm repositories.

**What this means:**
- Each project has its own Git repository
- Dependencies are managed through package.json and npm/yarn
- Projects don't directly reference file paths in other projects
- Each project can be built, tested, and deployed independently

### 2. **Local Development Requires Intelligent Linking**

While projects are separate in source control, local development often requires working across multiple related projects simultaneously.

**What this means:**
- You need the ability to "link" projects together on your local filesystem
- These links should be intelligent and context-aware
- Links should be temporary and not affect the source control state
- You should be able to "unlink" projects when preparing for deployment

### 3. **Multi-Organizational Development**

Modern development spans across different companies, individuals, and open source projects.

**What this means:**
- Your local development environment may include projects from multiple sources
- Dependencies might come from different npm registries or Git repositories
- You need flexible tooling that works across organizational boundaries
- The linking system must handle projects with different ownership and access patterns

## Alternatives and Why KodrDriv Exists

### Acknowledgment of Existing Tools

**Lerna is a wonderful utility**, and we want to be crystal clear: **KodrDriv is not here to recreate Lerna**. Lerna excels at managing monorepos and has solved many real problems for teams working within that paradigm. If Lerna works for your workflow, that's fantastic—keep using it.

Similarly, modern development environments like **VSCode, Cursor, and AI assistants like Claude** all have capabilities that can help with project management, automation, and even generating commit messages or release notes. These tools are powerful and valuable.

### What Makes KodrDriv Different

KodrDriv's key differentiator is **decoupling important development processes from specific tools**. Here's what this means:

#### **Tool Independence**
- **Customizable Instructions**: With KodrDriv, you can customize content generation, release notes, and commit message creation using instructions and context that you **version control in Git**
- **Command Line First**: Everything runs from the command line, making it scriptable, automatable, and independent of your IDE or AI assistant choice
- **Portable Workflows**: Your development workflows travel with your code, not with your tool choices

#### **Versioned Intelligence**
- Your commit message templates, release note instructions, and project-specific prompts live in your repository
- Team members get consistent, versioned approaches to content generation
- You can evolve and improve your development processes over time through Git history

#### **Process Ownership**
- Instead of being locked into how VSCode generates commit messages or how a particular AI assistant formats release notes, you own and control the process
- You can fine-tune instructions, add project-specific context, and maintain consistency across different development environments

### The Generative AI Philosophy

As **Generative AI becomes increasingly pervasive** in software development, we face a concerning trend: **developers are being forced to use particular tools** because no one has developed a good set of **open source utilities** that provide the same capabilities in a tool-agnostic way.

**This is what KodrDriv aims to address:**

- **Freedom from Vendor Lock-in**: Don't be forced to use a specific IDE or AI service just to get intelligent commit messages or release notes
- **Open Source Alternative**: Provide the same powerful capabilities through open source tooling that you can modify, extend, and control
- **Sustainable Workflows**: Build development processes that aren't dependent on the latest proprietary AI integration or platform-specific feature

**The Vision**: In a world where AI assists with more and more of our development workflow, we need **open, portable, and customizable tools** that give developers choice and control over how they work, rather than forcing adoption of specific proprietary platforms.

## Example Filesystem Structure

Here's an example of how a filesystem might be organized following KodrDriv's assumptions:

```
~/development/
├── work/
│   ├── company-frontend/          # Main frontend app (Git repo #1)
│   │   ├── package.json
│   │   └── node_modules/
│   │       └── @company/ui-lib -> ../../ui-components/  # Linked during dev
│   ├── company-api/               # Backend API (Git repo #2)
│   │   ├── package.json
│   │   └── src/
│   └── ui-components/             # Shared UI library (Git repo #3)
│       ├── package.json
│       └── dist/
├── opensource/
│   ├── some-useful-library/       # Open source dependency (Git repo #4)
│   │   └── package.json
│   └── community-tools/           # Community project (Git repo #5)
│       └── package.json
└── personal/
    ├── my-side-project/           # Personal project (Git repo #6)
    │   └── package.json
    └── experiments/
        └── prototype-app/         # Experimental work (Git repo #7)
            └── package.json
```

### Key Characteristics of This Structure:

1. **Each directory is a separate Git repository**
2. **Dependencies are linked locally** (e.g., `@company/ui-lib` points to `../../ui-components/`)
3. **Projects span different contexts** (work, open source, personal)
4. **No single "workspace" or "monorepo"** encompasses everything
5. **Local links enable cross-project development** without coupling in source control

## What This Means for You

If you're considering using KodrDriv, you should be comfortable with:

### ✅ **This Approach Works Well If You:**

- Prefer keeping projects as separate Git repositories
- Need to work across multiple related projects locally
- Want to maintain clear boundaries between different concerns
- Work with dependencies from multiple sources (companies, open source, personal)
- Value the ability to deploy and version projects independently
- Want intelligent tooling for linking/unlinking local development dependencies

### ❌ **This Approach May Not Work If You:**

- Prefer traditional monorepos with all code in a single repository
- Don't mind tightly-coupled project dependencies
- Primarily work within a single, well-defined project boundary
- Don't need cross-project local development workflows
- Are happy with existing monorepo tooling (Lerna, Nx, Rush, etc.)

## The Link/Unlink Workflow

KodrDriv's core commands (`link` and `unlink`) are designed around this philosophy:

- **`link`**: Intelligently connects related projects on your local filesystem for development
- **`unlink`**: Removes local connections, restoring projects to their independent state for deployment

This workflow ensures that:
- Local development is fluid and efficient
- Source control remains clean and independent
- Deployment processes work with truly independent projects
- Team coordination is simplified through clear project boundaries

## Conclusion

KodrDriv assumes you want the **benefits of both worlds**: the clean separation and independence of multiple repositories, combined with the convenience of integrated local development. If this philosophical approach aligns with your development style and project needs, KodrDriv provides the tooling to make this workflow efficient and reliable.
