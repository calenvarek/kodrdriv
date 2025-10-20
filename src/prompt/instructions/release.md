## ⚠️ CRITICAL RULES - READ FIRST

1. **LOG MESSAGES ARE YOUR SOURCE OF TRUTH** - Every change you describe must come from actual commit messages in the `[Log Context]` section or issues in `[Resolved Issues from Milestone]`
2. **NO HALLUCINATIONS** - Do not invent features, fixes, or changes that aren't explicitly mentioned in the log messages or milestone issues
3. **CITE ACTUAL COMMITS** - When describing changes, refer to what's in the actual commit messages, not what you think should be there
4. **USE RELEASE FOCUS FOR FRAMING** - The `[Release Focus]` guides how you frame and emphasize changes, but doesn't add new changes not in the logs
5. **LENGTH FOLLOWS SCOPE** - Small releases get concise notes. Large releases deserve comprehensive documentation. Match the actual scope of changes in the log

---

## Your Task

Write release notes by reading all commit messages in `[Log Context]` and milestone issues in `[Resolved Issues from Milestone]`. Every change you mention must be traceable to an actual commit message or resolved issue.

### Output Format

Your response MUST be a valid JSON object with the following structure:
{
  "title": "A single-line, concise title for the release.",
  "body": "The detailed release notes in Markdown format."
}

**Instructions for the `title` field:**
- It must be a single line and should be concise and readable (aim for under 80 characters).
- It should capture the most significant, substantive changes in the release.
- Focus on what is noticeable to developers using the software.
- Use natural, conversational language that a human would write, not marketing-speak.
- AVOID mentioning trivial changes like "improving formatting," "updating dependencies," or "refactoring code."

**Instructions for the `body` field:**
- This should be the full release notes in Markdown format.
- Follow the detailed instructions below for structuring and writing the release notes.
- **For large releases**: Be comprehensive and detailed. Users deserve thorough documentation when there are many changes.

### Output Restrictions

- Do not mention and people or contributors in the release notes.  For example, do not say, "Thanks to John Doe for this feature."  Release notes are to be impersonal and not focused on indiviudals.

- Do not use marketing language about how "significant" a release is, or how the release is going to "streamline process" for "Improved usability." Write factual, technical descriptions of what has changed. If there is a log message that says that, then include a note like this, but be careful not to use release notes as a marketing tool.

- Do not use emoticons or emojis in headers or content. These make the output appear AI-generated rather than human-written.

- If the release is very simple, keep the release notes short and simple. However, if the release is very complex or large (especially when indicated by "Release Size Context"), then feel free to add many sections and provide extensive detail to capture all significant areas of change. Large releases deserve comprehensive documentation.

## Purpose

Create release notes that:

* Help developers, contributors, or users **understand what changed**
* Reflect the **actual purpose** and **impact** of the release
* Are **not promotional**, **not exaggerated**, and **not overly positive**
* Sound like they were written by a human developer, not AI-generated marketing copy
* **For large releases**: Provide comprehensive coverage of all significant changes rather than brief summaries


## Instructions

1. **Use the "Release Focus" section as your PRIMARY GUIDE** to the **focus and framing** of this release. This is the MOST IMPORTANT input for determining how to write the release notes. The Release Focus may include:

   * The theme or reason behind the release (e.g., "we're cleaning up configuration files", "this is about improving test stability")
   * Key goals or constraints
   * Target audiences or known issues being addressed
   * Strategic direction or priorities for this release

   **CRITICAL**: The Release Focus should shape the **opening paragraph**, determine which changes are emphasized most prominently, and guide the overall narrative of the release notes. If Release Focus is provided, it takes precedence over all other considerations in structuring your response.

1a. **If there is a "Resolved Issues from Milestone" section, prioritize this content highly**. These represent well-documented issues that were resolved in this release:

   * Include the resolved issues prominently in your release notes
   * Reference the issue numbers (e.g., "Fixed authentication bug (#123)")
   * **Pay close attention to the issue descriptions, comments, and discussions** to understand the motivation and context behind changes
   * Use the issue conversations to provide detailed context about why changes were made and what problems they solve
   * These issues often represent the most significant user-facing changes in the release
   * Organize related issues together in logical sections

2. **Structure the release notes as follows:**

   * **Opening paragraph** that gives a high-level summary of the release, grounded in the User Context
   * Followed by **grouped sections** of changes using headers like:

     * `New Features`
     * `Improvements`
     * `Bug Fixes`
     * `Refactoring`
     * `Documentation Updates`
     * `Breaking Changes`
     * `Deprecations`
     * `Performance Enhancements`
     * `Security Updates`
     * `Developer Experience`
     * `Testing Improvements`
     * `Configuration Changes`

   Include only the sections that are relevant. **For large releases**, don't hesitate to use multiple sections and subsections to organize the many changes clearly.

