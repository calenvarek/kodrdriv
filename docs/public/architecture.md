# KodrDriv Architecture

This document outlines the architectural design of KodrDriv, an AI-powered Git workflow automation tool. It covers the global configuration approach, command structure, shared utilities, external system integrations, and guidance for customization.

## Table of Contents

- [Overview](#overview)
- [Architecture Principles](#architecture-principles)
- [Configuration System](#configuration-system)
- [Command Architecture](#command-architecture)
- [Shared Utilities and Libraries](#shared-utilities-and-libraries)
- [External System Integrations](#external-system-integrations)
- [AI and Prompt Engineering](#ai-and-prompt-engineering)
- [Data Flow](#data-flow)
- [Customization and Extension](#customization-and-extension)
- [Development Guidelines](#development-guidelines)

## Overview

KodrDriv is built as a Node.js CLI application with a modular architecture that emphasizes:

- **Hierarchical Configuration**: Global configuration system with command-specific overrides
- **Command Pattern**: Each major feature implemented as an independent command module
- **Shared Utilities**: Common functionality abstracted into reusable utility modules
- **External API Integration**: Seamless integration with OpenAI, GitHub, and system tools
- **Type Safety**: Comprehensive TypeScript types with Zod schema validation

## Architecture Principles

### 1. Separation of Concerns
- **Commands**: Handle user-facing operations and orchestration
- **Utilities**: Provide reusable functionality (API calls, file operations, etc.)
- **Content Modules**: Generate and format specific types of data (diffs, logs, etc.)
- **Configuration**: Centralized, type-safe configuration management

### 2. Dependency Injection
- Configuration and utilities are passed down to commands
- Commands don't directly access global state
- Facilitates testing and modular development

### 3. Fail-Safe Operations
- Dry-run mode for all operations
- Comprehensive error handling and logging
- Graceful degradation when external services are unavailable

## Configuration System

KodrDriv uses a sophisticated hierarchical configuration system powered by [CardiganTime](https://github.com/theunwalked/cardigantime).

### Configuration Hierarchy (Highest to Lowest Priority)

1. **CLI Arguments** - Command-line flags and options
2. **Config Files** - Project and user configuration files
3. **Defaults** - Built-in default values

### Configuration Schema

```typescript
// src/types.ts
export const ConfigSchema = z.object({
    // Global options
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    model: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    outputDirectory: z.string().optional(),
    
    // Command-specific configurations
    commit: z.object({
        add: z.boolean().optional(),
        cached: z.boolean().optional(),
        sendit: z.boolean().optional(),
        messageLimit: z.number().optional(),
    }).optional(),
    
    audioCommit: z.object({
        maxRecordingTime: z.number().optional(),
        audioDevice: z.string().optional(),
        file: z.string().optional(),
    }).optional(),
    
    // ... other command configs
});
```

### Configuration Files

- **Project Config**: `.kodrdriv/` directory in project root
- **User Config**: `~/.kodrdriv/` directory in user home
- **Format**: YAML, JSON, or JavaScript files supported

### Environment Variables

Sensitive configuration stored in environment variables:
- `OPENAI_API_KEY` - Required for AI operations
- `GITHUB_TOKEN` - Required for GitHub API operations

## Command Architecture

Each command follows a consistent pattern implemented in `src/commands/`:

### Command Structure

```typescript
// Standard command interface
export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;
    
    if (isDryRun) {
        // Log what would be done
        return 'DRY RUN: ...'
    }
    
    // Actual implementation
    // ...
    
    return 'Result summary';
};
```

### Available Commands

| Command | Purpose | Key Dependencies |
|---------|---------|------------------|
| `commit` | Generate commit messages from Git diffs | Git, OpenAI |
| `audio-commit` | Voice-driven commit message generation | Audio recording, OpenAI Whisper, Git |
| `release` | Generate release notes from Git history | Git, OpenAI |
| `publish` | Automate complete release workflow | Git, GitHub API, OpenAI |
| `review` | Analyze text for project issues | OpenAI, GitHub API |
| `audio-review` | Voice-driven code review and issue detection | Audio recording, OpenAI |
| `link/unlink` | Manage workspace package dependencies | File system, package.json |
| `select-audio` | Configure audio recording devices | System audio tools |
| `clean` | Clean output directories | File system |

### Command Registration

Commands are registered in the main entry point (`src/main.ts`):

```typescript
// Command routing
if (commandName === COMMAND_COMMIT) {
    summary = await Commit.execute(runConfig);
} else if (commandName === COMMAND_AUDIO_COMMIT) {
    summary = await AudioCommit.execute(runConfig);
}
// ... etc
```

## Shared Utilities and Libraries

### Core Utilities (`src/util/`)

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `openai.ts` | OpenAI API integration | `createCompletion()`, `transcribeAudio()` |
| `github.ts` | GitHub API operations | `createPullRequest()`, `getOpenIssues()`, `createRelease()` |
| `storage.ts` | File system operations | `writeFile()`, `readFile()`, `ensureDirectory()` |
| `child.ts` | Process execution | `run()` for Git and system commands |
| `general.ts` | Common utilities | Path resolution, timestamp generation |
| `dates.ts` | Date/time operations | Formatting, timezone handling |
| `stdin.ts` | Input handling | Reading from standard input |

### Content Modules (`src/content/`)

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `diff.ts` | Git diff processing | `getDiff()`, `getRecentDiffsForReview()` |
| `log.ts` | Git log processing | `create()`, `get()` with filtering |
| `releaseNotes.ts` | Release note generation | `get()` from GitHub releases |
| `issues.ts` | GitHub issue management | `get()`, `handleIssueCreation()` |

### Logging System

Centralized logging using Winston:

```typescript
// src/logging.ts
export const getLogger = (): Logger => {
    // Returns configured Winston logger
};

export const setLogLevel = (level: string): void => {
    // Updates global log level
};
```

Log levels: `error`, `warn`, `info`, `verbose`, `debug`, `silly`

## External System Integrations

### OpenAI Integration

**API Usage:**
- **GPT Models**: Text completion for commit messages, release notes, code analysis
- **Whisper**: Audio transcription for voice-driven features

**Configuration:**
- Model selection via `model` config option
- Default: `gpt-4o-mini` for cost efficiency
- Alternative: `gpt-4o` for higher quality

**Error Handling:**
- Comprehensive error wrapping with `OpenAIError`
- API key validation
- Rate limiting and retry logic

### GitHub Integration

**Operations:**
- Pull request creation and management
- Issue creation and retrieval
- Release creation
- Repository metadata access

**Authentication:**
- GitHub token via `GITHUB_TOKEN` environment variable
- Automatic repository detection from Git remotes

### Audio System Integration

**Platform Support:**
- **macOS**: ffmpeg with AVFoundation, sox, QuickTime
- **Windows**: ffmpeg with DirectShow
- **Linux**: ALSA (arecord), ffmpeg

**Features:**
- Device detection and selection
- Real-time recording with user controls
- Format validation and conversion

### Git Integration

**Operations:**
- Diff generation with smart filtering
- Commit history retrieval
- Branch and tag management
- Repository status checking

**Implementation:**
- Direct Git command execution via `child.ts`
- Error handling and validation
- Cross-platform path handling

## AI and Prompt Engineering

### Prompt System

KodrDriv uses [RiotPrompt](https://github.com/riotprompt/riotprompt) for structured prompt engineering:

```typescript
// src/prompt/prompts.ts
const createCommitPrompt = async ({ diffContent }, { logContext, userDirection, context }) => {
    let builder = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory });
    builder = await builder.addPersonaPath(DEFAULT_PERSONA_COMMITTER_FILE);
    builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_COMMIT_FILE);
    builder = await builder.addContent(diffContent, { title: 'Diff', weight: 0.5 });
    // ... additional context
    return await builder.build();
};
```

### Prompt Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Personas** | AI role definition | `src/prompt/personas/` |
| **Instructions** | Task-specific prompts | `src/prompt/instructions/` |
| **Context** | Dynamic content | Generated at runtime |

### Customization

Users can override default prompts by placing files in `.kodrdriv/personas/` and `.kodrdriv/instructions/`.

## Data Flow

### Typical Command Execution Flow

1. **Argument Parsing** - CLI arguments processed with Commander.js
2. **Configuration Resolution** - CardiganTime merges config sources
3. **Validation** - Zod schemas validate configuration
4. **Command Execution** - Appropriate command module called
5. **External API Calls** - Git, OpenAI, GitHub operations
6. **Result Processing** - Format and save outputs
7. **User Feedback** - Display results and next steps

### Configuration Flow

```
CLI Args → File Configs → Defaults → Merged Config → Command Execution
     ↓
Type Validation (Zod) → Error Handling → Validated Config
```

### Data Persistence

- **Output Files**: Timestamped files in `output/kodrdriv/`
- **Configuration**: Project and user config directories
- **Preferences**: Audio device settings in user config
- **Debug Files**: Request/response logs when debug mode enabled

## Customization and Extension

### Adding a New Command

1. **Create Command Module** in `src/commands/`
```typescript
// src/commands/my-command.ts
export const execute = async (runConfig: Config): Promise<string> => {
    // Implementation
};
```

2. **Add Configuration Schema** in `src/types.ts`
```typescript
myCommand: z.object({
    option1: z.string().optional(),
}).optional(),
```

3. **Register Command** in `src/main.ts` and `src/constants.ts`

4. **Add CLI Interface** in `src/arguments.ts`

### Extending Configuration

1. **Update Schema** in `src/types.ts`
2. **Add Defaults** in `src/constants.ts`
3. **Update Argument Parser** in `src/arguments.ts`

### Custom Prompts

1. **Create Files** in `.kodrdriv/personas/` or `.kodrdriv/instructions/`
2. **Use Standard Format** (Markdown files with specific structure)
3. **Enable Overrides** with `--overrides` flag

### Adding External Integrations

1. **Create Utility Module** in `src/util/`
2. **Add Configuration Options** to schema
3. **Handle Authentication** via environment variables
4. **Implement Error Handling** with custom error types

## Development Guidelines

### Code Organization

- **Single Responsibility**: Each module has a clear, focused purpose
- **Dependency Management**: Utilities don't depend on commands
- **Error Propagation**: Errors bubble up with context
- **Type Safety**: Comprehensive TypeScript coverage

### Testing Strategy

- **Unit Tests**: Individual utility functions
- **Integration Tests**: Command execution flows
- **Configuration Tests**: Schema validation and merging
- **Mock External APIs**: Reliable test execution

### Performance Considerations

- **Lazy Loading**: Only load required modules
- **Caching**: Expensive operations cached when appropriate
- **Streaming**: Large data processed in streams
- **Timeouts**: Reasonable timeouts on external calls

### Security Practices

- **Secret Management**: Environment variables for sensitive data
- **Input Validation**: All user inputs validated
- **Sanitization**: File paths and shell commands sanitized
- **Principle of Least Privilege**: Minimal required permissions

## Conclusion

KodrDriv's architecture emphasizes modularity, type safety, and user experience. The hierarchical configuration system provides flexibility while maintaining simplicity. The command pattern allows for easy extension, and the shared utility approach ensures consistency across features.

For development teams looking to customize or extend KodrDriv, the key areas to focus on are:

1. **Command modules** for new functionality
2. **Utility modules** for external integrations
3. **Configuration schema** for new options
4. **Prompt engineering** for AI behavior customization

The architecture supports both simple usage patterns and complex enterprise workflows, making it suitable for individual developers and large development teams alike. 