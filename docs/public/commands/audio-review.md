# Audio Review Command

Record audio to provide context for project review and issue analysis:

```bash
kodrdriv audio-review
```

Similar to the review command, but allows you to speak your review notes which are transcribed and analyzed.

## Command Options

**Context Configuration (same as review command):**
- `--include-commit-history` / `--no-include-commit-history`: Include recent commit log messages in context (default: true)
- `--include-recent-diffs` / `--no-include-recent-diffs`: Include recent commit diffs in context (default: true)
- `--include-release-notes` / `--no-include-release-notes`: Include recent release notes in context (default: false)
- `--include-github-issues` / `--no-include-github-issues`: Include open GitHub issues in context (default: true)

**Context Limits (same as review command):**
- `--commit-history-limit <limit>`: Number of recent commits to include (default: 10)
- `--diff-history-limit <limit>`: Number of recent commit diffs to include (default: 5)
- `--release-notes-limit <limit>`: Number of recent release notes to include (default: 3)
- `--github-issues-limit <limit>`: Number of open GitHub issues to include, max 20 (default: 20)

**Audio-Specific Options:**
- `--file <file>`: Process an existing audio file instead of recording (supports: wav, mp3, m4a, aac, flac, ogg, wma)
- `--directory <directory>`: Process all audio files in a directory (batch processing mode)
- `--max-recording-time <time>`: Maximum recording time in seconds
- `--context <context>`: Additional context for the review
- `--sendit`: Create GitHub issues automatically without confirmation

## Examples

```bash
# Record audio for review analysis
kodrdriv audio-review

# Process existing audio file
kodrdriv audio-review --file ./review_notes.mp3

# Process all audio files in a directory
kodrdriv audio-review --directory ./audio_reviews

# Auto-create issues from audio review
kodrdriv audio-review --sendit

# Record with time limit (5 minutes)
kodrdriv audio-review --max-recording-time 300

# Audio review with minimal context
kodrdriv audio-review --no-include-recent-diffs

# Audio review with custom context limits
kodrdriv audio-review --commit-history-limit 3 --diff-history-limit 1
```
