import { getLogger } from '../logging';
import { run } from '../util/child';
import { AudioDevice } from './types';

/**
 * Detects the best available audio device for recording
 * @returns Audio device index as string
 */
export const detectBestAudioDevice = async (): Promise<string> => {
    try {
        // Get list of audio devices - this command always "fails" but gives us the device list
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