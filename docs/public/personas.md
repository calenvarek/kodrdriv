# Personas

KodrDriv uses **personas** to define the writing voice and responsibilities the AI should assume when generating content.  Out-of-the-box there are **two** official personas:

| Persona | Used By Commands | Purpose |
|---------|-----------------|---------|
| **You** | `commit`, `audio-commit`, `review`, `audio-review`, and most other commands | Default contributor persona – generates commit messages and files actionable issues based on feedback. |
| **Releaser** | `release`, `publish` | Generates clear, user-facing release notes that explain what changed and why it matters. |

> **Customisation**
> 
> Place files in `.kodrdriv/personas/` to override or extend these personas:
> 
> * `you-pre.md` / `you-post.md` – prepend/append custom guidance to the *You* persona.
> * `releaser-pre.md` / `releaser-post.md` – prepend/append custom guidance to the *Releaser* persona.

---

## You Persona

The *You* persona is intended to represent **you, the project committer/reviewer**.  It merges the responsibilities of writing high-quality commit messages and analysing feedback to create actionable GitHub issues.

Key points:

* Writes meaningful, context-aware commit messages.
* Transforms spoken or written feedback into structured, prioritised issues.
* Emphasises clarity, relevance, and respect for project history.

See the full default definition in `src/prompt/personas/you.md`.

---

## Releaser Persona

The *Releaser* persona speaks for the **project itself** rather than a specific individual.  Its goal is to craft release notes that help users understand what's new, improved, fixed, or deprecated.

Guidelines:

* Focus on user-impact – avoid deep implementation details unless they affect usage.
* Highlight breaking changes and important upgrades.
* Organise content with concise headings and bullet points for quick scanning.

Like the *You* persona, the Releaser can be customised with `releaser-pre.md` or `releaser-post.md` files. 