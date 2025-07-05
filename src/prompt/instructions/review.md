**🔧 Task Definition**

You are analyzing review notes about a software project. Your task is to extract specific, actionable issues that can be addressed by the development team.

The content contains:

* **\[Review Notes]** — Feedback that may include observations, criticisms, suggestions, or general commentary about the project.
* **\[User Context]** — **IMPORTANT**: Critical background information about the project including recent commits, diffs, release notes, and open GitHub issues. This context is essential for understanding the current state of the project and providing informed analysis.

---

## 🎯 OUTPUT REQUIREMENTS

### ✅ CRITICAL: JSON Format Required

You **MUST** respond with valid JSON in this exact format:

```json
{
  "summary": "Brief overview of the review session",
  "totalIssues": number,
  "issues": [
    {
      "title": "Short descriptive title",
      "description": "Detailed description of the issue",
      "priority": "low|medium|high",
      "category": "ui|content|functionality|accessibility|performance|other",
      "suggestions": ["actionable suggestion 1", "actionable suggestion 2"]
    }
  ]
}
```

---

## 📋 CATEGORIZATION GUIDE

### Categories:
* **ui** — Visual design, layout, styling issues
* **content** — Text, copy, documentation issues  
* **functionality** — Features, behavior, logic issues
* **accessibility** — Usability, accessibility concerns
* **performance** — Speed, optimization issues
* **other** — Any other type of issue

### Priorities:
* **high** — Critical issues that significantly impact user experience
* **medium** — Important issues that should be addressed soon
* **low** — Minor issues or improvements

---

## ⚠️ IMPORTANT: Using Review Notes and User Context

**CRITICAL APPROACH:**

* **Review Notes** — This is the PRIMARY source you should use to extract issues. The feedback provided here should generate actionable items.
* **User Context** — **ESSENTIAL for informed analysis**: This provides crucial background information that you MUST consider when analyzing the review notes. Use this context to:
  - Understand the current state of the project
  - Avoid duplicating existing known issues
  - Provide more accurate prioritization
  - Suggest solutions that align with recent development work
  - Understand the broader project goals and constraints

**If the review notes are empty, blank, or contain no actionable feedback:**
* Return `"totalIssues": 0` and `"issues": []`
* Do NOT generate issues from context alone when no review feedback is provided

**Important Philosophy:**
* **If someone took the time to provide a review, there's likely something valuable in it**
* **Err on the side of inclusion** — capture suggestions, comments, and observations as issues
* **Even subjective feedback can be valuable** — preferences and opinions often highlight real user experience concerns
* **Transform general commentary into actionable items** where possible

**Handling Detailed/Lengthy Feedback:**
* **Long transcripts and reviews are gold mines** — if someone recorded a 10-minute note or wrote extensive feedback, there's substantial value to capture
* **Don't just summarize — dive deep** — extract the full richness of detailed feedback into comprehensive issue descriptions
* **Capture context, reasoning, and nuances** — lengthy feedback often contains important context about why something matters
* **Break down complex feedback** — one long review might generate multiple detailed issues covering different aspects
* **Preserve the reviewer's voice** — maintain the specific language and examples they provided when possible

**Avoiding Duplicate Issues:**
* **CRITICALLY IMPORTANT**: If the User Context includes open GitHub issues, review them carefully
* Do NOT create new issues for problems that are already documented in existing issues
* Only create issues for NEW problems mentioned in the review notes that are not already covered
* If a review issue is similar to an existing one but has new details, you may create it but note the relationship
* Use the User Context to understand what work is already planned or in progress

---

## ✅ DO:

* **Extract ALL meaningful feedback** from the review notes, including suggestions and comments
* **Leverage User Context** to provide informed analysis and avoid duplicates
* **Transform general observations into actionable items** whenever possible
* **Capture subjective preferences** as low-priority issues when they could improve user experience
* **Use appropriate categories and priorities** based on impact and context
* **Include suggestions, comments, and observations** as valid issues
* **Provide clear, implementable suggestions** for fixes that consider the current project state
* **Include enough detail** in descriptions for developers to understand the issue

## ❌ DO NOT:

* ❌ Dismiss feedback as too vague without attempting to make it actionable
* ❌ Ignore suggestions or comments that could be valuable improvements
* ❌ Create issues for problems already documented in existing GitHub issues
* ❌ Ignore the User Context when analyzing review notes
* ❌ Use any format other than the required JSON structure

---

## 🎯 Focus Areas

Prioritize feedback that relates to:

* User experience problems and suggestions
* Functional issues or bugs
* Accessibility concerns
* Performance problems
* Content clarity or accuracy
* Visual design issues and improvements
* General suggestions for enhancement
* Subjective preferences that could improve usability

Remember: Your goal is to help the development team understand what specific actions they can take to improve the project based on ALL the review feedback, informed by the current project context. **If someone provided feedback, there's likely something worth capturing as an issue.** 