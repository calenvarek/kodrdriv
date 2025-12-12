import { run } from '@eldrforge/git-tools';
import { getLogger } from '../logging';

export interface BranchStatus {
    name: string;
    isOnExpectedBranch: boolean;
    expectedBranch?: string;
    ahead: number;
    behind: number;
    hasUnpushedCommits: boolean;
    needsSync: boolean;
    remoteExists: boolean;
    hasMergeConflicts?: boolean;
    conflictsWith?: string;
    hasOpenPR?: boolean;
    prUrl?: string;
    prNumber?: number;
}

export interface PackageBranchAudit {
    packageName: string;
    path: string;
    status: BranchStatus;
    issues: string[];
    fixes: string[];
}

export interface BranchAuditResult {
    totalPackages: number;
    goodPackages: number;
    issuesFound: number;
    audits: PackageBranchAudit[];
}

/**
 * Check the branch status for a package
 */
export async function checkBranchStatus(
    packagePath: string,
    expectedBranch?: string,
    targetBranch: string = 'main',
    checkPR: boolean = false
): Promise<BranchStatus> {
    const logger = getLogger();
    const originalCwd = process.cwd();

    try {
        process.chdir(packagePath);

        // Get current branch
        const { stdout: currentBranch } = await run('git rev-parse --abbrev-ref HEAD');
        const branch = currentBranch.trim();

        // Check if remote exists
        let remoteExists = false;
        try {
            await run(`git ls-remote --exit-code --heads origin ${branch}`);
            remoteExists = true;
        } catch {
            remoteExists = false;
        }

        // Get ahead/behind counts if remote exists
        let ahead = 0;
        let behind = 0;

        if (remoteExists) {
            try {
                const { stdout: revList } = await run(`git rev-list --left-right --count origin/${branch}...HEAD`);
                const [behindStr, aheadStr] = revList.trim().split('\t');
                behind = parseInt(behindStr, 10) || 0;
                ahead = parseInt(aheadStr, 10) || 0;
            } catch (error) {
                logger.verbose(`Could not get ahead/behind counts for ${packagePath}: ${error}`);
            }
        }

        // Check for merge conflicts with target branch
        let hasMergeConflicts = false;
        let conflictsWith: string | undefined;
        
        if (branch !== targetBranch) {
            try {
                // Fetch latest to ensure we're checking against current target
                await run('git fetch origin --quiet');
                
                // Use git merge-tree to test for conflicts without actually merging
                const { stdout: mergeTree } = await run(`git merge-tree $(git merge-base ${branch} origin/${targetBranch}) ${branch} origin/${targetBranch}`);
                
                // If merge-tree output contains conflict markers, there are conflicts
                if (mergeTree.includes('<<<<<<<') || mergeTree.includes('=======') || mergeTree.includes('>>>>>>>')) {
                    hasMergeConflicts = true;
                    conflictsWith = targetBranch;
                }
            } catch (error: any) {
                // If merge-tree fails, might be due to git version or other issues
                logger.verbose(`Could not check merge conflicts for ${packagePath}: ${error.message}`);
            }
        }

        // Check for existing PR if requested
        let hasOpenPR = false;
        let prUrl: string | undefined;
        let prNumber: number | undefined;
        
        if (checkPR) {
            try {
                const { findOpenPullRequestByHeadRef } = await import('@eldrforge/github-tools');
                const pr = await findOpenPullRequestByHeadRef(branch);
                if (pr) {
                    hasOpenPR = true;
                    prUrl = pr.html_url;
                    prNumber = pr.number;
                }
            } catch (error: any) {
                logger.verbose(`Could not check for PR for ${packagePath}: ${error.message}`);
            }
        }

        const isOnExpectedBranch = !expectedBranch || branch === expectedBranch;
        const hasUnpushedCommits = ahead > 0;
        const needsSync = behind > 0;

        return {
            name: branch,
            isOnExpectedBranch,
            expectedBranch,
            ahead,
            behind,
            hasUnpushedCommits,
            needsSync,
            remoteExists,
            hasMergeConflicts,
            conflictsWith,
            hasOpenPR,
            prUrl,
            prNumber,
        };
    } finally {
        process.chdir(originalCwd);
    }
}

