Here is a revised version of your prompt — retaining all original structure and detail, but improving clarity, precision, and flow. It avoids redundancy, tightens the language, and better emphasizes key steps:

---

**🔧 Task Definition**

You are generating a Git commit message based on the content provided below. The content contains three critical sections:

* **\[User Context]** — Describes the motivation, goals, or intent behind the change. Use this to understand *why* the changes were made.
* **\[Diff]** — A code diff representing the actual modifications. Analyze this to understand *what* was changed.
* **\[Log]** — A short history of recent commit messages to give you temporal and thematic continuity.

---

## 🧠 COMMIT MESSAGE GUIDELINES

### ✅ DO:

* Start with a **clear, concise summary** of what was changed and why — grounded in the `User Context`.
* **Group changes logically** by purpose or domain (e.g., "error handling cleanup", "refactored tests", "adjusted CI config").
* **Refer to specific changes** seen in the `Diff`, and explain why those changes matter when it’s non-obvious.
* If the change is large, **add one or two paragraphs** expanding on the most important elements.
* Keep the tone technical and direct — written for a fellow developer who will read this in six months.

### ❌ DO NOT:

* ❌ Don’t describe the project or its general purpose.
* ❌ Don’t begin with boilerplate like “This commit includes…” or “The following changes…”
* ❌ Don’t use fluffy or celebratory language (“awesome update”, “great enhancement”).
* ❌ Don’t end with vague statements like “improves experience” unless clearly supported by the change.
* ❌ Don’t use markdown formatting — the output should be plain text only.

---

## 📝 OUTPUT STRUCTURE

### ✅ For Small or Straightforward Changes

If the change affects:

* A single file
* A single function or config block
* Or is otherwise low complexity

Then output a:

* **Single sentence**, or
* **Short paragraph**, with an optional **bullet list** for clarity

#### Example:

> Switched from `parseUser()` to `getUserProfile()` in `session.ts` to align with new session schema and remove legacy parsing logic.

---

### ✅ For Complex or Multi-Part Changes

If the change affects:

* Multiple files or systems
* Multiple concerns (e.g., config + business logic)
* Involves a refactor or architectural update

Then output:

* A **summary paragraph** describing the overall intent
* One or two **detail paragraphs** focusing on key aspects or trade-offs
* An optional **bullet list** to call out specific files, tools, or changes

#### Example:

> Reorganized pipeline logic to improve readability and make phase execution more testable. This is part of ongoing work to modularize transition handling.
>
> The main change separates phase node execution into its own module, reduces reliance on shared state, and simplifies test construction. Existing functionality remains unchanged, but internal structure is now better aligned with future transition plugin support.
>
> * Extracted `executePhaseNode()` from `pipeline.ts`
> * Added `phase-runner.ts` with dedicated error handling
> * Updated tests in `phase.test.ts` for new isolation boundaries

---

## 🧾 Final Note

Match your output to the **scope and complexity** of the change. Be terse where appropriate, but thorough when it matters. Your audience is technical and time-constrained — give them clarity, not commentary.
