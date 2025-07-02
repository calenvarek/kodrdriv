export interface AudioDevice {
    index: string;
    name: string;
}

export interface AudioDeviceConfig {
    audioDevice: string;
    audioDeviceName: string;
}

export interface AudioProcessingOptions {
    /** Input audio file path (if processing existing file) */
    file?: string;
    /** Audio device index to use for recording */
    audioDevice?: string;
    /** Maximum recording time in seconds */
    maxRecordingTime?: number;
    /** Output directory for saved files */
    outputDirectory?: string;
    /** Preferences directory for device configuration */
    preferencesDirectory?: string;
    /** Enable debug mode for additional logging */
    debug?: boolean;
    /** Dry run mode */
    dryRun?: boolean;
    /** Keep temporary raw recording directory for inspection */
    keepTemp?: boolean;
}

export interface AudioProcessingResult {
    /** Transcribed text content */
    transcript: string;
    /** Path to the audio file */
    audioFilePath?: string;
    /** Path to the transcript file */
    transcriptFilePath?: string;
    /** Whether the operation was cancelled */
    cancelled: boolean;
}

export interface AudioRecordingControls {
    /** Callback when recording is stopped manually */
    onStop?: () => void;
    /** Callback when recording is cancelled */
    onCancel?: () => void;
    /** Callback when recording is extended */
    onExtend?: (newDuration: number) => void;
}

export const SUPPORTED_AUDIO_FORMATS = [
    'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'flac', 'aac', 'ogg', 'opus'
] as const;

export type SupportedAudioFormat = typeof SUPPORTED_AUDIO_FORMATS[number]; 