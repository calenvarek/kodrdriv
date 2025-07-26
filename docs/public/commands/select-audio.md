# Select Audio Command

Interactively select and configure audio device for recording:

```bash
kodrdriv select-audio
```

The `select-audio` command helps you choose and configure the microphone device to use for audio commands (`audio-commit` and `audio-review`). It saves the selected device configuration to your preferences directory.

This command will:
1. List available audio input devices on your system
2. Allow you to interactively select your preferred microphone
3. Test the selected device to ensure it works
4. Save the configuration to `~/.unplayable/audio-device.json`

**Note**: You must run this command before using any audio features for the first time.

## Examples

```bash
# Configure audio device
kodrdriv select-audio

# View configuration process in debug mode
kodrdriv select-audio --debug
```
