# Development Guide

Building, testing, and extending kodrdriv.

## Development Setup

### Prerequisites

- Node.js v18+
- npm v9+
- Git
- OpenAI API key
- (Optional) GitHub token

### Clone and Install

```bash
# Clone repository
git clone https://github.com/yourusername/kodrdriv.git
cd kodrdriv

# Install dependencies
npm install

# Build
npm run build

# Link for development
npm link
```

### Verify Setup

```bash
# Run tests
npm test

# Run linter
npm run lint

# Type check
npx tsc --noEmit

# Full precommit
npm run precommit
```

## Project Structure

```
kodrdriv/
├── src/
│   ├── main.ts              # Entry point
│   ├── application.ts       # App initialization
│   ├── arguments.ts         # CLI parsing
│   ├── types.ts             # TypeScript types
│   ├── constants.ts         # Defaults
│   ├── logging.ts           # Logger setup
│   │
│   ├── commands/            # Command implementations
│   │   ├── commit.ts
│   │   ├── release.ts
│   │   ├── publish.ts
│   │   ├── tree.ts
│   │   └── ...
│   │
│   ├── util/                # Utilities
│   │   ├── aiAdapter.ts     # AI service adapter
│   │   ├── storageAdapter.ts
│   │   ├── loggerAdapter.ts
│   │   ├── interactive.ts
│   │   └── ...
│   │
│   ├── content/             # Content generation
│   │   ├── diff.ts
│   │   ├── log.ts
│   │   └── files.ts
│   │
│   └── utils/               # Business logic
│       ├── branchState.ts
│       ├── publishState.ts
│       └── cleanup.ts
│
├── tests/                   # Test suite
│   ├── commands/
│   ├── util/
│   └── integration/
│
├── docs/                    # Documentation
├── guide/                   # AI-friendly guides
└── output/                  # Generated files
```

## Building

### Build Commands

```bash
# Full build
npm run build

# Watch mode
npm run build --watch

# Type check only
npx tsc --noEmit

# Lint only
npm run lint
```

### Build Output

```
dist/
├── main.js                  # CLI entry point
├── commands/                # Compiled commands
├── util/                    # Compiled utilities
└── ... (all source compiled)
```

## Testing

### Test Commands

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific file
npm test tests/commands/commit.test.ts

# With pattern
npm test -- commit
```

### Test Structure

```
tests/
├── commands/                # Command tests
│   ├── commit.test.ts
│   ├── release.test.ts
│   ├── release-agentic.test.ts
│   └── ...
├── util/                    # Utility tests
└── integration/             # Integration tests
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyCommand', () => {
  it('should generate output', async () => {
    const result = await execute(mockConfig);
    expect(result).toContain('expected');
  });
});
```

### Mocking External Dependencies

```typescript
// Mock git-tools
vi.mock('@eldrforge/git-tools', () => ({
  run: vi.fn(),
  validateString: vi.fn(v => v)
}));

// Mock ai-service
vi.mock('@eldrforge/ai-service', () => ({
  runAgenticCommit: vi.fn().mockResolvedValue({
    commitMessage: 'test message',
    iterations: 5
  })
}));
```

## Adding Features

### Adding a New Command

1. **Create command module**:
```typescript
// src/commands/my-command.ts
import { Config } from '../types';
import { getLogger } from '../logging';

export const execute = async (runConfig: Config): Promise<string> => {
  const logger = getLogger();
  const isDryRun = runConfig.dryRun || false;

  // Implementation

  return 'Result';
};
```

2. **Add types**:
```typescript
// src/types.ts
export type MyCommandConfig = {
  option1?: string;
  option2?: boolean;
};

// Add to ConfigSchema
myCommand: z.object({
  option1: z.string().optional(),
  option2: z.boolean().optional(),
}).optional(),
```

3. **Add defaults**:
```typescript
// src/constants.ts
myCommand: {
  option1: 'default',
  option2: false,
},
```

4. **Add CLI interface**:
```typescript
// src/arguments.ts
const myCommand = program
  .command('my-command')
  .option('--option1 <value>', 'description')
  .option('--option2', 'description')
  .description('My command description');
```

5. **Register command**:
```typescript
// src/main.ts
import * as MyCommand from './commands/my-command';

if (commandName === 'my-command') {
  summary = await MyCommand.execute(runConfig);
}
```

6. **Write tests**:
```typescript
// tests/commands/my-command.test.ts
describe('MyCommand', () => {
  it('should work', async () => {
    const result = await execute(mockConfig);
    expect(result).toBeDefined();
  });
});
```

### Adding AI Tools

1. **Define tool in ai-service**:
```typescript
// ai-service/src/tools/my-tools.ts
export function createMyTools(): Tool[] {
  return [{
    name: 'my_tool',
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string' }
      },
      required: ['param1']
    },
    execute: async (params, context) => {
      // Implementation
      return { result: 'data' };
    }
  }];
}
```

2. **Register tool**:
```typescript
// In commit.ts or release.ts
const tools = createMyTools();
toolRegistry.registerAll(tools);
```

3. **Update prompts**:
```typescript
// Reference new tool in system prompt
const toolGuidance = generateToolGuidance(tools, ...);
```

## Debugging Development Issues

### Build Failures

```bash
# Clean build
rm -rf dist
npm run build

# Check for TypeScript errors
npx tsc --noEmit

# Check for circular dependencies
npx madge --circular src
```

### Test Failures

```bash
# Run specific test
npm test -- my-test.test.ts