3. **Use clear, factual bullet points** under each section. Briefly describe what changed and why it's relevant — **write like a developer documenting changes, not like marketing copy**.

   **CRITICAL**: Every bullet point must be traceable to actual commit messages in `[Log Context]` or issues in `[Resolved Issues from Milestone]`. If a change isn't in the log, don't mention it.

   **For large releases**: Provide detailed bullet points that explain:
   - What specifically changed (cite actual commit messages)
   - Why the change was made (if evident from commit messages or issue descriptions)
   - Impact on users or developers (based on commit/issue context)
   - Related files or components affected (when mentioned in commits)

   **DO NOT**:
   * Invent features not mentioned in commits
   * Describe changes that "should" be there but aren't in the log
   * Use vague or exaggerated marketing terms like "awesome new feature", "significant boost", "revolutionary update", "streamlined workflow", "enhanced user experience"
   * Group unrelated commits under theme names that aren't in the actual commits

4. **Keep your tone technical, neutral, and useful.** It's okay to include references to:

   * Affected files or systems
   * Internal components (if relevant to the audience)
   * Specific pull requests or issues (if helpful)
   * Contributors (optionally, in parentheses or footnotes)

5. **For large releases specifically**:
   - Create more detailed subsections when there are many related changes
   - Group related changes together logically
   - Explain the broader context or theme when multiple commits work toward the same goal
   - Don't be afraid to write longer, more comprehensive release notes
   - Include technical details that help users understand the scope of changes

---

## Anti-Examples: What NOT to Do

### ❌ BAD: Hallucinated Changes

**Problem**: The release notes describe features that aren't in any commit message:

```json
{
  "title": "Major Performance Overhaul and API Redesign",
  "body": "**Performance Improvements**\\n\\n* Reduced API response times by 60% through query optimization\\n* Implemented connection pooling for database efficiency\\n* Added Redis caching layer for frequently accessed data\\n\\n**API Redesign**\\n\\n* Completely redesigned REST API with versioning support\\n* Migrated all endpoints to new authentication system"
}
```

**Why it's terrible**: None of these changes appear in the commit log. The LLM invented them based on what it thinks "should" be in a performance release. This is a critical failure even if the notes sound good.

---

### ❌ BAD: Vague Marketing Fluff

**Problem**: Generic marketing language instead of specific commit-based changes:

```json
{
  "title": "Enhanced User Experience and Streamlined Workflows",
  "body": "This exciting release brings revolutionary improvements to the user experience! We've streamlined workflows across the board and enhanced overall system performance. Users will notice significant improvements in every aspect of the application."
}
```

**Why it's terrible**: No specific changes, no commit references, pure marketing fluff. Completely useless to developers.

---

## Output Format Examples

### ✅ GOOD: Grounded in Actual Commits

**Scenario**: Log contains commits about removing post-publish sync, adding verbose logging, and fixing a config bug

```json
{
  "title": "Simplify publish flow and improve git tag debugging",
  "body": "**Workflow Changes**\\n\\n* Remove automatic branch sync and version bump from publish flow - users now manually run `kodrdriv development` to continue work after publish\\n* Simplify publish completion to show next steps instead of auto-syncing\\n\\n**Debugging Improvements**\\n\\n* Add extensive logging to git tag detection in `getDefaultFromRef()` to diagnose tag search issues\\n* Add emoji indicators and structured output for tag search process\\n\\n**Bug Fixes**\\n\\n* Fix config validation error when optional field was missing"
}
```

**Why it's good**: Every bullet point traces to an actual commit. Specific file references. No invented features.

---

### ✅ GOOD: Large Release with Detail

**Scenario**: 30 commits touching configuration system, tests, docs, and CLI

```json
{
  "title": "Configuration System Overhaul and Testing Migration",
  "body": "This release modernizes the configuration system and migrates the test suite based on accumulated technical debt and developer feedback.\\n\\n**Configuration System Changes**\\n\\n* Unify vite.config.ts and webpack.config.js into single environment-aware module\\n* Add support for .env.defaults with proper precedence handling\\n* Implement config validation with detailed error messages\\n* Reduce tsconfig.json nesting depth for readability\\n\\n**Testing Infrastructure**\\n\\n* Migrate test suite from Jest to Vitest for better ES module support\\n* Add integration tests for configuration system\\n* Implement coverage reporting with branch and function metrics\\n\\n**Bug Fixes**\\n\\n* Fix crash in config loader when optional fields undefined\\n* Resolve Windows build failure due to missing path escaping\\n* Fix race condition in parallel test execution\\n\\n**Breaking Changes**\\n\\n* Remove support for legacy .env.local.js files\\n* Change default output directory from dist/ to build/\\n* Require Node.js 18.0.0 or higher\\n\\n**Documentation**\\n\\n* Rewrite setup instructions in README.md for new config process\\n* Add migration guide for users upgrading from previous versions"
}
```

**Why it's good**: Comprehensive coverage of a large release, but every change is grounded in actual commits. No fluff, just facts.
