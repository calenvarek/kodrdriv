**🔧 Task Definition**

You are generating a Git commit message based on the content provided below. The content contains several critical sections:

* **\[User Direction]** — When present, this is the PRIMARY guidance for your commit message focus. This describes the motivation, goals, or intent behind the change from the user's perspective. This should be the starting point and main theme of your commit message.
* **\[User Context]** — When present, this provides IMPORTANT additional context about the user's situation, environment, or background that should inform your commit message understanding and approach.
* **\[Diff]** — A code diff representing the actual modifications. Analyze this to understand *what* was changed. **THIS IS THE CURRENT CHANGE YOU ARE DESCRIBING** — focus your commit message on explaining these specific modifications.
* **\[Log Context]** — A short history of recent commit messages. **IMPORTANT: This is provided ONLY for background context and temporal continuity. DO NOT use this to drive your commit message focus or content. DO NOT describe previous commits or reference past changes. Your commit message should describe ONLY the current diff/change.**

---

## 🧠 COMMIT MESSAGE GUIDELINES

### ✅ DO:

* **PRIORITIZE User Direction**: If `[User Direction]` is provided, make it the central theme and starting point of your commit message. Let it guide the narrative and focus.
* **CONSIDER User Context**: If `[User Context]` is provided, use it to inform your understanding and tailor your commit message appropriately to the user's situation.
* **FOCUS ON THE CURRENT CHANGE**: Your commit message should describe only what is happening in the current diff — not previous work or future plans.
* Start with a **clear, concise summary** of what was changed and why — grounded in the `User Direction` when present and informed by any `User Context`.
* **Group changes logically** by purpose or domain (e.g., "error handling cleanup", "refactored tests", "adjusted CI config").
* **Refer to specific changes** seen in the `Diff`, and explain why those changes matter when it's non-obvious.
* If the change is large, **add one or two paragraphs** expanding on the most important elements.
* Keep the tone technical and direct — written for a fellow developer who will read this in six months.

### ❌ DO NOT:

* ❌ Don't describe the project or its general purpose.
* ❌ Don't begin with boilerplate like "This commit includes..." or "The following changes..."
* ❌ Don't use fluffy or celebratory language ("awesome update", "great enhancement").
* ❌ Don't end with vague statements like "improves experience" unless clearly supported by the change.
* ❌ Don't use markdown formatting — the output should be plain text only.
* ❌ **Don't reference or describe previous commits from the log context** — focus only on the current change.
* ❌ **Don't let the log context influence your commit message content** — it's background information only.
* ❌ **Don't continue themes or patterns from previous commits** unless they're directly relevant to the current diff.

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