# Run with full output
npm test -- --reporter=verbose

# Update snapshots
npm test -- -u
```

### Import/Module Issues

```bash
# Clear node_modules
rm -rf node_modules package-lock.json
npm install

# Rebuild packages
npm run build

# Re-link
npm link
```

## Code Style

### TypeScript

```typescript
// Use explicit types
export const execute = async (runConfig: Config): Promise<string> => {
  // ...
};

// Use type guards
if (typeof value === 'string') {
  // ...
}

// Avoid any when possible
const result: Result = await operation();
```

### Error Handling

```typescript
// Use custom error types
import { ValidationError, CommandError } from '@eldrforge/shared';

// Throw with context
throw new ValidationError('Invalid input', { field: 'username' });

// Catch and wrap
try {
  await externalOperation();
} catch (error: any) {
  throw new ExternalDependencyError('Operation failed', 'service-name', error);
}
```

### Logging

```typescript
// Use structured logging
logger.info('OPERATION_START: Starting operation | Param: %s | Mode: %s', param, mode);
logger.debug('Detailed information: %o', object);
logger.error('OPERATION_FAILED: Operation failed | Error: %s', error.message);

// Follow logging guide
// See: AI-FRIENDLY-LOGGING-GUIDE.md
```

## Package Development

### Working on ai-service

```bash
cd ai-service

# Install
npm install

# Build
npm run build

# Test
npm test

# Link locally
npm link

# Use in kodrdriv
cd ../kodrdriv
npm link @eldrforge/ai-service
```

### Working on tree-core

```bash
cd tree-core

# Install & build
npm install
npm run build

# Test
npm test

# Link
npm link

# Use in kodrdriv
cd ../kodrdriv
npm link @eldrforge/tree-core
```

### Testing Cross-Package Changes

```bash
# Link all packages
cd ai-service && npm link
cd ../tree-core && npm link
cd ../tree-execution && npm link
cd ../shared && npm link
cd ../git-tools && npm link
cd ../github-tools && npm link

# Link in kodrdriv
cd ../kodrdriv
npm link @eldrforge/ai-service
npm link @eldrforge/tree-core
npm link @eldrforge/tree-execution
npm link @eldrforge/shared
npm link @eldrforge/git-tools
npm link @eldrforge/github-tools

# Or use kodrdriv itself
kodrdriv tree link
```

## Continuous Integration

### Local Precommit

```bash
# Run before committing
npm run precommit

# This runs:
# 1. npm run lint
# 2. npm run build
# 3. npm run test
```

### CI Pipeline

GitHub Actions runs:
- Linting
- Type checking
- Tests with coverage
- Build verification

## Debugging Tools

### VS Code Configuration

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug kodrdriv",
      "program": "${workspaceFolder}/dist/main.js",
      "args": ["commit", "--dry-run"],
      "env": {
        "OPENAI_API_KEY": "your-key"
      }
    }
  ]
}
```

### Node Debugging

```bash
# Run with inspector
node --inspect dist/main.js commit --dry-run

# Debug tests
node --inspect node_modules/.bin/vitest run tests/commands/commit.test.ts
```

## Common Development Tasks

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update all
npm update

# Update specific
npm install @eldrforge/ai-service@latest

# Update across all packages
kodrdriv tree --cmd "npm update"
```

### Add New Configuration Option

1. Add to type: `src/types.ts`
2. Add to schema: Zod schema in `src/types.ts`
3. Add default: `src/constants.ts`
4. Add CLI option: `src/arguments.ts`
5. Add transformation: `transformCommandsToNestedStructure()`
6. Use in command: `src/commands/*.ts`

### Add New AI Tool

1. Define in `ai-service/src/tools/`
2. Register in tool set
3. Update prompts to reference
4. Add tests
5. Document in guide

## Publishing Packages

### Version Bumping

```bash
# In each package
npm version patch  # or minor, major

# Using kodrdriv
kodrdriv tree publish --target-version patch
```

### Publishing to npm

```bash
# Build and publish
npm run build
npm publish

# Or use kodrdriv
kodrdriv publish
```

## Best Practices

### Code Quality

- Write tests for new features
- Update documentation
- Follow existing patterns
- Use TypeScript strictly
- Handle errors properly

### Performance

- Avoid blocking operations
- Use streaming for large data
- Cache expensive operations
- Set reasonable timeouts

### Maintainability

- Keep functions small and focused
- Use descriptive names
- Add comments for complex logic
- Update types when changing interfaces

## Resources

### Implementation Guides

Root directory contains extensive docs:
- `AI-SERVICE-INTEGRATION-COMPLETE.md`
- `TREE-TOOLKIT-COMPLETE.md`
- `RIOTPROMPT-COMPLETE-SUMMARY.md`
- `SESSION-SUMMARY-DEC-31.md`

### Package Documentation

Each package has detailed README:
- `ai-service/README.md`
- `tree-core/README.md`
- `tree-execution/README.md`
- `shared/README.md`

### API Documentation

TypeScript provides inline documentation:
```bash
# Generate API docs
npx typedoc src/index.ts
```

## Next Steps

- **[Testing Guide](./testing.md)** - Test strategies
- **[Architecture Guide](./architecture.md)** - System design
- **[Debugging Guide](./debugging.md)** - Troubleshooting
- **[AI System Guide](./ai-system.md)** - AI internals

Start contributing to kodrdriv and make it even better!




