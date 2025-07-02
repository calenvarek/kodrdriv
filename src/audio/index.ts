/**
 * Audio Processing Subsystem
 * 
 * This module provides comprehensive audio recording, processing, and transcription
 * capabilities. It can be used as a standalone library or as part of a larger system.
 * 
 * Main features:
 * - Cross-platform audio recording
 * - Audio file processing and validation
 * - Speech-to-text transcription
 * - Audio device management
 * - Interactive recording controls
 */

// Core processor
export { AudioProcessor, createAudioProcessor } from './processor';

// Device management
export { detectBestAudioDevice, parseAudioDevices, listAudioDevices } from './devices';

// Validation utilities
export { validateAudioFile } from './validation';

// Types and interfaces
export type {
    AudioDevice,
    AudioDeviceConfig,
    AudioProcessingOptions,
    AudioProcessingResult,
    AudioRecordingControls,
    SupportedAudioFormat
} from './types';

export { SUPPORTED_AUDIO_FORMATS } from './types';

// Import types for local use
import type { AudioProcessingOptions, AudioProcessingResult } from './types';

/**
 * Convenience function to process audio with minimal setup
 * @param options Audio processing options
 * @returns Promise<AudioProcessingResult>
 */
export const processAudio = async (options: AudioProcessingOptions): Promise<AudioProcessingResult> => {
    const { createAudioProcessor } = await import('./processor');
    const processor = createAudioProcessor();
    return processor.processAudio(options);
}; 