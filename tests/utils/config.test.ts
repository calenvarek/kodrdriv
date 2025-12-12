import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as config from '../../src/utils/config';

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            readFile: vi.fn(),
            writeFile: vi.fn(),
            access: vi.fn(),
        },
    };
});

describe('config utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadConfig', () => {
        it('should load config from .kodrdrivrc.json', async () => {
            const mockConfig: config.KodrdrivConfig = {
                parallel: { maxConcurrency: 10 },
            };

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

            const loaded = await config.loadConfig('/test');

            expect(loaded).toEqual(mockConfig);
        });

        it('should try multiple config file names', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';

            vi.mocked(fs.readFile)
                .mockRejectedValueOnce(error) // .kodrdrivrc.json not found
                .mockRejectedValueOnce(error) // .kodrdrivrc not found
                .mockResolvedValueOnce(JSON.stringify({ parallel: {} })); // kodrdriv.config.json found

            const loaded = await config.loadConfig('/test');

            expect(loaded).toBeDefined();
            expect(fs.readFile).toHaveBeenCalledTimes(3);
        });

        it('should return null if no config file found', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            const loaded = await config.loadConfig('/test');

            expect(loaded).toBeNull();
        });

        it('should warn on invalid JSON but not throw', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('invalid json');

            const loaded = await config.loadConfig('/test');

            // Should try other files after JSON parse fails
            expect(loaded).toBeNull();
        });
    });

    describe('getDefaultConfig', () => {
        it('should return complete default config', () => {
            const defaults = config.getDefaultConfig();

            expect(defaults.parallel).toBeDefined();
            expect(defaults.recovery).toBeDefined();
            expect(defaults.npm).toBeDefined();

            expect(defaults.parallel?.maxConcurrency).toBe(8);
            expect(defaults.recovery?.maxRetries).toBe(3);
            expect(defaults.npm?.registryPropagationDelay).toBe(10000);
        });
    });

    describe('mergeWithDefaults', () => {
        it('should return defaults if no config provided', () => {
            const merged = config.mergeWithDefaults(null);
            const defaults = config.getDefaultConfig();

            expect(merged).toEqual(defaults);
        });

        it('should merge partial config with defaults', () => {
            const partial: config.KodrdrivConfig = {
                parallel: { maxConcurrency: 16 },
            };

            const merged = config.mergeWithDefaults(partial);

            expect(merged.parallel?.maxConcurrency).toBe(16);
            expect(merged.parallel?.autoSync).toBe(false); // from defaults
            expect(merged.recovery).toBeDefined(); // from defaults
            expect(merged.npm).toBeDefined(); // from defaults
        });

        it('should override defaults with user config', () => {
            const userConfig: config.KodrdrivConfig = {
                parallel: {
                    maxConcurrency: 4,
                    autoSync: true,
                    failFast: true,
                },
                recovery: {
                    maxRetries: 5,
                },
            };

            const merged = config.mergeWithDefaults(userConfig);

            expect(merged.parallel?.maxConcurrency).toBe(4);
            expect(merged.parallel?.autoSync).toBe(true);
            expect(merged.parallel?.failFast).toBe(true);
            expect(merged.recovery?.maxRetries).toBe(5);
            expect(merged.recovery?.retryDelay).toBe(5000); // from defaults
        });
    });

    describe('getEffectiveConfig', () => {
        it('should load and merge with defaults', async () => {
            const mockConfig: config.KodrdrivConfig = {
                parallel: { maxConcurrency: 12 },
            };

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

            const effective = await config.getEffectiveConfig('/test');

            expect(effective.parallel?.maxConcurrency).toBe(12);
            expect(effective.recovery).toBeDefined();
            expect(effective.npm).toBeDefined();
        });

        it('should return defaults if no config file', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            const effective = await config.getEffectiveConfig('/test');
            const defaults = config.getDefaultConfig();

            expect(effective).toEqual(defaults);
        });
    });

    describe('createSampleConfig', () => {
        it('should create valid JSON config', () => {
            const sample = config.createSampleConfig();

            expect(() => JSON.parse(sample)).not.toThrow();

            const parsed = JSON.parse(sample) as config.KodrdrivConfig;
            expect(parsed.parallel).toBeDefined();
            expect(parsed.recovery).toBeDefined();
            expect(parsed.npm).toBeDefined();
        });
    });

    describe('saveSampleConfig', () => {
        it('should save sample config to file', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.access).mockRejectedValue(error);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            const path = await config.saveSampleConfig('/test');

            expect(path).toContain('.kodrdrivrc.json');
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.kodrdrivrc.json'),
                expect.any(String),
                'utf-8'
            );
        });

        it('should throw if config file already exists', async () => {
            vi.mocked(fs.access).mockResolvedValue(undefined);

            await expect(config.saveSampleConfig('/test'))
                .rejects.toThrow('already exists');
        });
    });
});

