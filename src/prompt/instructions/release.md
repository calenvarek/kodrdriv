Task #1: Write release notes by reading all of the log messages from this release and writing a summary of the release.

Task #2: Provide a detailed list of changes involved in this release, and make sure that the release notes are directly related to the content in the log messages.

Task #3: Use the content in the <context> section to help you write the release notes and to help make connections with people, projects, issues, features, and other information.

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

### Output Restrictions

- Do not mention and people or contributors in the release notes.  For example, do not say, "Thanks to John Doe for this feature."  Release notes are to be impersonal and not focused on indiviudals.

- Do not use marketing language about how "significant" a release is, or how the release is going to "streamline process" for "Improved usability."   If there is a log message that says that, then include a note like this, but be careful not to use release notes as a marketing tool.

- If the release is very simple, keep the release notes short and simple.   And, if the release is very compliex, then feel free to add more sections to capture significant areas of change.

## 🎯 Purpose

Create release notes that:

* Help developers, contributors, or users **understand what changed**
* Reflect the **actual purpose** and **impact** of the release
* Are **not promotional**, **not exaggerated**, and **not overly positive**


## 🧭 Instructions

1. **Use the "User Context" section at the top** of the input as your guide to the **focus and framing** of this release. This context may include:

   * The theme or reason behind the release (e.g., "we're cleaning up configuration files", "this is about improving test stability")
   * Key goals or constraints
   * Target audiences or known issues being addressed

   ⚠️ The User Context should shape the **opening paragraph** and influence which changes are emphasized.

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

   Include only the sections that are relevant.

3. **Use clear, factual bullet points** under each section. Briefly describe what changed and why it's relevant — **but do not use marketing language**. Avoid vague or exaggerated terms like:

   * "awesome new feature"
   * "significant boost"
   * "exciting changes"
   * "revolutionary update"

4. **Keep your tone technical, neutral, and useful.** It's okay to include references to:

   * Affected files or systems
   * Internal components (if relevant to the audience)
   * Specific pull requests or issues (if helpful)
   * Contributors (optionally, in parentheses or footnotes)

---

## 📝 Output Format Example

```json
{
  "title": "New Generation Types, and Updates to API",
  "body": "This release focuses on simplifying the configuration system and removing deprecated environment-specific files. Based on internal feedback, the team prioritized changes that reduce friction for new developers and standardize build behavior across local and CI environments.\\n\\n**Improvements**\\n\\n* Unified `vite.config.ts` and `webpack.config.js` into a single environment-aware module\\n* Reduced config nesting depth in `tsconfig.json` to improve readability\\n* Updated CI scripts to use `.env.defaults` instead of `.env.local`\\n\\n**Bug Fixes**\\n\\n* Fixed crash in config loader when optional fields were undefined\\n* Resolved issue with `yarn build` failing on Windows due to missing path escape\\n\\n**Documentation Updates**\\n\\n* Rewrote setup instructions in `README.md` to reflect unified config process\\n* Removed legacy instructions for `env.local.js`"
}
```