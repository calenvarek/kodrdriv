#!/usr/bin/env node
import path from 'path';
import yaml from 'js-yaml';
import { getLogger } from '../logging';
import { Config } from '../types';
import { run } from '../util/child';
import { create as createStorage } from '../util/storage';

const parseAudioDevices = async (): Promise<Array<{ index: string; name: string }>> => {
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
                }).filter(Boolean) as Array<{ index: string; name: string }>;
            }
        }
        return [];
    } catch {
        return [];
    }
};

const selectAudioDeviceInteractively = async (): Promise<{ index: string; name: string } | null> => {
    const logger = getLogger();

    logger.info('🎙️  Available audio devices:');
    const devices = await parseAudioDevices();

    if (devices.length === 0) {
        logger.error('❌ No audio devices found. Make sure ffmpeg is installed and audio devices are available.');
        return null;
    }

    // Test devices and show status
    logger.info('🔍 Testing audio devices...');
    const deviceStatuses = await Promise.all(
        devices.map(async (device) => {
            const isWorking = await testAudioDevice(device.index);
            return { ...device, isWorking };
        })
    );

    // Display devices with status
    deviceStatuses.forEach((device, i) => {
        const status = device.isWorking ? '✅' : '❌';
        logger.info(`   ${i + 1}. ${status} ${device.name}`);
    });

    const workingDevices = deviceStatuses.filter(d => d.isWorking);
    if (workingDevices.length === 0) {
        logger.error('❌ No working audio devices found. This may be due to:');
        logger.error('   • Microphone permission not granted to Terminal/iTerm');
        logger.error('   • Audio devices in use by other applications');
        logger.error('   • ffmpeg configuration issues');
        logger.error('');
        logger.error('💡 Try:');
        logger.error('   • Go to System Preferences → Security & Privacy → Privacy → Microphone');
        logger.error('   • Make sure Terminal (or your terminal app) has microphone access');
        logger.error('   • Close other audio applications and try again');
        return null;
    }

    logger.info('');
    logger.info('📋 Select an audio device by entering its number (1-' + devices.length + '):');

    return new Promise((resolve) => {
        // Set up keyboard input
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        let inputBuffer = '';

        const keyHandler = (key: string) => {
            const keyCode = key.charCodeAt(0);

            if (keyCode === 13) { // ENTER key
                const selectedIndex = parseInt(inputBuffer) - 1;

                if (selectedIndex >= 0 && selectedIndex < devices.length) {
                    const selectedDevice = deviceStatuses[selectedIndex];
                    process.stdout.write('\n\n');

                    if (!selectedDevice.isWorking) {
                        logger.warn(`⚠️  Warning: Selected device "${selectedDevice.name}" failed testing`);
                        logger.warn('   This device may not work properly for recording');
                        logger.warn('   Consider selecting a device marked with ✅');
                    } else {
                        logger.info(`✅ Selected: ${selectedDevice.name}`);
                    }

                    // Cleanup and resolve
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', keyHandler);
                    resolve(selectedDevice);
                } else {
                    logger.error('❌ Invalid selection. Please enter a number between 1 and ' + devices.length);
                    inputBuffer = '';
                    process.stdout.write('📋 Select an audio device: ');
                }
            } else if (keyCode === 3) { // Ctrl+C
                logger.info('\n❌ Selection cancelled');
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', keyHandler);
                resolve(null);
            } else if (keyCode >= 48 && keyCode <= 57) { // Numbers 0-9
                inputBuffer += key;
                process.stdout.write(key);
            } else if (keyCode === 127) { // Backspace
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            }
        };

        process.stdin.on('data', keyHandler);
        process.stdout.write('📋 Select an audio device: ');
    });
};

const getAudioDeviceConfigPath = (preferencesDirectory: string): string => {
    return path.join(preferencesDirectory, 'audio-device.yaml');
};

const ensurePreferencesDirectory = async (preferencesDirectory: string): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        await storage.ensureDirectory(preferencesDirectory);
        logger.debug('Ensured preferences directory exists: %s', preferencesDirectory);
    } catch (error: any) {
        logger.error('Failed to create preferences directory: %s', error.message);
        throw error;
    }
};

export const saveAudioDeviceToHomeConfig = async (
    deviceIndex: string,
    deviceName: string,
    capabilities: { sampleRate?: number; channels?: number; channelLayout?: string },
    preferencesDirectory: string
): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        await ensurePreferencesDirectory(preferencesDirectory);
        const configPath = getAudioDeviceConfigPath(preferencesDirectory);

        const audioConfig = {
            audioDevice: deviceIndex,
            audioDeviceName: deviceName,
            sampleRate: capabilities.sampleRate,
            channels: capabilities.channels,
            channelLayout: capabilities.channelLayout,
            lastUpdated: new Date().toISOString()
        };

        // Save as YAML
        const yamlContent = yaml.dump(audioConfig, {
            indent: 2,
            lineWidth: 120,
            noRefs: true
        });

        await storage.writeFile(configPath, yamlContent, 'utf-8');
        logger.debug('Saved audio configuration to: %s', configPath);

    } catch (error: any) {
        logger.error('Failed to save audio configuration: %s', error.message);
        throw error;
    }
};