/**
 * Audit branch state across multiple packages
 */
export async function auditBranchState(
    packages: Array<{ name: string; path: string }>,
    expectedBranch?: string,
    options: {
        targetBranch?: string;
        checkPR?: boolean;
        checkConflicts?: boolean;
    } = {}
): Promise<BranchAuditResult> {
    const logger = getLogger();
    const audits: PackageBranchAudit[] = [];
    const targetBranch = options.targetBranch || 'main';
    const checkPR = options.checkPR !== false; // Default true
    const checkConflicts = options.checkConflicts !== false; // Default true

    logger.info(`📋 Auditing branch state for ${packages.length} package(s)...`);

    // If no expected branch specified, find the most common branch
    let actualExpectedBranch = expectedBranch;
    if (!expectedBranch) {
        const branchCounts = new Map<string, number>();
        
        // First pass: collect all branch names
        for (const pkg of packages) {
            const status = await checkBranchStatus(pkg.path);
            branchCounts.set(status.name, (branchCounts.get(status.name) || 0) + 1);
        }
        
        // Find most common branch
        let maxCount = 0;
        for (const [branch, count] of branchCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                actualExpectedBranch = branch;
            }
        }
        
        logger.verbose(`Most common branch: ${actualExpectedBranch} (${maxCount}/${packages.length} packages)`);
    }

    for (const pkg of packages) {
        const status = await checkBranchStatus(
            pkg.path,
            actualExpectedBranch,
            targetBranch,
            checkPR
        );
        const issues: string[] = [];
        const fixes: string[] = [];

        // Check for issues
        if (!status.isOnExpectedBranch && actualExpectedBranch) {
            issues.push(`On branch '${status.name}' (most packages are on '${actualExpectedBranch}')`);
            fixes.push(`cd ${pkg.path} && git checkout ${actualExpectedBranch}`);
        }

        if (checkConflicts && status.hasMergeConflicts && status.conflictsWith) {
            issues.push(`⚠️  MERGE CONFLICTS with '${status.conflictsWith}'`);
            fixes.push(`cd ${pkg.path} && git merge origin/${status.conflictsWith}  # Resolve conflicts manually`);
        }

        if (checkPR && status.hasOpenPR) {
            issues.push(`Has existing PR #${status.prNumber}: ${status.prUrl}`);
            fixes.push(`# Review PR: ${status.prUrl}`);
        }

        if (status.hasUnpushedCommits) {
            issues.push(`Ahead of remote by ${status.ahead} commit(s)`);
            fixes.push(`cd ${pkg.path} && git push origin ${status.name}`);
        }

        if (status.needsSync) {
            issues.push(`Behind remote by ${status.behind} commit(s)`);
            fixes.push(`cd ${pkg.path} && git pull origin ${status.name}`);
        }

        if (!status.remoteExists) {
            issues.push(`Remote branch does not exist`);
            fixes.push(`cd ${pkg.path} && git push -u origin ${status.name}`);
        }

        audits.push({
            packageName: pkg.name,
            path: pkg.path,
            status,
            issues,
            fixes,
        });
    }

    const issuesFound = audits.filter(a => a.issues.length > 0).length;
    const goodPackages = audits.filter(a => a.issues.length === 0).length;

    return {
        totalPackages: packages.length,
        goodPackages,
        issuesFound,
        audits,
    };
}

/**
 * Format audit results for display
 */
