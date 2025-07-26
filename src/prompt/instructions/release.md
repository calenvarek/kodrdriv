Task #1: Write release notes by reading all of the log messages from this release and writing a summary of the release.

Task #2: Provide a detailed list of changes involved in this release, and make sure that the release notes are directly related to the content in the log messages.

Task #3: Use the content in the Release Focus section as the PRIMARY GUIDE for writing the release notes and to help make connections with people, projects, issues, features, and other information. The Release Focus should heavily influence the tone, emphasis, and structure of your release notes.

**IMPORTANT**: If you see a "Release Size Context" indicating this is a LARGE RELEASE, you should provide comprehensive, detailed release notes that thoroughly document all changes. For large releases, be extensive rather than brief - users need to understand the full scope of changes. Don't just summarize - dive deep into the details, organize changes into meaningful groups, and explain the impact of major changes.

### Output Format

Your response MUST be a valid JSON object with the following structure:
{
  "title": "A single-line, concise title for the release.",
  "body": "The detailed release notes in Markdown format."
}

**Instructions for the `title` field:**
- It must be a single line.
- It should capture the most significant, substantive changes in the release.
- Focus on what is noticeable to developers using the software.
- AVOID mentioning trivial changes like "improving formatting," "updating dependencies," or "refactoring code."

**Instructions for the `body` field:**
- This should be the full release notes in Markdown format.
- Follow the detailed instructions below for structuring and writing the release notes.
- **For large releases**: Be comprehensive and detailed. Users deserve thorough documentation when there are many changes.

### Output Restrictions

- Do not mention and people or contributors in the release notes.  For example, do not say, "Thanks to John Doe for this feature."  Release notes are to be impersonal and not focused on indiviudals.

- Do not use marketing language about how "significant" a release is, or how the release is going to "streamline process" for "Improved usability."   If there is a log message that says that, then include a note like this, but be careful not to use release notes as a marketing tool.

- If the release is very simple, keep the release notes short and simple. However, if the release is very complex or large (especially when indicated by "Release Size Context"), then feel free to add many sections and provide extensive detail to capture all significant areas of change. Large releases deserve comprehensive documentation.

## 🎯 Purpose

Create release notes that:

* Help developers, contributors, or users **understand what changed**
* Reflect the **actual purpose** and **impact** of the release
* Are **not promotional**, **not exaggerated**, and **not overly positive**
* **For large releases**: Provide comprehensive coverage of all significant changes rather than brief summaries


## 🧭 Instructions

1. **Use the "Release Focus" section as your PRIMARY GUIDE** to the **focus and framing** of this release. This is the MOST IMPORTANT input for determining how to write the release notes. The Release Focus may include:

   * The theme or reason behind the release (e.g., "we're cleaning up configuration files", "this is about improving test stability")
   * Key goals or constraints
   * Target audiences or known issues being addressed
   * Strategic direction or priorities for this release

   🎯 **CRITICAL**: The Release Focus should shape the **opening paragraph**, determine which changes are emphasized most prominently, and guide the overall narrative of the release notes. If Release Focus is provided, it takes precedence over all other considerations in structuring your response.

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

3. **Use clear, factual bullet points** under each section. Briefly describe what changed and why it's relevant — **but do not use marketing language**.

   **For large releases**: Provide detailed bullet points that explain:
   - What specifically changed
   - Why the change was made (if evident from commit messages)
   - Impact on users or developers
   - Related files or components affected (when relevant)

   Avoid vague or exaggerated terms like:
   * "awesome new feature"
   * "significant boost"
   * "exciting changes"
   * "revolutionary update"

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

## 📝 Output Format Examples

### Example for a Large Release:

```json
{
  "title": "Major Configuration System Overhaul and Enhanced Developer Experience",
  "body": "This release represents a comprehensive overhaul of the configuration system, developer tooling, and testing infrastructure. Based on the Release Focus of modernizing the development workflow and addressing long-standing technical debt, this release includes significant architectural changes, new developer features, and extensive improvements to code quality and maintainability.\\n\\n**Configuration System Overhaul**\\n\\n* Completely redesigned configuration loading system with support for environment-specific overrides\\n* Unified `vite.config.ts`, `webpack.config.js`, and `rollup.config.js` into a single environment-aware configuration module\\n* Added support for `.env.defaults`, `.env.local`, and `.env.production` files with proper precedence handling\\n* Implemented configuration validation with detailed error messages for missing or invalid settings\\n* Migrated from legacy JSON-based config to TypeScript-based configuration with full type safety\\n\\n**New Features**\\n\\n* Added comprehensive CLI argument parsing with support for nested configuration options\\n* Implemented hot-reloading development server with automatic dependency injection\\n* Added support for custom build plugins with a new plugin API\\n* Created new debugging tools including request/response logging and performance profiling\\n* Added automated code formatting and linting with pre-commit hooks\\n\\n**Developer Experience Improvements**\\n\\n* Reduced config nesting depth in `tsconfig.json` to improve readability and maintainability\\n* Updated all development scripts to use the new unified configuration system\\n* Added comprehensive error handling with stack traces and helpful troubleshooting suggestions\\n* Implemented automatic workspace package linking and unlinking for monorepo development\\n* Created new developer documentation with step-by-step setup instructions\\n\\n**Testing Infrastructure**\\n\\n* Migrated entire test suite from Jest to Vitest for better ES module support\\n* Added comprehensive integration tests for the new configuration system\\n* Implemented end-to-end testing with Playwright for critical user workflows\\n* Added test coverage reporting with detailed branch and function coverage metrics\\n* Created performance benchmarks for build times and memory usage\\n\\n**Bug Fixes**\\n\\n* Fixed critical crash in config loader when optional fields were undefined or null\\n* Resolved issue with `yarn build` failing on Windows due to missing path escaping\\n* Fixed memory leak in development server during file watching operations\\n* Corrected TypeScript compilation errors in strict mode for legacy code\\n* Fixed race condition in parallel test execution causing intermittent failures\\n\\n**Breaking Changes**\\n\\n* Removed support for legacy `.env.local.js` files - migrate to `.env.local`\\n* Changed default output directory from `dist/` to `build/` for consistency\\n* Updated minimum Node.js version requirement to 18.0.0\\n* Deprecated `--legacy-config` flag - will be removed in next major version\\n\\n**Documentation Updates**\\n\\n* Completely rewrote setup instructions in `README.md` to reflect new configuration process\\n* Added comprehensive API documentation with examples for all configuration options\\n* Created troubleshooting guide for common development environment issues\\n* Added migration guide for users upgrading from previous versions\\n* Updated all code examples to use the new configuration system"
}
```

### Example for a Simple Release:

```json
{
  "title": "Configuration System Simplification and Developer Experience Improvements",
  "body": "This release focuses on simplifying the configuration system and removing deprecated environment-specific files. Based on the Release Focus of improving developer onboarding and standardizing build behavior, the team prioritized changes that reduce friction for new developers and standardize build behavior across local and CI environments.\\n\\n**Improvements**\\n\\n* Unified `vite.config.ts` and `webpack.config.js` into a single environment-aware module\\n* Reduced config nesting depth in `tsconfig.json` to improve readability\\n* Updated CI scripts to use `.env.defaults` instead of `.env.local`\\n\\n**Bug Fixes**\\n\\n* Fixed crash in config loader when optional fields were undefined\\n* Resolved issue with `yarn build` failing on Windows due to missing path escape\\n\\n**Documentation Updates**\\n\\n* Rewrote setup instructions in `README.md` to reflect unified config process\\n* Removed legacy instructions for `env.local.js`"
}
```
