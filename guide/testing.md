# Testing Guide

Understanding and running kodrdriv tests.

## Test Suite Overview

### Coverage Statistics

- **kodrdriv**: ~60% coverage, 1,344 tests
- **ai-service**: ~66% coverage, 318 tests
- **tree-core**: ~94% coverage, 25 tests
- **tree-execution**: ~78% coverage, 177 tests
- **shared**: ~86% coverage
- **git-tools**: ~86% coverage, 284 tests
- **github-tools**: ~85% coverage, 393 tests

**Total**: ~2,500 tests across ecosystem

## Running Tests

### Basic Commands

```bash
# All tests
npm test

# Watch mode (recommended for development)
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test tests/commands/commit.test.ts

# Pattern matching
npm test -- commit
```

### Test Modes

```bash
# Run once
npm test

# Watch for changes
npm run test:watch

# UI mode (interactive)
npm run test:ui

# Verbose output
npm test -- --reporter=verbose
```

## Test Structure

### By Component

**Commands** (`tests/commands/`):
- `commit.test.ts` - Commit message generation
- `release.test.ts` - Release notes generation
- `release-agentic.test.ts` - Agentic analysis
- `publish.test.ts` - Publish workflows
- `tree.test.ts` - Tree operations
- `audio-*.test.ts` - Audio processing

**Utilities** (`tests/util/`):
- `general.test.ts` - General utilities
- `stopContext.test.ts` - Content filtering
- `validation.test.ts` - Validation functions

**Integration** (`tests/integration/`):
- End-to-end workflow tests

### By Type

**Unit Tests**:
- Individual function testing
- Mocked dependencies
- Fast execution (<1s per file)

**Integration Tests**:
- Multi-component workflows
- Real file system operations
- Moderate speed (1-5s per file)

**End-to-End Tests**:
- Complete command execution
- External API mocking
- Slower (5-10s per file)

## Writing Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execute } from '../src/commands/my-command';
import type { Config } from '../src/types';

describe('MyCommand', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle basic case', async () => {
    const config: Partial<Config> = {
      dryRun: true
    };

    const result = await execute(config);

    expect(result).toBeDefined();
  });

  it('should handle error case', async () => {
    // Test error handling
    await expect(execute(invalidConfig)).rejects.toThrow();
  });
});
```

### Mocking Strategies

**Mock External APIs**:
```typescript
// Mock OpenAI
vi.mock('@eldrforge/ai-service', () => ({
  runAgenticCommit: vi.fn().mockResolvedValue({
    commitMessage: 'mock message'
  })
}));

// Mock Git
vi.mock('@eldrforge/git-tools', () => ({
  run: vi.fn().mockResolvedValue({ stdout: 'output' })
}));

// Mock GitHub
vi.mock('@eldrforge/github-tools', () => ({
  createPullRequest: vi.fn().mockResolvedValue({
    number: 123,
    html_url: 'https://github.com/...'
  })
}));
```

**Mock File System**:
```typescript
vi.mock('@eldrforge/shared', () => ({
  createStorage: vi.fn().mockReturnValue({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    ensureDirectory: vi.fn()
  })
}));
```

### Test Assertions

```typescript
// Basic assertions
expect(result).toBe('expected');
expect(result).toEqual({ key: 'value' });
expect(result).toContain('substring');
expect(result).toMatch(/regex/);

// Mock call verification
expect(mockFunction).toHaveBeenCalled();
expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFunction).toHaveBeenCalledTimes(2);

// Complex objects
expect(result).toEqual(expect.objectContaining({
  key: 'value'
}));
```

## Test Coverage

### View Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open in browser
open coverage/index.html
```

### Coverage Goals

- **Utilities**: 80%+ coverage
- **Commands**: 60%+ coverage (harder to test)
- **Critical paths**: 90%+ coverage

### Improving Coverage

```typescript
// Test happy path
it('should work with valid input', async () => {
  const result = await function(validInput);
  expect(result).toBeDefined();
});

// Test error path
it('should handle invalid input', async () => {
  await expect(function(invalidInput)).rejects.toThrow();
});

// Test edge cases
it('should handle empty input', async () => {
  const result = await function('');
  expect(result).toBe('');
});
```

