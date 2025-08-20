# Audio Review Command

Record audio to provide context for project review and issue analysis:

```bash
kodrdriv audio-review
```

Similar to the review command, but allows you to speak your review notes which are transcribed and analyzed.

## Command Options

**Audio-Specific Options:**
- `--file <file>`: Process an existing audio file instead of recording (supports: wav, mp3, m4a, aac, flac, ogg, wma)
- `--directory <directory>`: Process all audio files in a directory (batch processing mode)
- `--max-recording-time <time>`: Maximum recording time in seconds
- `--context <context>`: Additional context for the review
- `--sendit`: Create GitHub issues automatically without confirmation

> [!NOTE]
> **Context Configuration Options**: The following options are available in configuration files only (not as CLI options):
> - `includeCommitHistory`: Include recent commit log messages in context (default: true)
> - `includeRecentDiffs`: Include recent commit diffs in context (default: true)
> - `includeReleaseNotes`: Include recent release notes in context (default: false)
> - `includeGithubIssues`: Include open GitHub issues in context (default: true)
> - `commitHistoryLimit`: Number of recent commits to include (default: 10)
> - `diffHistoryLimit`: Number of recent commit diffs to include (default: 5)
> - `releaseNotesLimit`: Number of recent release notes to include (default: 3)
> - `githubIssuesLimit`: Number of open GitHub issues to include, max 20 (default: 20)
>
> See the [Configuration Guide](../configuration.md) for details on setting these options in your config file.

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


```
