import path from 'path';
import * as Storage from './storage';
import { getLogger } from '../logging';
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';

// Utility function for deep merging two objects.
export function deepMerge(target: any, source: any): any {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (key === "__proto__" || key === "constructor") {
                continue; // Skip prototype-polluting keys
            }
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) {
                    target[key] = {};
                }
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    return target;
}

//Recursive implementation of jSON.stringify;
export const stringifyJSON = function (obj: any, options: { depth: number } = { depth: 0 }): string {

    if (options.depth > 10) {
        return '{"error": "Maximum depth reached"}';
    }

    const arrOfKeyVals: string[] = [];
    const arrVals: string[] = [];
    let objKeys: string[] = [];

    /*********CHECK FOR PRIMITIVE TYPES**********/
    if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null)
        return '' + obj;
    else if (typeof obj === 'string')
        return '"' + obj + '"';

    /*********CHECK FOR ARRAY**********/
    else if (Array.isArray(obj)) {
        //check for empty array
        if (obj[0] === undefined)
            return '[]';
        else {
            obj.forEach(function (el) {
                arrVals.push(stringifyJSON(el, { depth: options.depth + 1 }));
            });
            return '[' + arrVals + ']';
        }
    }
    /*********CHECK FOR OBJECT**********/
    else if (obj instanceof Object) {
        //get object keys
        objKeys = Object.keys(obj);
        //set key output;
        objKeys.forEach(function (key) {
            const keyOut = '"' + key + '":';
            const keyValOut = obj[key];
            //skip functions and undefined properties
            if (keyValOut instanceof Function || keyValOut === undefined)
                arrOfKeyVals.push('');
            else if (typeof keyValOut === 'string')
                arrOfKeyVals.push(keyOut + '"' + keyValOut + '"');
            else if (typeof keyValOut === 'boolean' || typeof keyValOut === 'number' || keyValOut === null)
                arrOfKeyVals.push(keyOut + keyValOut);
            //check for nested objects, call recursively until no more objects
            else if (keyValOut instanceof Object) {
                arrOfKeyVals.push(keyOut + stringifyJSON(keyValOut, { depth: options.depth + 1 }));
            }
        });
        return '{' + arrOfKeyVals + '}';
    }
    return '';
};

export const incrementPatchVersion = (version: string): string => {
    const parts = version.split('.');
    if (parts.length !== 3) {
        throw new Error(`Invalid version string: ${version}`);
    }
    const patch = parseInt(parts[2], 10);
    if (isNaN(patch)) {
        throw new Error(`Invalid patch version: ${parts[2]}`);
    }
    parts[2] = (patch + 1).toString();
    return parts.join('.');
};

export const getOutputPath = (outputDirectory: string, filename: string): string => {
    return path.join(outputDirectory, filename);
};

export const getTimestampedFilename = (baseName: string, extension: string = '.json'): string => {
    const now = new Date();

    // Format as YYMMdd-HHmm (e.g., 250701-1030)
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');

    const timestamp = `${yy}${mm}${dd}-${hh}${min}`;

    return `${timestamp}-${baseName}${extension}`;
};

export const getTimestampedRequestFilename = (baseName: string): string => {
    return getTimestampedFilename(baseName, '.request.json');
};

export const getTimestampedResponseFilename = (baseName: string): string => {
    return getTimestampedFilename(baseName, '.response.json');
};

export const getTimestampedCommitFilename = (): string => {
    return getTimestampedFilename('commit-message', '.md');
};

export const getTimestampedReleaseNotesFilename = (): string => {
    return getTimestampedFilename('release-notes', '.md');
};

export const getTimestampedAudioFilename = (): string => {
    return getTimestampedFilename('audio-recording', '.wav');
};

export const getTimestampedTranscriptFilename = (): string => {
    return getTimestampedFilename('audio-transcript', '.md');
};

export const getTimestampedReviewFilename = (): string => {
    return getTimestampedFilename('review-analysis', '.md');
};

export const getTimestampedReviewNotesFilename = (): string => {
    return getTimestampedFilename('review-notes', '.md');
};

export const getTimestampedArchivedAudioFilename = (originalExtension: string = '.wav'): string => {
    return getTimestampedFilename('review-audio', originalExtension);
};

export const getTimestampedArchivedTranscriptFilename = (): string => {
    return getTimestampedFilename('review-transcript', '.md');
};

/**
 * Archives an audio file and its transcription to the output/kodrdriv directory
 * @param originalAudioPath - Path to the original audio file
 * @param transcriptionText - The raw transcription text
 * @param outputDirectory - Base output directory (default: 'output')
 * @returns Object containing the paths where files were archived
 */
export const archiveAudio = async (
    originalAudioPath: string,
    transcriptionText: string,
    outputDirectory: string = 'output'
): Promise<{ audioPath: string; transcriptPath: string }> => {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });

    try {
        // Ensure the output directory exists (should already be output/kodrdriv)
        await storage.ensureDirectory(outputDirectory);

        // Get file extension from original audio file
        const originalExtension = path.extname(originalAudioPath);

        // Generate timestamped filenames
        const archivedAudioFilename = getTimestampedArchivedAudioFilename(originalExtension);
        const archivedTranscriptFilename = getTimestampedArchivedTranscriptFilename();

        // Full paths for archived files - directly in the output directory
        const archivedAudioPath = path.join(outputDirectory, archivedAudioFilename);
        const archivedTranscriptPath = path.join(outputDirectory, archivedTranscriptFilename);

        // Copy audio file if it exists
        if (await storage.isFileReadable(originalAudioPath)) {
            // Read original audio file as buffer using fs directly for binary files
            const audioBuffer = await fs.promises.readFile(originalAudioPath);
            await storage.writeFile(archivedAudioPath, audioBuffer, 'binary');
            logger.debug('Archived audio file to: %s', archivedAudioPath);
        } else {
            logger.warn('Original audio file not found or not readable: %s', originalAudioPath);
        }

        // Save transcription text
        const transcriptContent = `# Audio Transcription Archive\n\n**Original Audio File:** ${originalAudioPath}\n**Archived:** ${new Date().toISOString()}\n\n## Transcription\n\n${transcriptionText}`;
        await storage.writeFile(archivedTranscriptPath, transcriptContent, 'utf8');
        logger.debug('Archived transcription to: %s', archivedTranscriptPath);

        logger.info('📁 Audio archived successfully - Audio: %s, Transcript: %s', archivedAudioFilename, archivedTranscriptFilename);

        return {
            audioPath: archivedAudioPath,
            transcriptPath: archivedTranscriptPath
        };

    } catch (error: any) {
        logger.error('Failed to archive audio: %s', error.message);
        throw new Error(`Audio archiving failed: ${error.message}`);
    }
};