## Testing Commands

### commit Command Tests

Key scenarios:
- Generate commit message
- Handle interactive mode
- Process context files
- Detect file: dependencies
- Handle git errors
- Split commit suggestions

### release Command Tests

Key scenarios:
- Generate release notes
- Handle milestone integration
- Process context files
- Compare refs correctly
- Handle large releases
- Interactive refinement

### tree Command Tests

Key scenarios:
- Dependency graph building
- Sequential execution
- Parallel execution
- Recovery from failures
- Checkpoint management
- Package filtering

## Continuous Integration

### Local Precommit

```bash
npm run precommit
```

Runs:
1. `npm run lint` - ESLint
2. `npx tsc --noEmit` - Type check
3. `npm run build` - Build
4. `npm test` - Tests

### GitHub Actions

Automated on push:
- Lint checking
- Type checking
- Test execution
- Build verification
- Coverage reporting

## Test Development Workflow

### 1. Write Failing Test

```typescript
it('should support new feature', async () => {
  const result = await newFeature();
  expect(result).toBe('expected');
});
```

### 2. Run Test (Fails)

```bash
npm test -- new-feature
# Test fails ✗
```

### 3. Implement Feature

```typescript
export async function newFeature() {
  // Implementation
  return 'expected';
}
```

### 4. Run Test (Passes)

```bash
npm test -- new-feature
# Test passes ✓
```

### 5. Check Coverage

```bash
npm run test:coverage
# Verify new code is covered
```

## Debugging Tests

### Debug Single Test

```bash
# With node inspector
node --inspect node_modules/.bin/vitest run tests/my-test.test.ts

# With console.log
# Add console.log in test or code
npm test -- my-test.test.ts

# With debugger
# Add `debugger;` statement
node --inspect-brk node_modules/.bin/vitest run tests/my-test.test.ts
```

### Test-Specific Logging

```typescript
it('should work', async () => {
  // Enable logging in test
  const logger = {
    info: console.log,
    debug: console.log,
    error: console.error,
    warn: console.warn
  };

  const result = await execute({ logger });
});
```

## Test Best Practices

### 1. Test Behavior, Not Implementation

**Bad**:
```typescript
it('should call function', () => {
  expect(internalFunction).toHaveBeenCalled();
});
```

**Good**:
```typescript
it('should generate commit message', async () => {
  const result = await commit();
  expect(result).toContain('feat:');
});
```

### 2. Use Descriptive Names

**Bad**:
```typescript
it('test1', () => {});
```

**Good**:
```typescript
it('should generate conventional commit format for new features', () => {});
```

### 3. One Assertion Focus

**Bad**:
```typescript
it('should do everything', () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
  expect(c).toBe(3);
});
```

**Good**:
```typescript
it('should set value a', () => expect(a).toBe(1));
it('should set value b', () => expect(b).toBe(2));
it('should set value c', () => expect(c).toBe(3));
```

### 4. Clean Up After Tests

```typescript
afterEach(() => {
  vi.clearAllMocks();
  // Clean up files
  // Reset state
});
```

## Test Data

### Fixtures

Located in `tests/fixtures/`:
- Sample diffs
- Sample commit logs
- Mock API responses
- Test configurations

### Using Fixtures

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const sampleDiff = readFileSync(
  join(__dirname, 'fixtures', 'sample-diff.txt'),
  'utf8'
);
```

## Performance Testing

### Measure Test Performance

```bash
# Run with timing
npm test -- --reporter=verbose

# Find slow tests
npm test -- --reporter=verbose | grep -E "[0-9]+ms" | sort -n
```

### Optimize Slow Tests

- Mock expensive operations
- Use smaller fixtures
- Parallelize where possible
- Skip slow tests in watch mode

## Next Steps

- **[Development Guide](./development.md)** - Build and extend
- **[Debugging Guide](./debugging.md)** - Troubleshoot issues
- **[Architecture Guide](./architecture.md)** - Understand design
- **[Commands Reference](./commands.md)** - Test specific commands

Keep the tests green! 🟢

