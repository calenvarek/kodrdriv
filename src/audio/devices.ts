import { getLogger } from '../logging';
import { run } from '../util/child';
import { AudioDevice } from './types';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';

/**
 * Detects the best available audio device for recording
 * @returns Audio device index as string
 */
export const detectBestAudioDevice = async (): Promise<string> => {
    const logger = getLogger();

    try {
        // First, try to find a working device using the new detection
        const workingDevice = await findWorkingAudioDevice();
        if (workingDevice) {
            logger.debug(`✅ Best audio device detected: [${workingDevice.index}] with format ${workingDevice.format}`);
            return workingDevice.index;
        }

        // Fallback to preference-based detection if format testing fails
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            // ffmpeg returns error code but we get the device list in stderr
            const output = result.stderr || result.stdout || '';

            // Parse audio devices from output
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];
            if (!audioDevicesSection) return '1'; // Default fallback

            const deviceLines = audioDevicesSection.split('\n')
                .filter((line: string) => line.includes('[') && line.includes(']'))
                .map((line: string) => line.trim());

            // Prefer AirPods, then built-in microphone over virtual/external devices
            const preferredDevices = [
                'AirPods',
                'MacBook Pro Microphone',
                'MacBook Air Microphone',
                'Built-in Microphone',
                'Internal Microphone'
            ];

            for (const deviceLine of deviceLines) {
                for (const preferred of preferredDevices) {
                    if (deviceLine.toLowerCase().includes(preferred.toLowerCase())) {
                        // Extract device index
                        const match = deviceLine.match(/\[(\d+)\]/);
                        if (match) {
                            return match[1];
                        }
                    }
                }
            }
        }

        // If no preferred device found, use device 1 as default (usually better than 0)
        return '1';
    } catch (error) {
        // Fallback to device 1
        return '1';
    }
};

/**
 * Parses available audio devices from system
 * @returns Array of audio devices with index and name
 */
export const parseAudioDevices = async (): Promise<AudioDevice[]> => {
    try {
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            const output = result.stderr || result.stdout || '';
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];

            if (audioDevicesSection) {
                const deviceLines = audioDevicesSection.split('\n')
                    .filter((line: string) => line.includes('[') && line.includes(']'))
                    .map((line: string) => line.trim());

                return deviceLines.map((line: string) => {
                    const match = line.match(/\[(\d+)\]\s+(.+)/);
                    if (match) {
                        return { index: match[1], name: match[2] };
                    }
                    return null;
                }).filter(Boolean) as AudioDevice[];
            }
        }
        return [];
    } catch (error) {
        return [];
    }
};

/**
 * Lists available audio devices to the log
 */
export const listAudioDevices = async (): Promise<void> => {
    const logger = getLogger();
    try {
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            const output = result.stderr || result.stdout || '';
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];

            if (audioDevicesSection) {
                logger.info('🎙️  Available audio devices:');
                const deviceLines = audioDevicesSection.split('\n')
                    .filter((line: string) => line.includes('[') && line.includes(']'))
                    .map((line: string) => line.trim());

                deviceLines.forEach((line: string) => {
                    const match = line.match(/\[(\d+)\]\s+(.+)/);
                    if (match) {
                        logger.info(`   [${match[1]}] ${match[2]}`);
                    }
                });
            }
        }
    } catch (error) {
        logger.debug('Could not list audio devices');
    }
};

/**
 * Test if a specific audio device works with ffmpeg
 * @param deviceIndex The audio device index to test
 * @returns Promise<boolean> true if device works, false otherwise
 */
export const testAudioDevice = async (deviceIndex: string): Promise<boolean> => {
    const logger = getLogger();

    try {
        logger.info(`🔍 Testing audio device [${deviceIndex}]...`);

        // Test with a very short recording (1 second) to temp file
        const tempDir = path.join(DEFAULT_OUTPUT_DIRECTORY, 'tmp');
        await fs.mkdir(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `audio-test-${Date.now()}.wav`);

        // Try different input formats for different devices
        const testFormats = [
            `":${deviceIndex}"`,      // Preferred format: blank video (no video), audio index
            `"none:${deviceIndex}"`,  // Alternative format: explicit "none" video device
            `"${deviceIndex}"`        // Fallback format
        ];

        for (const inputFormat of testFormats) {
            const testCommand = `ffmpeg -f avfoundation -i ${inputFormat} -t 1 -y "${tempFile}"`;
            logger.debug(`🔧 Test command: ${testCommand}`);

            try {
                await run(testCommand);
                // If we get here, the command succeeded
                logger.info(`✅ Audio device [${deviceIndex}] is working with format ${inputFormat}`);

                // Clean up test file
                try {
                    await run(`rm "${tempFile}"`);
                } catch {
                    // Ignore cleanup errors
                }

                return true;
            } catch (error: any) {
                logger.debug(`❌ Audio device [${deviceIndex}] failed with format ${inputFormat}: ${error.stderr || error.message}`);
                // Continue to next format
            }
        }

        logger.warn(`❌ Audio device [${deviceIndex}] failed all test formats`);
        return false;

    } catch (error: any) {
        logger.error(`🚨 Failed to test audio device [${deviceIndex}]: ${error.message}`);
        return false;
    }
};