export const loadAudioDeviceFromHomeConfig = async (preferencesDirectory: string): Promise<{ audioDevice: string; audioDeviceName: string; sampleRate?: number; channels?: number; channelLayout?: string } | null> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        const configPath = getAudioDeviceConfigPath(preferencesDirectory);
        const configContent = await storage.readFile(configPath, 'utf-8');
        const audioConfig = yaml.load(configContent) as any;

        if (audioConfig?.audioDevice) {
            logger.debug('Loaded audio device from preferences config: [%s] %s', audioConfig.audioDevice, audioConfig.audioDeviceName || 'Unknown');
            return {
                audioDevice: audioConfig.audioDevice,
                audioDeviceName: audioConfig.audioDeviceName || 'Unknown',
                sampleRate: audioConfig.sampleRate,
                channels: audioConfig.channels,
                channelLayout: audioConfig.channelLayout
            };
        }

        return null;
    } catch {
        // Config file doesn't exist or is invalid
        logger.debug('No saved audio device configuration found in preferences directory');
        return null;
    }
};

export const audioDeviceConfigExists = async (preferencesDirectory: string): Promise<boolean> => {
    const storage = createStorage({ log: () => { } });
    const configPath = getAudioDeviceConfigPath(preferencesDirectory);

    try {
        await storage.readFile(configPath, 'utf-8');
        return true;
    } catch {
        return false;
    }
};

const listAudioDevices = async (): Promise<void> => {
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

                deviceLines.forEach((line: string, i: number) => {
                    const match = line.match(/\[(\d+)\]\s+(.+)/);
                    if (match) {
                        logger.info(`   ${i + 1}. ${match[2]}`);
                    }
                });
            }
        }
    } catch {
        logger.debug('Could not list audio devices');
    }
};

/**
 * Test if an audio device is working by attempting a short recording
 */
const testAudioDevice = async (deviceIndex: string): Promise<boolean> => {
    const logger = getLogger();
    try {
        // Test the device with a very short recording
        const testArgs = [
            '-f', 'avfoundation',
            '-i', `":${deviceIndex}"`, // Just audio, no video
            '-t', '0.1', // 0.1 second test
            '-f', 'null',
            '-'
        ];

        await run(`ffmpeg ${testArgs.join(' ')}`);
        logger.debug(`Device ${deviceIndex} test: PASS`);
        return true;
    } catch (error: any) {
        logger.debug(`Device ${deviceIndex} test: FAIL - ${error.message}`);
        return false;
    }
};

/**
 * Get detailed information about a specific audio device
 */
const getAudioDeviceInfo = async (deviceIndex: string): Promise<{ sampleRate?: number; channels?: number; channelLayout?: string }> => {
    const logger = getLogger();
    try {
        // Use ffmpeg to probe the device capabilities
        const probeArgs = [
            '-f', 'avfoundation',
            '-i', `":${deviceIndex}"`,
            '-t', '0.1',
            '-f', 'null',
            '-'
        ];

        const result = await run(`ffmpeg ${probeArgs.join(' ')}`);
        const output = result.stderr || result.stdout || '';

        // Parse the output for audio information
        let sampleRate: number | undefined;
        let channels: number | undefined;
        let channelLayout: string | undefined;

        // Look for sample rate info (e.g., "48000 Hz")
        const sampleRateMatch = output.match(/(\d+)\s*Hz/);
        if (sampleRateMatch) {
            sampleRate = parseInt(sampleRateMatch[1]);
        }

        // Look for channel info (e.g., "mono", "stereo", "1 channels", "2 channels")
        const channelMatch = output.match(/(\d+)\s*channels?/);
        if (channelMatch) {
            channels = parseInt(channelMatch[1]);
        }

        // Look for channel layout info
        const layoutMatch = output.match(/(mono|stereo)/i);
        if (layoutMatch) {
            channelLayout = layoutMatch[1].toLowerCase();
        } else if (channels) {
            channelLayout = channels === 1 ? 'mono' : channels === 2 ? 'stereo' : `${channels}ch`;
        }

        logger.debug(`Device ${deviceIndex} info: ${sampleRate}Hz, ${channels}ch, ${channelLayout}`);

        return {
            sampleRate,
            channels,
            channelLayout
        };
    } catch (error: any) {
        logger.debug(`Failed to get device ${deviceIndex} info: ${error.message}`);
        return {};
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio device selection process');
        logger.info('DRY RUN: Would save selected device to %s/audio-device.yaml', runConfig.preferencesDirectory);
        return 'Audio device selection completed (dry run)';
    }

    logger.info('🎛️  Starting audio device selection...');
    logger.info('');
    logger.info('This device will be used to capture audio for:');
    logger.info('  • Audio commit messages (audio-commit command)');
    logger.info('  • Audio code reviews (audio-review command)');
    logger.info('');

    // List available devices in debug mode
    if (runConfig.debug) {
        await listAudioDevices();
    }

    const selectedDevice = await selectAudioDeviceInteractively();

    if (selectedDevice === null) {
        logger.error('❌ Audio device selection cancelled or failed');
        process.exit(1);
    }

    // Probe device capabilities (sample rate / channels)
    const capabilities = await getAudioDeviceInfo(selectedDevice.index);

    // Save to preferences directory configuration
    await saveAudioDeviceToHomeConfig(selectedDevice.index, selectedDevice.name, capabilities || {}, runConfig.preferencesDirectory!);
    logger.info('💾 Audio device saved to %s/audio-device.yaml', runConfig.preferencesDirectory);

    logger.info('✅ Audio device selection complete');
    logger.info('');
    logger.info('You can now run audio-commit or audio-review commands to use your selected device');
    logger.info('To change your audio device in the future, run the select-audio command again');

    return `Audio device configured successfully: ${selectedDevice.name}`;
}; 