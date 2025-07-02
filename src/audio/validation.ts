import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../logging';
import { SUPPORTED_AUDIO_FORMATS } from './types';

/**
 * Validates an audio file for processing
 * @param filePath Path to the audio file to validate
 * @throws Error if validation fails
 */
export const validateAudioFile = async (filePath: string): Promise<void> => {
    const logger = getLogger();

    try {
        // Check if file exists
        await fs.access(filePath);

        // Check file extension
        const ext = path.extname(filePath).toLowerCase().slice(1); // Remove the dot
        if (!SUPPORTED_AUDIO_FORMATS.includes(ext as any)) {
            throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${SUPPORTED_AUDIO_FORMATS.join(', ')}`);
        }

        // Check if file is not empty
        const stats = await fs.stat(filePath);
        if (stats.size === 0) {
            throw new Error('Audio file is empty');
        }

        logger.debug('Audio file validation passed: %s (%d bytes)', filePath, stats.size);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Audio file not found: ${filePath}`);
        }
        throw error;
    }
}; 