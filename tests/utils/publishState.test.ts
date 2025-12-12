import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as publishState from '../../src/utils/publishState';

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            mkdir: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            unlink: vi.fn(),
        },
    };
});

describe('publishState utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createPublishState', () => {
        it('should create new state with timestamp', () => {
            const state = publishState.createPublishState('working', 'main');

            expect(state.lastRun).toBeDefined();
            expect(state.packages).toEqual({});
            expect(state.workingBranch).toBe('working');
            expect(state.targetBranch).toBe('main');
        });

        it('should create state without branches', () => {
            const state = publishState.createPublishState();

            expect(state.workingBranch).toBeUndefined();
            expect(state.targetBranch).toBeUndefined();
        });
    });

    describe('loadPublishState', () => {
        it('should load existing state', async () => {
            const mockState: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {
                    '@pkg/one': { status: 'published', version: '1.0.0' },
                },
            };

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

            const loaded = await publishState.loadPublishState('/test');

            expect(loaded).toEqual(mockState);
        });

        it('should return null if file does not exist', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            const loaded = await publishState.loadPublishState('/test');

            expect(loaded).toBeNull();
        });

        it('should return null on invalid JSON', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('invalid json');

            const loaded = await publishState.loadPublishState('/test');

            expect(loaded).toBeNull();
        });
    });

    describe('savePublishState', () => {
        it('should save state to disk', async () => {
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            const state = publishState.createPublishState('working', 'main');
            await publishState.savePublishState(state, '/test');

            expect(fs.mkdir).toHaveBeenCalled();
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.kodrdriv/publish-state.json'),
                expect.any(String),
                'utf-8'
            );
        });

        it('should not fail if mkdir fails with EEXIST', async () => {
            const error: any = new Error('EEXIST');
            error.code = 'EEXIST';
            vi.mocked(fs.mkdir).mockRejectedValue(error);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            const state = publishState.createPublishState();
            await expect(publishState.savePublishState(state, '/test')).resolves.not.toThrow();
        });
    });

    describe('updatePackageState', () => {
        it('should create new state if none exists', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await publishState.updatePackageState('@pkg/test', {
                status: 'publishing',
                version: '1.0.0',
            }, '/test');

            expect(fs.writeFile).toHaveBeenCalled();
            const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            const saved = JSON.parse(savedContent);

            expect(saved.packages['@pkg/test'].status).toBe('publishing');
            expect(saved.packages['@pkg/test'].version).toBe('1.0.0');
            expect(saved.packages['@pkg/test'].timestamp).toBeDefined();
        });

        it('should update existing package state', async () => {
            const existingState: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {
                    '@pkg/test': { status: 'publishing', version: '1.0.0' },
                },
            };

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await publishState.updatePackageState('@pkg/test', {
                status: 'published',
                pr: 123,
            }, '/test');

            const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            const saved = JSON.parse(savedContent);

            expect(saved.packages['@pkg/test'].status).toBe('published');
            expect(saved.packages['@pkg/test'].version).toBe('1.0.0'); // preserved
            expect(saved.packages['@pkg/test'].pr).toBe(123);
        });
    });

    describe('getPackagesNeedingRecovery', () => {
        it('should return packages with needsRecovery flag', () => {
            const state: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {
                    '@pkg/good': { status: 'published' },
                    '@pkg/bad1': { status: 'failed' },
                    '@pkg/bad2': { status: 'publishing', needsRecovery: true },
                },
            };

            const needsRecovery = publishState.getPackagesNeedingRecovery(state);

            expect(needsRecovery).toContain('@pkg/bad1');
            expect(needsRecovery).toContain('@pkg/bad2');
            expect(needsRecovery).not.toContain('@pkg/good');
        });
    });

    describe('getPublishedPackages', () => {
        it('should return only published packages', () => {
            const state: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {
                    '@pkg/one': { status: 'published' },
                    '@pkg/two': { status: 'published' },
                    '@pkg/three': { status: 'failed' },
                },
            };

            const published = publishState.getPublishedPackages(state);

            expect(published).toContain('@pkg/one');
            expect(published).toContain('@pkg/two');
            expect(published).not.toContain('@pkg/three');
        });
    });

    describe('clearPublishState', () => {
        it('should delete state file', async () => {
            vi.mocked(fs.unlink).mockResolvedValue(undefined);

            await publishState.clearPublishState('/test');

            expect(fs.unlink).toHaveBeenCalledWith(
                expect.stringContaining('.kodrdriv/publish-state.json')
            );
        });

        it('should not fail if file does not exist', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.unlink).mockRejectedValue(error);

            await expect(publishState.clearPublishState('/test')).resolves.not.toThrow();
        });
    });

    describe('formatPublishState', () => {
        it('should format state with all statuses', () => {
            const state: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                workingBranch: 'working',
                targetBranch: 'main',
                packages: {
                    '@pkg/published': { status: 'published', version: '1.0.0', pr: 123 },
                    '@pkg/failed': { status: 'failed', error: 'Build failed' },
                    '@pkg/publishing': { status: 'publishing' },
                    '@pkg/skipped': { status: 'skipped' },
                    '@pkg/pending': { status: 'pending' },
                },
            };

            const formatted = publishState.formatPublishState(state);

            expect(formatted).toContain('Publish State');
            expect(formatted).toContain('Working Branch: working');
            expect(formatted).toContain('Target Branch: main');
            expect(formatted).toContain('✅ Published (1)');
            expect(formatted).toContain('@pkg/published v1.0.0 (PR #123)');
            expect(formatted).toContain('❌ Failed (1)');
            expect(formatted).toContain('@pkg/failed: Build failed');
            expect(formatted).toContain('⏳ In Progress (1)');
            expect(formatted).toContain('⊘ Skipped (1)');
            expect(formatted).toContain('⊙ Pending (1)');
        });

        it('should show recovery message if needed', () => {
            const state: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {
                    '@pkg/needs-recovery': { status: 'failed', needsRecovery: true },
                },
            };

            const formatted = publishState.formatPublishState(state);

            expect(formatted).toContain('Needs Recovery');
            expect(formatted).toContain('--recover');
        });

        it('should handle empty state', () => {
            const state: publishState.PublishState = {
                lastRun: '2025-01-01T00:00:00.000Z',
                packages: {},
            };

            const formatted = publishState.formatPublishState(state);

            expect(formatted).toContain('No packages tracked');
        });
    });
});

