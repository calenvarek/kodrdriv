# Stop-Context Filtering

Stop-context filtering is a privacy and security feature that automatically removes sensitive or contextual information from AI-generated content before it's committed to your repository or sent to GitHub.

## Table of Contents

- [Overview](#overview)
- [Why Stop-Context?](#why-stop-context)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Filter Types](#filter-types)
- [Integration Points](#integration-points)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Overview

When working on multiple projects under different identities or organizations, it's critical to maintain separation between contexts. Stop-context filtering ensures that information from one project (usernames, project names, organization names, directory paths, etc.) never accidentally appears in commits, releases, or GitHub content of another project.

### Key Benefits

- **Multi-Identity Development**: Work on projects under different identities without cross-contamination
- **Anonymous Projects**: Maintain anonymity by automatically filtering personal identifiers
- **Organization Security**: Prevent internal references from appearing in public repositories
- **Automated Protection**: No manual review needed - filtering happens automatically

## Why Stop-Context?

### The Problem

Consider this scenario: You're working on an anonymous open-source project, but you also work on commercial projects. When using AI to generate commit messages, the AI might reference:

- Your real name or username from other projects
- Internal project names from your day job
- Organization names that should remain private
- Local directory paths that reveal sensitive information
- JIRA tickets or internal tracking references

Without stop-context filtering, this information could accidentally leak into your anonymous project's commit history.

### The Solution

Stop-context filtering acts as an automatic sanitization layer that:

1. Intercepts all AI-generated content before it's committed
2. Applies your configured filters (strings and regex patterns)
3. Replaces sensitive content with safe placeholders
4. Warns you when filtering occurs
5. Maintains the quality and readability of the generated text

## How It Works

### Filtering Pipeline

```
AI Generates Content
        ↓
Stop-Context Filtering
        ↓
User Review (if interactive)
        ↓
Commit/Push to GitHub
```

### Automatic Application

Filtering is automatically applied to:

- **Commit Messages** (`commit`, `audio-commit` commands)
- **Release Notes** (`release` command - title and body)
- **GitHub Issues** (`review` command - title and body)
- **Pull Requests** (`publish` command - title and description)

### When Filtering Occurs

Filtering happens **after** AI generation but **before** presenting content to you for review. This means:

- You always see the filtered version
- Nothing sensitive is ever committed
- You can review the filtered content before it's finalized

## Configuration

### Basic Configuration

Add stop-context configuration to your `.kodrdriv/config.yaml` file:

```yaml
stopContext:
  enabled: true                    # Enable filtering (default: true if filters exist)
  caseSensitive: false             # Case-insensitive matching by default
  replacement: "[REDACTED]"        # Text to replace filtered content
  warnOnFilter: true               # Log warnings when content is filtered

  # Simple string matches
  strings:
    - "sensitive-string"
    - "another-pattern"

  # Regular expression patterns
  patterns:
    - regex: "\\bpattern\\d+\\b"
      flags: "gi"
      description: "Optional description"
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` (if filters exist) | Enable/disable filtering globally |
| `caseSensitive` | boolean | `false` | Whether string matching is case-sensitive |
| `replacement` | string | `"[REDACTED]"` | Text to replace filtered content with |
| `warnOnFilter` | boolean | `true` | Log warnings when filters are applied |
| `strings` | string[] | `[]` | Array of literal strings to filter |
| `patterns` | object[] | `[]` | Array of regex pattern objects to filter |

### Pattern Configuration

Each pattern in the `patterns` array supports:

```yaml
patterns:
  - regex: "your-regex-pattern"      # Required: The regular expression
    flags: "gi"                      # Optional: Regex flags (g, i, m, etc.)
    description: "What this filters" # Optional: Human-readable description
```

**Common Regex Flags:**
- `g` - Global (match all occurrences)
- `i` - Case-insensitive
- `m` - Multiline mode
- `gi` - Global + case-insensitive (most common)

## Filter Types

### Literal String Filtering

Simple, exact string matching with optional case sensitivity:

```yaml
stopContext:
  strings:
    - "MyRealName"
    - "my-github-username"
    - "CompanyName"
    - "/Users/myname/projects"
```

**Characteristics:**
- Fast and efficient
- Case-insensitive by default (configurable)
- Matches anywhere in the text
- Special regex characters are automatically escaped

**Use When:**
- You know the exact strings to filter
- You want simple, straightforward filtering
- You're filtering names, usernames, or project names

### Regular Expression Pattern Filtering

Sophisticated pattern matching for complex cases:

```yaml
stopContext:
  patterns:
    - regex: "\\b[A-Za-z0-9._%+-]+@example\\.com\\b"
      flags: "gi"
      description: "Email addresses from example.com"

    - regex: "/Users/\\w+/projects/\\w+"
      flags: "g"
      description: "Local project paths"

    - regex: "\\b[A-Z]{2,}-\\d+\\b"
      flags: "g"
      description: "JIRA ticket references (e.g., PROJ-1234)"
```

**Characteristics:**
- Powerful and flexible
- Can match patterns, not just exact strings
- Supports standard JavaScript regex syntax
- Can capture variations and dynamic content

**Use When:**
- You need to match patterns (e.g., email addresses, ticket IDs)
- You want to filter variations of a string
- You need complex matching logic

## Integration Points

### Commit Messages

**Commands:** `commit`, `audio-commit`

Filtering is applied to the entire commit message after AI generation:

```bash
# Before filtering
feat: Add authentication from ProjectAlpha

Implemented OAuth2 flow based on work in CompanyBeta

# After filtering (with ProjectAlpha and CompanyBeta in strings)
feat: Add authentication from [REDACTED]

Implemented OAuth2 flow based on work in [REDACTED]
```

### Release Notes

**Command:** `release`

Filtering is applied separately to both the title and body:

```bash
# Before filtering
Title: Release v2.0.0 - Integration with ProjectX
Body: Added ProjectX integration and improved performance

# After filtering
Title: Release v2.0.0 - Integration with [REDACTED]
Body: Added [REDACTED] integration and improved performance
```

### GitHub Issues

**Command:** `review`

Filtering is applied to issue titles and bodies when creating issues from review analysis:

```bash
# Before filtering
Title: Bug in ProjectAlpha integration
Body: When integrating with ProjectAlpha API, errors occur

# After filtering
Title: Bug in [REDACTED] integration
Body: When integrating with [REDACTED] API, errors occur
```

### Pull Requests

**Command:** `publish`

Filtering is applied to PR titles and descriptions:

```bash
# Before filtering
Title: Merge changes from secret-project
Description: Automated release PR from secret-project

# After filtering
Title: Merge changes from [REDACTED]
Description: Automated release PR from [REDACTED]
```

## Examples

### Example 1: Multi-Project Developer

**Scenario:** You work on multiple projects and want to prevent cross-references.

```yaml
stopContext:
  enabled: true
  replacement: "[REDACTED]"

  strings:
    - "ProjectAlpha"
    - "CompanyBeta"
    - "my-other-github-org"
    - "internal-project-name"

  patterns:
    - regex: "@my-other-org/[\\w-]+"
      flags: "g"
      description: "NPM packages from other org"

    - regex: "\\bhttps?://internal\\.company\\.com[^\\s]*"
      flags: "gi"
      description: "Internal company URLs"
```

**Filters:**
- Project names: ProjectAlpha, CompanyBeta
- NPM packages from other organizations
- Internal company URLs

### Example 2: Anonymous Development

**Scenario:** You're contributing to open source anonymously and need to hide your identity.

```yaml
stopContext:
  enabled: true
  replacement: "[FILTERED]"
  caseSensitive: false

  strings:
    - "John Doe"
    - "johndoe"
    - "john.doe"
    - "MyCompany"
    - "my-personal-project"

  patterns:
    - regex: "/Users/johndoe/"
      flags: "g"
      description: "Personal directory paths"

    - regex: "\\bjohndoe@[\\w.-]+\\b"
      flags: "gi"
      description: "Personal email addresses"

    - regex: "github\\.com/johndoe"
      flags: "gi"
      description: "Personal GitHub profile"
```

**Filters:**
- Real name and variations
- Personal directory paths
- Email addresses
- GitHub profile references

### Example 3: Organization Security

**Scenario:** You're working on a public project but need to prevent internal references.

```yaml
stopContext:
  enabled: true
  replacement: "[INTERNAL]"

  strings:
    - "InternalProjectName"
    - "SecretFeature"
    - "internal-jira"

  patterns:
    - regex: "\\b[A-Z]{2,}-\\d+\\b"
      flags: "g"
      description: "JIRA ticket references (e.g., PROJ-1234)"

    - regex: "internal\\.company\\.com"
      flags: "gi"
      description: "Internal domain references"

    - regex: "\\b[\\w.]+@internal\\.company\\.com\\b"
      flags: "gi"
      description: "Internal email addresses"

    - regex: "@internal-org/[\\w-]+"
      flags: "g"
      description: "Internal NPM packages"
```

**Filters:**
- Internal project names
- JIRA ticket references
- Internal domain and email addresses
- Internal NPM packages

### Example 4: Directory Path Sanitization

**Scenario:** You want to filter out local directory paths that might reveal sensitive information.

```yaml
stopContext:
  enabled: true
  replacement: "[PATH]"

  patterns:
    - regex: "/Users/[\\w-]+/[^\\s]+"
      flags: "g"
      description: "macOS user directory paths"

    - regex: "C:\\\\Users\\\\[\\w-]+\\\\[^\\s]+"
      flags: "g"
      description: "Windows user directory paths"

    - regex: "/home/[\\w-]+/[^\\s]+"
      flags: "g"
      description: "Linux user directory paths"
```

**Filters:**
- macOS paths: `/Users/username/...`
- Windows paths: `C:\Users\username\...`
- Linux paths: `/home/username/...`

## Best Practices

### 1. Start Simple

Begin with literal string filtering for known sensitive terms:

```yaml
stopContext:
  strings:
    - "MyRealName"
    - "my-company"
    - "secret-project"
```

Add regex patterns only when you need pattern matching.

### 2. Test Your Filters

Use `--dry-run` mode to test filtering without committing:

```bash
kodrdriv commit --dry-run
```

This lets you see what would be filtered before making actual commits.

### 3. Review Warnings

Pay attention to filter warnings:

```
⚠️  STOP_CONTEXT_FILTERED: Sensitive content filtered from generated text
    Matches: 3 | Original Length: 245 | Filtered Length: 218
```

If you see high filter percentages (>50%), review your configuration:

```
⚠️  STOP_CONTEXT_HIGH_FILTER: High percentage of content filtered
    Percentage: 62.5% | Impact: Generated content may be incomplete
```

### 4. Use Descriptions

Add descriptions to regex patterns for easier maintenance:

```yaml
patterns:
  - regex: "\\b[A-Z]{2,}-\\d+\\b"
    flags: "g"
    description: "JIRA ticket references"  # Helps you remember what this filters
```

### 5. Be Specific

Use word boundaries (`\\b`) in regex to avoid over-filtering:

```yaml
# Good - matches whole words only
patterns:
  - regex: "\\bsecret\\b"
    flags: "gi"

# Bad - might match "secretary" or "secretion"
patterns:
  - regex: "secret"
    flags: "gi"
```

### 6. Regular Updates

Update your filter list as your projects evolve:

- Add new project names when you start new work
- Remove old filters when projects are no longer sensitive
- Review and refine patterns periodically

### 7. Use Verbose Mode for Debugging

Enable verbose logging to see detailed filter information:

```bash
kodrdriv commit --verbose
```

This shows:
- Number of string vs. pattern matches
- Character count changes
- Detailed filter statistics

### 8. Layer Your Filters

Combine literal strings and patterns for comprehensive coverage:

```yaml
stopContext:
  # Specific known values
  strings:
    - "ProjectAlpha"
    - "CompanyBeta"

  # Pattern-based filtering
  patterns:
    - regex: "project-\\w+-\\d+"
      flags: "gi"
      description: "Dynamic project identifiers"
```

## Troubleshooting

### Problem: Filters Not Being Applied

**Symptoms:**
- Sensitive content appears in commits
- No filter warnings in logs

**Solutions:**

1. **Check if filtering is enabled:**
   ```yaml
   stopContext:
     enabled: true  # Must be true
   ```

2. **Verify filters are configured:**
   ```yaml
   stopContext:
     strings: ["something"]  # At least one filter needed
   ```

3. **Check case sensitivity:**
   ```yaml
   stopContext:
     caseSensitive: false  # Try case-insensitive first
   ```

4. **Test with verbose mode:**
   ```bash
   kodrdriv commit --verbose
   ```

### Problem: Too Much Content Being Filtered

**Symptoms:**
- Warning: "High percentage of content filtered"
- Generated content is incomplete or nonsensical

**Solutions:**

1. **Review your patterns for over-matching:**
   ```yaml
   # Too broad - matches "secret", "secretary", "secretion"
   - regex: "secret"

   # Better - matches only whole word "secret"
   - regex: "\\bsecret\\b"
   ```

2. **Be more specific with strings:**
   ```yaml
   # Instead of:
   strings: ["test"]  # Might match "testing", "latest", "contest"

   # Use:
   patterns:
     - regex: "\\btest\\b"  # Matches only "test" as a whole word
   ```

3. **Check for duplicate or overlapping filters:**
   ```yaml
   # Redundant - both will match
   strings:
     - "ProjectAlpha"
   patterns:
     - regex: "ProjectAlpha"
   ```

### Problem: Regex Pattern Not Working

**Symptoms:**
- Pattern should match but doesn't
- Warning about invalid regex in logs

**Solutions:**

1. **Escape special characters properly:**
   ```yaml
   # Wrong - unescaped dots match any character
   - regex: "example.com"

   # Correct - escaped dots match literal dots
   - regex: "example\\.com"
   ```

2. **Use correct flags:**
   ```yaml
   # Case-sensitive (might miss "PROJECT-123")
   - regex: "\\b[A-Z]+-\\d+\\b"
     flags: "g"

   # Case-insensitive (matches "PROJECT-123" and "project-123")
   - regex: "\\b[A-Z]+-\\d+\\b"
     flags: "gi"
   ```

3. **Test regex patterns separately:**
   Use a regex tester (regex101.com) to verify your patterns before adding them to config.

### Problem: Performance Issues

**Symptoms:**
- Slow commit/release generation
- High CPU usage during filtering

**Solutions:**

1. **Optimize regex patterns:**
   ```yaml
   # Slow - backtracking issues
   - regex: ".*secret.*"

   # Faster - more specific
   - regex: "\\bsecret\\b"
   ```

2. **Reduce number of patterns:**
   - Combine similar patterns where possible
   - Remove unused filters

3. **Use literal strings instead of regex when possible:**
   ```yaml
   # Faster
   strings:
     - "ProjectAlpha"

   # Slower (but more flexible)
   patterns:
     - regex: "ProjectAlpha"
   ```

### Problem: Warnings Are Too Noisy

**Symptoms:**
- Too many filter warnings
- Logs are cluttered

**Solutions:**

1. **Disable warnings if you're confident in your filters:**
   ```yaml
   stopContext:
     warnOnFilter: false
   ```

2. **Or keep warnings but reduce verbosity:**
   ```bash
   # Don't use --verbose flag
   kodrdriv commit
   ```

## Security Considerations

### What Stop-Context Does

✅ **Protects:**
- Commit messages before they're committed
- Release notes before they're published
- GitHub issues before they're created
- Pull requests before they're opened

✅ **Filters:**
- Locally before any network transmission
- Before content is written to git history
- Before content is sent to GitHub API

### What Stop-Context Doesn't Do

❌ **Does NOT protect:**
- Code content (only AI-generated text)
- File names or directory structures
- Git configuration or metadata
- Content already in git history
- Manual commits (not generated by kodrdriv)

❌ **Is NOT:**
- A replacement for code review
- Perfect or foolproof
- A security audit tool
- Protection against all information leaks

### Important Limitations

1. **AI Context Window**: The AI may have seen sensitive information in its context (diffs, logs, etc.) even though it's filtered from the output. The AI doesn't "forget" what it saw.

2. **Pattern Matching Limits**: Regex and string matching can't understand semantic meaning. If the AI rephrases sensitive information, it might not be caught.

3. **Configuration Errors**: If your filters are misconfigured, sensitive information could slip through.

4. **Manual Overrides**: Users can bypass filtering by manually editing content or using `--skip-file-check`.

### Best Security Practices

1. **Defense in Depth**: Use stop-context as one layer of protection, not the only layer.

2. **Review Generated Content**: Always review AI-generated content before committing, even with filtering enabled.

3. **Limit AI Context**: Use `--exclude` to prevent sensitive files from being included in AI context:
   ```bash
   kodrdriv commit --exclude "secrets/" "*.env" "internal-docs/"
   ```

4. **Regular Audits**: Periodically review your git history to ensure no sensitive information has leaked.

5. **Test Filters**: Use `--dry-run` to test new filters before relying on them.

6. **Update Filters Proactively**: Add filters for new sensitive terms before they can leak.

### When to Use Stop-Context

**Good Use Cases:**
- Preventing accidental cross-project references
- Maintaining anonymous contributions
- Filtering known sensitive terms
- Organizational security policies

**Not Recommended For:**
- Sole protection for highly sensitive projects
- Replacing proper security review
- Filtering classified or regulated information
- Projects where any leak is catastrophic

### Responsible Use

Stop-context filtering is a convenience and safety feature, not a security guarantee. Use it responsibly:

- ✅ As part of a broader security strategy
- ✅ With regular review and testing
- ✅ For preventing accidental leaks
- ❌ As the only protection for sensitive projects
- ❌ Without understanding its limitations
- ❌ For projects with strict regulatory requirements

## Summary

Stop-context filtering provides automated protection against accidental information leaks in AI-generated content. When properly configured and used as part of a comprehensive security approach, it significantly reduces the risk of sensitive information appearing in your git history or GitHub content.

**Key Takeaways:**

1. Configure filters for your specific needs (strings and/or patterns)
2. Test filters with `--dry-run` before relying on them
3. Review warnings and adjust configuration as needed
4. Use as one layer of defense, not the only layer
5. Update filters regularly as your projects evolve

For more information, see:
- [Configuration Guide](configuration.md) - Full configuration reference
- [Examples](examples.md) - More usage examples
- [Commands](commands.md) - Command-specific documentation

