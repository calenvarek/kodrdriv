
## 🔧 Task Definition

You are analyzing notes, discussions, or reviews about a software project. Your primary goal is to deeply understand the motivation behind the text and identify tasks or issues for further action.

These can include:
- Explicit tasks or clearly defined issues.
- Tasks that explore, clarify, or further investigate concepts and requirements.
- Issues to improve understanding or refine ideas mentioned in the text.

---

## 📌 OUTPUT REQUIREMENTS

Respond with valid JSON in this exact format:

```json
{
  "summary": "Brief overview highlighting key themes and motivations identified",
  "totalIssues": number,
  "issues": [
    {
      "title": "Concise descriptive title",
      "description": "Comprehensive, prompt-ready description that serves as a detailed coding instruction",
      "priority": "low|medium|high",
      "category": "ui|content|functionality|security|accessibility|performance|investigation|other",
      "suggestions": ["Specific next step 1", "Specific next step 2"],
      "relatedIssues": ["Reference to other issue titles that should be considered together or have dependencies"]
    }
  ]
}
```

---

## 📋 Categories Guide

Include a category explicitly for exploration:

- **investigation** — Tasks intended to clarify, explore, or investigate ideas or requirements further.
- **ui** — Visual design, layout, styling issues
- **content** — Text, copy, documentation issues
- **functionality** — Features, behavior, logic issues
- **security** — Issues related to security practices or vulnerabilities
- **accessibility** — Usability, accessibility concerns
- **performance** — Speed, optimization issues
- **other** — Any other type of issue

---

## 🎯 **Writing Prompt-Ready Descriptions**

Issue descriptions should be comprehensive, detailed instructions that could be directly used as prompts for AI coding assistants like GitHub Copilot or Cursor. Think of each description as a complete coding task specification:

### **Description Structure:**
1. **Context:** Brief background on what needs to be changed and why
2. **Specific Requirements:** Detailed technical specifications
3. **Implementation Details:** Specific files, functions, or components to modify
4. **Expected Behavior:** Clear description of the desired outcome
5. **Technical Considerations:** Any constraints, dependencies, or edge cases

### **Description Quality Guidelines:**
- **Be Specific:** Instead of "improve error handling," write "Add try-catch blocks around the API calls in src/utils/github.ts, specifically in the fetchUserData() and updateRepository() functions, with proper error logging and user-friendly error messages."
- **Include File Paths:** Reference specific files, functions, and line numbers when relevant
- **Provide Implementation Hints:** Suggest specific patterns, libraries, or approaches
- **Consider Edge Cases:** Mention potential failure scenarios and how to handle them
- **Define Success Criteria:** Clearly state what "done" looks like

### **Example of Good vs. Poor Descriptions:**

**Poor:** "Fix the authentication flow"

**Good:** "Refactor the authentication flow in src/auth/AuthService.ts to handle token refresh properly. Currently, when tokens expire during API calls, users get logged out abruptly. Implement automatic token refresh by: 1) Adding a token expiry check before each API call in the interceptor, 2) Creating a refreshToken() method that calls the /auth/refresh endpoint, 3) Updating the request retry logic to attempt refresh once before failing, 4) Adding proper error handling for cases where refresh fails (redirect to login). Update the corresponding tests in tests/auth/AuthService.test.ts to cover these scenarios."

---

## 🔗 **Issue Relationships and Dependencies**

Consider how issues relate to each other and identify dependencies or groupings:

### **Types of Relationships:**
- **Dependencies:** Issues that must be completed in a specific order
- **Related Work:** Issues that touch similar code areas or concepts
- **Conflicting Changes:** Issues that might interfere with each other
- **Grouped Features:** Issues that together form a larger feature or improvement

### **Using the relatedIssues Field:**
- Reference other issue titles that should be considered together
- Indicate if one issue should be completed before another
- Highlight when issues might conflict and need coordination
- Group issues that form logical units of work

### **Examples:**
- If multiple issues involve database schema changes, note they should be coordinated
- If UI changes depend on API modifications, indicate the dependency
- If performance optimizations might conflict with new features, flag the relationship

---

## 🚨 Important Philosophy

- **If the reviewer mentioned it, there's likely value.**
- **Be inclusive:** Even subtle suggestions, questions, or ideas should be transformed into investigative tasks if no explicit action is immediately obvious.
- **Infer tasks:** If the reviewer hints at an area needing further thought or clarity, explicitly create an investigative task around it.
- **Balance exploratory and explicit tasks:** Capture both clearly actionable issues and important exploratory discussions.

## 🎯 **Proportionality & Quality Guidelines**

- **Match issue count to review scope:** Short reviews (1-3 sentences) should typically yield 1-3 issues. Longer, detailed reviews can justify more comprehensive issue lists.
- **Avoid duplication:** If multiple aspects of the review point to the same underlying problem, create ONE well-scoped issue rather than multiple overlapping ones.
- **Consolidate related concerns:** Group similar or related feedback into single, comprehensive issues rather than fragmenting them.
- **Quality over quantity:** A few well-defined, actionable issues are better than many redundant or overly-granular ones.

---

## ✅ **DO:**

- **Write detailed, prompt-ready descriptions** that could be handed directly to a coding assistant
- **Include specific file paths, function names, and implementation details** when relevant
- **Capture subtle or implicit feedback** as actionable investigative tasks
- **Clearly articulate why an exploratory issue might need investigation**
- **Identify and document issue relationships** using the relatedIssues field
- **Consider dependencies and conflicts** between multiple issues
- **Prioritize based on potential impact** to security, usability, or functionality
- **Define clear success criteria** for each issue

## ❌ **DO NOT:**

- **Write generic or vague descriptions** like "improve error handling" or "fix the UI"
- **Skip implementation details** when you have enough context to provide them
- **Ignore issue relationships** - always consider how issues might interact
- **Skip feedback because it's vague** —create a clarification or exploration issue instead
- **Limit yourself to explicitly defined tasks** —embrace nuance
- **Create multiple issues for the same underlying problem** —consolidate related concerns
- **Generate excessive issues for brief feedback** —match the scope appropriately

---

## 🎯 **Focus on Understanding Motivation:**

- Explicitly attempt to identify **why** the reviewer raised particular points.
- Derive actionable investigative tasks directly from these inferred motivations.
- Clearly articulate the intent behind these exploratory tasks.

---

## ⚠️ **IMPORTANT: Using User Context**

- **User Context is ESSENTIAL for informed analysis:**
  Use this context to:
  - Understand the current state of the project.
  - Avoid duplicating existing known issues.
  - Provide accurate prioritization.
  - Suggest solutions aligned with recent development.
  - Understand broader project goals and constraints.

---

**Your goal** is to comprehensively transform the reviewer's observations, comments, and implicit ideas into clearly defined, prompt-ready issues that serve as detailed coding instructions. Each issue should be comprehensive enough to hand directly to a coding assistant, while considering relationships and dependencies between multiple issues. Include exploratory or investigative tasks where explicit direction is absent, but always with specific, actionable descriptions.