export function formatAuditResults(result: BranchAuditResult): string {
    const lines: string[] = [];

    // Determine the common branch if any
    const branchCounts = new Map<string, number>();
    for (const audit of result.audits) {
        const branch = audit.status.name;
        branchCounts.set(branch, (branchCounts.get(branch) || 0) + 1);
    }

    let commonBranch: string | undefined;
    let maxCount = 0;
    for (const [branch, count] of branchCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            commonBranch = branch;
        }
    }

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push(`║  Branch State Audit (${result.totalPackages} packages)`.padEnd(63) + '║');
    if (commonBranch && maxCount === result.totalPackages) {
        lines.push(`║  All packages on: ${commonBranch}`.padEnd(63) + '║');
    } else if (commonBranch) {
        lines.push(`║  Most packages on: ${commonBranch} (${maxCount}/${result.totalPackages})`.padEnd(63) + '║');
    }
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('');

    if (result.goodPackages > 0) {
        lines.push(`✅ Good State (${result.goodPackages} package${result.goodPackages === 1 ? '' : 's'}):`);

        const goodAudits = result.audits.filter(a => a.issues.length === 0);
        const displayCount = Math.min(goodAudits.length, 5);
        goodAudits.slice(0, displayCount).forEach(audit => {
            lines.push(`   ${audit.packageName}`);
        });

        if (goodAudits.length > displayCount) {
            lines.push(`   ... and ${goodAudits.length - displayCount} more`);
        }
        lines.push('');
    }

    if (result.issuesFound > 0) {
        // Count critical issues (merge conflicts, existing PRs)
        const conflictCount = result.audits.filter(a => a.status.hasMergeConflicts).length;
        const prCount = result.audits.filter(a => a.status.hasOpenPR).length;
        
        if (conflictCount > 0 || prCount > 0) {
            lines.push(`🚨 CRITICAL ISSUES:`);
            if (conflictCount > 0) {
                lines.push(`   ⚠️  ${conflictCount} package${conflictCount === 1 ? '' : 's'} with merge conflicts`);
            }
            if (prCount > 0) {
                lines.push(`   📋 ${prCount} package${prCount === 1 ? '' : 's'} with existing PRs`);
            }
            lines.push('');
        }
        
        lines.push(`⚠️  Issues Found (${result.issuesFound} package${result.issuesFound === 1 ? '' : 's'}):`);
        lines.push('');

        result.audits.filter(a => a.issues.length > 0).forEach(audit => {
            // Highlight critical issues
            const hasCritical = audit.status.hasMergeConflicts || audit.status.hasOpenPR;
            const prefix = hasCritical ? '🚨 ' : '';
            
            lines.push(`${prefix}${audit.packageName}:`);
            audit.issues.forEach(issue => {
                const icon = issue.includes('MERGE CONFLICTS') ? '⚠️ ' : issue.includes('PR') ? '📋 ' : '❌ ';
                lines.push(`   ${icon}${issue}`);
            });
            audit.fixes.forEach(fix => {
                lines.push(`   💡 Fix: ${fix}`);
            });
            lines.push('');
        });
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
}

/**
 * Auto-sync a package's branch with remote
 */
export async function autoSyncBranch(
    packagePath: string,
    options: {
        push?: boolean;
        pull?: boolean;
        checkout?: string;
    } = {}
): Promise<{ success: boolean; actions: string[]; error?: string }> {
    const logger = getLogger();
    const originalCwd = process.cwd();
    const actions: string[] = [];

    try {
        process.chdir(packagePath);

        // Checkout if requested
        if (options.checkout) {
            logger.verbose(`Checking out ${options.checkout}...`);
            await run(`git checkout ${options.checkout}`);
            actions.push(`Checked out ${options.checkout}`);
        }

        // Pull if requested
        if (options.pull) {
            logger.verbose(`Pulling from remote...`);
            try {
                await run('git pull --ff-only');
                actions.push('Pulled from remote');
            } catch (error: any) {
                if (error.message.includes('not possible to fast-forward')) {
                    logger.warn(`Cannot fast-forward, may need manual merge`);
                    return { success: false, actions, error: 'Fast-forward not possible' };
                }
                throw error;
            }
        }

        // Push if requested
        if (options.push) {
            logger.verbose(`Pushing to remote...`);
            await run('git push');
            actions.push('Pushed to remote');
        }

        return { success: true, actions };
    } catch (error: any) {
        logger.error(`Failed to auto-sync ${packagePath}: ${error.message}`);
        return { success: false, actions, error: error.message };
    } finally {
        process.chdir(originalCwd);
    }
}