/**
 * Find the first working audio device and return both index and working format
 * @returns Promise<{index: string, format: string} | null> The index and format of the first working device, or null if none work
 */
export const findWorkingAudioDevice = async (): Promise<{ index: string, format: string } | null> => {
    const logger = getLogger();

    try {
        const devices = await parseAudioDevices();

        if (devices.length === 0) {
            logger.warn('No audio devices found');
            return null;
        }

        logger.info(`🔍 Testing ${devices.length} audio devices...`);

        for (const device of devices) {
            const tempDir = path.join(DEFAULT_OUTPUT_DIRECTORY, 'tmp');
            await fs.mkdir(tempDir, { recursive: true });
            const tempFile = path.join(tempDir, `audio-test-${Date.now()}.wav`);

            // Try different input formats for this device
            const testFormats = [
                `":${device.index}"`,      // Preferred format: blank video (no video), audio index
                `"none:${device.index}"`,  // Alternative format: explicit "none" video device
                `"${device.index}"`        // Fallback format
            ];

            for (const inputFormat of testFormats) {
                const testCommand = `ffmpeg -f avfoundation -i ${inputFormat} -t 1 -y "${tempFile}"`;
                logger.debug(`🔧 Test command: ${testCommand}`);

                try {
                    await run(testCommand);
                    // If we get here, the command succeeded
                    logger.info(`✅ Found working audio device: [${device.index}] ${device.name} with format ${inputFormat}`);

                    // Clean up test file
                    try {
                        await run(`rm "${tempFile}"`);
                    } catch {
                        // Ignore cleanup errors
                    }

                    return { index: device.index, format: inputFormat };
                } catch (error: any) {
                    logger.debug(`❌ Audio device [${device.index}] failed with format ${inputFormat}: ${error.stderr || error.message}`);
                    // Continue to next format
                }
            }
        }

        logger.warn('❌ No working audio devices found');
        return null;

    } catch (error: any) {
        logger.error(`🚨 Failed to find working audio device: ${error.message}`);
        return null;
    }
};

/**
 * Get the correct AVFoundation input format for a specific audio device
 * @param deviceIndex The audio device index to get format for
 * @returns Promise<string | null> The working input format for the device, or null if none work
 */
export const getDeviceInputFormat = async (deviceIndex: string): Promise<string | null> => {
    const logger = getLogger();

    try {
        const tempDir = path.join(DEFAULT_OUTPUT_DIRECTORY, 'tmp');
        await fs.mkdir(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `audio-format-test-${Date.now()}.wav`);

        // Try different input formats for this device
        const testFormats = [
            `":${deviceIndex}"`,      // Preferred format: blank video (no video), audio index
            `"none:${deviceIndex}"`,  // Alternative format: explicit "none" video device
            `"${deviceIndex}"`        // Fallback format
        ];

        for (const inputFormat of testFormats) {
            const testCommand = `ffmpeg -f avfoundation -i ${inputFormat} -t 1 -y "${tempFile}"`;
            logger.debug(`🔧 Testing format: ${inputFormat}`);

            try {
                await run(testCommand);
                // If we get here, the command succeeded
                logger.debug(`✅ Audio device [${deviceIndex}] works with format ${inputFormat}`);

                // Clean up test file
                try {
                    await run(`rm "${tempFile}"`);
                } catch {
                    // Ignore cleanup errors
                }

                return inputFormat;
            } catch (error: any) {
                logger.debug(`❌ Audio device [${deviceIndex}] failed with format ${inputFormat}`);
                // Continue to next format
            }
        }

        logger.warn(`❌ No working format found for audio device [${deviceIndex}]`);
        return null;

    } catch (error: any) {
        logger.error(`🚨 Failed to get format for audio device [${deviceIndex}]: ${error.message}`);
        return null;
    }
};

export const getAudioDeviceInfo = async (deviceIndex: string): Promise<{ sampleRate?: number; channels?: number; channelLayout?: string }> => {
    const logger = getLogger();

    // Build quoted input string required by avfoundation
    const inputFormat = `":${deviceIndex}"`;

    // ffprobe command to fetch audio stream metadata in JSON for easier parsing
    const probeCommand = `ffprobe -f avfoundation -i ${inputFormat} -show_streams -select_streams a -v quiet -print_format json`;

    try {
        const { stdout } = await run(probeCommand);
        const parsed = JSON.parse(stdout || '{}');
        const stream = parsed.streams && parsed.streams.length > 0 ? parsed.streams[0] : undefined;
        if (!stream) {
            logger.debug(`ffprobe returned no streams for device ${deviceIndex}`);
            return {};
        }

        const sampleRate = stream.sample_rate ? parseInt(stream.sample_rate, 10) : undefined;
        const channels = typeof stream.channels === 'number' ? stream.channels : undefined;
        const channelLayout: string | undefined = stream.channel_layout || undefined;

        logger.debug(`Device [${deviceIndex}] capabilities → sampleRate=${sampleRate}, channels=${channels}, layout=${channelLayout}`);
        return { sampleRate, channels, channelLayout };
    } catch (error: any) {
        logger.debug(`Failed to probe audio device ${deviceIndex}: ${error.message}`);
        return {};
    }
}; 