# Audio Commit Command

Record audio to provide context for commit message generation using speech-to-text:

```bash
kodrdriv audio-commit
```

The audio commit command allows you to speak your commit intentions, which are then transcribed and used as direction for generating the commit message.

> [!TIP]
> ### Audio Device Setup
>
> Before using audio commands, run `kodrdriv select-audio` to configure your preferred microphone. This creates a configuration file in your preferences directory that will be used for all audio recording.

## Command Options

- `--add`: Add all changes to the index before committing
- `--cached`: Use cached diff for generating commit messages
- `--sendit`: Commit with the generated message without review
- `--direction <direction>`: Fallback text direction if audio fails

- `--file <file>`: Process an existing audio file instead of recording (supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, aac, ogg, opus)

## Examples

```bash
# Record audio for commit context
kodrdriv audio-commit

# Record audio and commit automatically
kodrdriv audio-commit --sendit

# Process existing audio file
kodrdriv audio-commit --file ./recording.wav

# Add all changes and use audio context
kodrdriv audio-commit --add
```
