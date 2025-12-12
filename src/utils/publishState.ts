import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../logging';

export interface PackagePublishState {
    status: 'pending' | 'publishing' | 'published' | 'failed' | 'skipped';
    version?: string;
    pr?: number;
    commit?: string;
    error?: string;
    timestamp?: string;
    needsRecovery?: boolean;
}

export interface PublishState {
    lastRun: string;
    packages: Record<string, PackagePublishState>;
    workingBranch?: string;
    targetBranch?: string;
}

const STATE_DIR = '.kodrdriv';
const STATE_FILE = 'publish-state.json';

/**
 * Get the state file path
 */
export function getStateFilePath(cwd: string = process.cwd()): string {
    return path.join(cwd, STATE_DIR, STATE_FILE);
}

/**
 * Ensure state directory exists
 */
async function ensureStateDirectory(cwd: string = process.cwd()): Promise<void> {
    const stateDir = path.join(cwd, STATE_DIR);
    try {
        await fs.mkdir(stateDir, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Load publish state from disk
 */
export async function loadPublishState(cwd: string = process.cwd()): Promise<PublishState | null> {
    const logger = getLogger();
    const statePath = getStateFilePath(cwd);

    try {
        const content = await fs.readFile(statePath, 'utf-8');
        const state = JSON.parse(content) as PublishState;
        logger.verbose(`Loaded publish state from ${statePath}`);
        return state;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            logger.verbose(`No publish state found at ${statePath}`);
            return null;
        }
        logger.warn(`Failed to load publish state: ${error.message}`);
        return null;
    }
}

/**
 * Save publish state to disk
 */
export async function savePublishState(state: PublishState, cwd: string = process.cwd()): Promise<void> {
    const logger = getLogger();
    const statePath = getStateFilePath(cwd);

    try {
        await ensureStateDirectory(cwd);
        await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
        logger.verbose(`Saved publish state to ${statePath}`);
    } catch (error: any) {
        logger.warn(`Failed to save publish state: ${error.message}`);
    }
}

/**
 * Initialize a new publish state
 */
export function createPublishState(workingBranch?: string, targetBranch?: string): PublishState {
    return {
        lastRun: new Date().toISOString(),
        packages: {},
        workingBranch,
        targetBranch,
    };
}

/**
 * Update package state
 */
export async function updatePackageState(
    packageName: string,
    updates: Partial<PackagePublishState>,
    cwd: string = process.cwd()
): Promise<void> {
    const state = await loadPublishState(cwd) || createPublishState();

    state.packages[packageName] = {
        ...state.packages[packageName],
        ...updates,
        timestamp: new Date().toISOString(),
    };

    await savePublishState(state, cwd);
}

/**
 * Get packages that need recovery
 */
export function getPackagesNeedingRecovery(state: PublishState): string[] {
    return Object.entries(state.packages)
        .filter(([_, pkgState]) => pkgState.needsRecovery || pkgState.status === 'failed')
        .map(([name]) => name);
}

/**
 * Get packages that were successfully published
 */
export function getPublishedPackages(state: PublishState): string[] {
    return Object.entries(state.packages)
        .filter(([_, pkgState]) => pkgState.status === 'published')
        .map(([name]) => name);
}

/**
 * Clear publish state
 */
export async function clearPublishState(cwd: string = process.cwd()): Promise<void> {
    const logger = getLogger();
    const statePath = getStateFilePath(cwd);

    try {
        await fs.unlink(statePath);
        logger.verbose(`Cleared publish state from ${statePath}`);
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            logger.warn(`Failed to clear publish state: ${error.message}`);
        }
    }
}

/**
 * Format publish state for display
 */
export function formatPublishState(state: PublishState): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push(`Publish State (Last run: ${new Date(state.lastRun).toLocaleString()})`);
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    if (state.workingBranch) {
        lines.push(`Working Branch: ${state.workingBranch}`);
    }
    if (state.targetBranch) {
        lines.push(`Target Branch: ${state.targetBranch}`);
    }
    if (state.workingBranch || state.targetBranch) {
        lines.push('');
    }

    const packageNames = Object.keys(state.packages);
    if (packageNames.length === 0) {
        lines.push('No packages tracked');
        return lines.join('\n');
    }

    const byStatus = {
        published: [] as string[],
        failed: [] as string[],
        publishing: [] as string[],
        skipped: [] as string[],
        pending: [] as string[],
    };

    for (const [name, pkgState] of Object.entries(state.packages)) {
        byStatus[pkgState.status].push(name);
    }

    if (byStatus.published.length > 0) {
        lines.push(`✅ Published (${byStatus.published.length}):`);
        byStatus.published.forEach(name => {
            const pkg = state.packages[name];
            lines.push(`   ${name}${pkg.version ? ` v${pkg.version}` : ''}${pkg.pr ? ` (PR #${pkg.pr})` : ''}`);
        });
        lines.push('');
    }

    if (byStatus.failed.length > 0) {
        lines.push(`❌ Failed (${byStatus.failed.length}):`);
        byStatus.failed.forEach(name => {
            const pkg = state.packages[name];
            lines.push(`   ${name}${pkg.error ? `: ${pkg.error}` : ''}`);
        });
        lines.push('');
    }

    if (byStatus.publishing.length > 0) {
        lines.push(`⏳ In Progress (${byStatus.publishing.length}):`);
        byStatus.publishing.forEach(name => {
            lines.push(`   ${name}`);
        });
        lines.push('');
    }

    if (byStatus.skipped.length > 0) {
        lines.push(`⊘ Skipped (${byStatus.skipped.length}):`);
        byStatus.skipped.forEach(name => {
            lines.push(`   ${name}`);
        });
        lines.push('');
    }

    if (byStatus.pending.length > 0) {
        lines.push(`⊙ Pending (${byStatus.pending.length}):`);
        byStatus.pending.forEach(name => {
            lines.push(`   ${name}`);
        });
        lines.push('');
    }

    const needsRecovery = getPackagesNeedingRecovery(state);
    if (needsRecovery.length > 0) {
        lines.push(`🔧 Needs Recovery (${needsRecovery.length}):`);
        needsRecovery.forEach(name => {
            lines.push(`   ${name}`);
        });
        lines.push('');
        lines.push('💡 Run with --recover to resume from failures');
    }

    return lines.join('\n');
}

