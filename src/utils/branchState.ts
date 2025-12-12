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

export interface VersionStatus {
    version: string;
    isValid: boolean;
    issue?: string;
    fix?: string;
}

export interface TargetBranchSyncStatus {
    targetBranch: string;
    localExists: boolean;
    remoteExists: boolean;
    localSha?: string;
    remoteSha?: string;
    exactMatch: boolean;
    canFastForward: boolean;
    needsReset: boolean;
    error?: string;
}

export interface PackageBranchAudit {
    packageName: string;
    path: string;
    status: BranchStatus;
    versionStatus?: VersionStatus;
    targetBranchSync?: TargetBranchSyncStatus;
    issues: string[];
    fixes: string[];
}

export interface BranchAuditResult {
    totalPackages: number;
    goodPackages: number;
    issuesFound: number;
    versionIssues: number;
    targetBranchSyncIssues: number;
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
                logger.verbose(`    Fetching latest from origin for ${packagePath}...`);
                await run('git fetch origin --quiet');

                logger.verbose(`    Checking for merge conflicts with ${targetBranch}...`);
                // Use git merge-tree to test for conflicts without actually merging
                const { stdout: mergeTree } = await run(`git merge-tree $(git merge-base ${branch} origin/${targetBranch}) ${branch} origin/${targetBranch}`);

                // If merge-tree output contains conflict markers, there are conflicts
                if (mergeTree.includes('<<<<<<<') || mergeTree.includes('=======') || mergeTree.includes('>>>>>>>')) {
                    hasMergeConflicts = true;
                    conflictsWith = targetBranch;
                    logger.verbose(`    ⚠️  Merge conflicts detected with ${targetBranch}`);
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
                logger.verbose(`    Checking GitHub for existing PRs...`);
                const { findOpenPullRequestByHeadRef } = await import('@eldrforge/github-tools');
                const pr = await findOpenPullRequestByHeadRef(branch);
                if (pr) {
                    hasOpenPR = true;
                    prUrl = pr.html_url;
                    prNumber = pr.number;
                    logger.verbose(`    Found existing PR #${prNumber}: ${prUrl}`);
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
 * Check if target branch (e.g., main) is exactly in sync with remote
 */
export async function checkTargetBranchSync(
    packagePath: string,
    targetBranch: string = 'main'
): Promise<TargetBranchSyncStatus> {
    const logger = getLogger();
    const originalCwd = process.cwd();

    try {
        process.chdir(packagePath);

        // Fetch latest from origin to ensure we have current info
        try {
            await run('git fetch origin --quiet');
        } catch (error: any) {
            logger.verbose(`Could not fetch from origin in ${packagePath}: ${error.message}`);
        }

        // Check if local target branch exists
        let localExists = false;
        let localSha: string | undefined;
        try {
            const { stdout } = await run(`git rev-parse --verify ${targetBranch}`);
            localSha = stdout.trim();
            localExists = true;
        } catch {
            localExists = false;
        }

        // Check if remote target branch exists
        let remoteExists = false;
        let remoteSha: string | undefined;
        try {
            const { stdout } = await run(`git ls-remote origin ${targetBranch}`);
            if (stdout.trim()) {
                remoteSha = stdout.split(/\s+/)[0];
                remoteExists = true;
            }
        } catch {
            remoteExists = false;
        }

        // Determine sync status
        const exactMatch = localExists && remoteExists && localSha === remoteSha;
        let canFastForward = false;
        let needsReset = false;

        if (localExists && remoteExists && !exactMatch) {
            // Check if local is ancestor of remote (can fast-forward)
            try {
                await run(`git merge-base --is-ancestor ${targetBranch} origin/${targetBranch}`);
                canFastForward = true;
                needsReset = false;
            } catch {
                // Local is not ancestor of remote, need reset
                canFastForward = false;
                needsReset = true;
            }
        }

        return {
            targetBranch,
            localExists,
            remoteExists,
            localSha,
            remoteSha,
            exactMatch,
            canFastForward,
            needsReset,
        };
    } catch (error: any) {
        return {
            targetBranch,
            localExists: false,
            remoteExists: false,
            exactMatch: false,
            canFastForward: false,
            needsReset: false,
            error: error.message,
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
        checkVersions?: boolean;
    } = {}
): Promise<BranchAuditResult> {
    const logger = getLogger();
    const audits: PackageBranchAudit[] = [];
    const targetBranch = options.targetBranch || 'main';
    const checkPR = options.checkPR !== false; // Default true
    const checkConflicts = options.checkConflicts !== false; // Default true
    const checkVersions = options.checkVersions !== false; // Default true

    logger.info(`BRANCH_STATE_AUDIT: Auditing branch state for packages | Package Count: ${packages.length} | Purpose: Verify synchronization`);

    // If no expected branch specified, find the most common branch
    let actualExpectedBranch = expectedBranch;
    if (!expectedBranch) {
        const branchCounts = new Map<string, number>();

        logger.info('📋 Phase 1/2: Detecting most common branch across packages...');

        // First pass: collect all branch names
        for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            logger.info(`  [${i + 1}/${packages.length}] Checking branch: ${pkg.name}`);
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

        logger.info(`✓ Most common branch: ${actualExpectedBranch} (${maxCount}/${packages.length} packages)`);
    }

    logger.info(`\n📋 Phase 2/2: Auditing package state (checking git status, conflicts, PRs, versions)...`);
    for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        logger.info(`  [${i + 1}/${packages.length}] Auditing: ${pkg.name}`);

        const status = await checkBranchStatus(
            pkg.path,
            actualExpectedBranch,
            targetBranch,
            checkPR
        );
        const issues: string[] = [];
        const fixes: string[] = [];
        let versionStatus: VersionStatus | undefined;

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

        // Check version consistency if enabled
        if (checkVersions) {
            try {
                const { validateVersionForBranch } = await import('../util/general');
                const fs = await import('fs/promises');
                const pathModule = await import('path');

                const packageJsonPath = pathModule.join(pkg.path, 'package.json');
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(packageJsonContent);
                const version = packageJson.version;

                const validation = validateVersionForBranch(version, status.name);

                versionStatus = {
                    version,
                    isValid: validation.valid,
                    issue: validation.issue,
                    fix: validation.fix
                };

                if (!validation.valid) {
                    issues.push(`Version: ${version} - ${validation.issue}`);
                    fixes.push(`cd ${pkg.path} && kodrdriv development  # ${validation.fix}`);
                }
            } catch (error: any) {
                logger.verbose(`Could not check version for ${pkg.name}: ${error.message}`);
            }
        }

        // Check target branch sync (e.g., is local main exactly in sync with remote main?)
        const targetBranchSync = await checkTargetBranchSync(pkg.path, targetBranch);

        if (targetBranchSync.localExists && targetBranchSync.remoteExists && !targetBranchSync.exactMatch) {
            if (targetBranchSync.needsReset) {
                issues.push(`Target branch '${targetBranch}' is NOT in sync with remote (local has diverged)`);
                fixes.push(`cd ${pkg.path} && git checkout ${targetBranch} && git reset --hard origin/${targetBranch} && git checkout ${status.name}`);
            } else if (targetBranchSync.canFastForward) {
                issues.push(`Target branch '${targetBranch}' is behind remote (can fast-forward)`);
                fixes.push(`cd ${pkg.path} && git checkout ${targetBranch} && git pull origin ${targetBranch} && git checkout ${status.name}`);
            } else {
                issues.push(`Target branch '${targetBranch}' is NOT in exact sync with remote`);
                fixes.push(`cd ${pkg.path} && git checkout ${targetBranch} && git pull origin ${targetBranch} && git checkout ${status.name}`);
            }
        } else if (!targetBranchSync.localExists && targetBranchSync.remoteExists) {
            // Local target branch doesn't exist (this is OK - will be created during publish)
            logger.verbose(`Local ${targetBranch} doesn't exist in ${pkg.name} - will be created when needed`);
        } else if (targetBranchSync.error) {
            logger.verbose(`Could not check target branch sync for ${pkg.name}: ${targetBranchSync.error}`);
        }

        audits.push({
            packageName: pkg.name,
            path: pkg.path,
            status,
            versionStatus,
            targetBranchSync,
            issues,
            fixes,
        });
    }

    const issuesFound = audits.filter(a => a.issues.length > 0).length;
    const versionIssues = audits.filter(a => a.versionStatus && !a.versionStatus.isValid).length;
    const targetBranchSyncIssues = audits.filter(a => a.targetBranchSync && !a.targetBranchSync.exactMatch && a.targetBranchSync.localExists && a.targetBranchSync.remoteExists).length;
    const goodPackages = audits.filter(a => a.issues.length === 0).length;

    logger.info(`✓ Audit complete: ${goodPackages}/${packages.length} packages have no issues`);
    if (issuesFound > 0) {
        logger.info(`  Issues found in ${issuesFound} package(s)`);
    }

    return {
        totalPackages: packages.length,
        goodPackages,
        issuesFound,
        versionIssues,
        targetBranchSyncIssues,
        audits,
    };
}

/**
 * Format audit results for display with detailed fix instructions
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
            const versionInfo = audit.versionStatus ? ` (v${audit.versionStatus.version})` : '';
            lines.push(`   ${audit.packageName}${versionInfo}`);
        });

        if (goodAudits.length > displayCount) {
            lines.push(`   ... and ${goodAudits.length - displayCount} more`);
        }
        lines.push('');
    }

    // Show version issues prominently if any
    if (result.versionIssues > 0) {
        lines.push(`⚠️  Version Issues (${result.versionIssues} package${result.versionIssues === 1 ? '' : 's'}):`);

        const versionIssueAudits = result.audits.filter(a => a.versionStatus && !a.versionStatus.isValid);
        versionIssueAudits.forEach(audit => {
            lines.push(`   ${audit.packageName}`);
            lines.push(`   - Branch: ${audit.status.name}`);
            lines.push(`   - Version: ${audit.versionStatus!.version}`);
            lines.push(`   - Issue: ${audit.versionStatus!.issue}`);
            lines.push(`   - Fix: ${audit.versionStatus!.fix}`);
            lines.push('');
        });
    }

    // Show target branch sync issues prominently if any
    if (result.targetBranchSyncIssues > 0) {
        lines.push(`🚨 Target Branch Sync Issues (${result.targetBranchSyncIssues} package${result.targetBranchSyncIssues === 1 ? '' : 's'}):`);
        lines.push(`   ⚠️  ${result.targetBranchSyncIssues} package${result.targetBranchSyncIssues === 1 ? '' : 's'} with target branch NOT in sync with remote`);
        lines.push(`   This will cause "branch out of sync" errors during parallel publish!`);
        lines.push('');

        const targetSyncIssueAudits = result.audits.filter(a => a.targetBranchSync && !a.targetBranchSync.exactMatch && a.targetBranchSync.localExists && a.targetBranchSync.remoteExists);
        targetSyncIssueAudits.forEach(audit => {
            const sync = audit.targetBranchSync!;
            lines.push(`   ${audit.packageName}`);
            lines.push(`   - Target Branch: ${sync.targetBranch}`);
            lines.push(`   - Local SHA:  ${sync.localSha?.substring(0, 8)}...`);
            lines.push(`   - Remote SHA: ${sync.remoteSha?.substring(0, 8)}...`);
            if (sync.needsReset) {
                lines.push(`   - Action: RESET REQUIRED (local has diverged)`);
            } else if (sync.canFastForward) {
                lines.push(`   - Action: Pull to fast-forward`);
            }
            lines.push('');
        });
    }

    if (result.issuesFound > 0) {
        // Count critical issues (merge conflicts, existing PRs, target branch sync)
        const conflictCount = result.audits.filter(a => a.status.hasMergeConflicts).length;
        const prCount = result.audits.filter(a => a.status.hasOpenPR).length;
        const branchInconsistentCount = result.audits.filter(a => !a.status.isOnExpectedBranch).length;
        const unpushedCount = result.audits.filter(a => a.status.hasUnpushedCommits).length;
        const behindCount = result.audits.filter(a => a.status.needsSync).length;
        const noRemoteCount = result.audits.filter(a => !a.status.remoteExists).length;

        if (conflictCount > 0 || prCount > 0 || result.targetBranchSyncIssues > 0) {
            lines.push(`🚨 CRITICAL ISSUES:`);
            if (result.targetBranchSyncIssues > 0) {
                lines.push(`   🔄 ${result.targetBranchSyncIssues} package${result.targetBranchSyncIssues === 1 ? '' : 's'} with target branch sync issues`);
            }
            if (conflictCount > 0) {
                lines.push(`   ⚠️  ${conflictCount} package${conflictCount === 1 ? '' : 's'} with merge conflicts`);
            }
            if (prCount > 0) {
                lines.push(`   📋 ${prCount} package${prCount === 1 ? '' : 's'} with existing PRs`);
            }
            lines.push('');
        }

        lines.push(`⚠️  Issues Summary:`);
        if (result.targetBranchSyncIssues > 0) lines.push(`   • ${result.targetBranchSyncIssues} target branch sync issue${result.targetBranchSyncIssues === 1 ? '' : 's'}`);
        if (conflictCount > 0) lines.push(`   • ${conflictCount} merge conflict${conflictCount === 1 ? '' : 's'}`);
        if (prCount > 0) lines.push(`   • ${prCount} existing PR${prCount === 1 ? '' : 's'}`);
        if (branchInconsistentCount > 0) lines.push(`   • ${branchInconsistentCount} branch inconsistenc${branchInconsistentCount === 1 ? 'y' : 'ies'}`);
        if (unpushedCount > 0) lines.push(`   • ${unpushedCount} package${unpushedCount === 1 ? '' : 's'} with unpushed commits`);
        if (behindCount > 0) lines.push(`   • ${behindCount} package${behindCount === 1 ? '' : 's'} behind remote`);
        if (noRemoteCount > 0) lines.push(`   • ${noRemoteCount} package${noRemoteCount === 1 ? '' : 's'} with no remote branch`);
        lines.push('');

        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📋 DETAILED ISSUES AND FIXES:');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');

        // Sort issues by severity: conflicts first, then PRs, then others
        const auditsWithIssues = result.audits.filter(a => a.issues.length > 0);
        const sortedAudits = auditsWithIssues.sort((a, b) => {
            const aScore = (a.status.hasMergeConflicts ? 1000 : 0) + (a.status.hasOpenPR ? 100 : 0);
            const bScore = (b.status.hasMergeConflicts ? 1000 : 0) + (b.status.hasOpenPR ? 100 : 0);
            return bScore - aScore;
        });

        sortedAudits.forEach((audit, index) => {
            // Highlight critical issues
            const hasCritical = audit.status.hasMergeConflicts || audit.status.hasOpenPR;
            const prefix = hasCritical ? '🚨 CRITICAL' : '⚠️  WARNING';

            lines.push(`${prefix} [${index + 1}/${sortedAudits.length}] ${audit.packageName}`);
            lines.push(`Location: ${audit.path}`);
            lines.push(`Branch: ${audit.status.name}`);

            if (audit.status.remoteExists) {
                const syncStatus = [];
                if (audit.status.ahead > 0) syncStatus.push(`ahead ${audit.status.ahead}`);
                if (audit.status.behind > 0) syncStatus.push(`behind ${audit.status.behind}`);
                if (syncStatus.length > 0) {
                    lines.push(`Sync: ${syncStatus.join(', ')}`);
                }
            } else {
                lines.push(`Remote: Does not exist`);
            }

            lines.push('');
            lines.push('Issues:');
            audit.issues.forEach(issue => {
                const icon = issue.includes('MERGE CONFLICTS') ? '⚠️ ' : issue.includes('PR') ? '📋 ' : '❌ ';
                lines.push(`  ${icon} ${issue}`);
            });

            lines.push('');
            lines.push('Fix Commands (execute in order):');
            audit.fixes.forEach((fix, fixIndex) => {
                lines.push(`  ${fixIndex + 1}. ${fix}`);
            });

            // Add context-specific guidance
            if (audit.status.hasMergeConflicts) {
                lines.push('');
                lines.push('  ⚠️  Merge Conflict Resolution:');
                lines.push('     After running the merge command above, you will need to:');
                lines.push('     a) Manually edit conflicting files to resolve conflicts');
                lines.push('     b) Stage resolved files: git add <file>');
                lines.push('     c) Complete the merge: git commit');
                lines.push('     d) Push the resolved merge: git push origin ' + audit.status.name);
                lines.push('     e) Re-run audit to verify: kodrdriv tree publish --audit-branches');
            }

            if (audit.status.hasOpenPR) {
                lines.push('');
                lines.push('  📋 Existing PR Handling:');
                lines.push('     You have options:');
                lines.push('     a) Continue with existing PR (kodrdriv publish will detect and use it)');
                lines.push('     b) Close the PR if no longer needed');
                lines.push('     c) Merge the PR if ready, then create new one');
            }

            lines.push('');
            lines.push('─────────────────────────────────────────────────────────────');
            lines.push('');
        });

        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📝 RECOMMENDED WORKFLOW:');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');

        let stepNumber = 1;

        // Target branch sync is FIRST and most critical
        if (result.targetBranchSyncIssues > 0) {
            lines.push(`${stepNumber}️⃣  SYNC TARGET BRANCHES (CRITICAL - Do this FIRST):`);
            stepNumber++;
            const targetSyncIssueAudits = result.audits.filter(a => a.targetBranchSync && !a.targetBranchSync.exactMatch && a.targetBranchSync.localExists && a.targetBranchSync.remoteExists);
            targetSyncIssueAudits.forEach(audit => {
                const sync = audit.targetBranchSync!;
                if (sync.needsReset) {
                    lines.push(`   • ${audit.packageName}: cd ${audit.path} && git checkout ${sync.targetBranch} && git reset --hard origin/${sync.targetBranch} && git checkout ${audit.status.name}`);
                } else {
                    lines.push(`   • ${audit.packageName}: cd ${audit.path} && git checkout ${sync.targetBranch} && git pull origin ${sync.targetBranch} && git checkout ${audit.status.name}`);
                }
            });
            lines.push('');
        }

        if (conflictCount > 0) {
            lines.push(`${stepNumber}️⃣  RESOLVE MERGE CONFLICTS FIRST (blocking):`);
            stepNumber++;
            sortedAudits.filter(a => a.status.hasMergeConflicts).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && git merge origin/${audit.status.conflictsWith}`);
            });
            lines.push('   Then resolve conflicts, commit, and push.');
            lines.push('');
        }

        if (result.versionIssues > 0) {
            lines.push(`${stepNumber}️⃣  FIX VERSION ISSUES (recommended before publish):`);
            stepNumber++;
            sortedAudits.filter(a => a.versionStatus && !a.versionStatus.isValid).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && kodrdriv development`);
            });
            lines.push('');
        }

        if (prCount > 0) {
            lines.push(`${stepNumber}️⃣  HANDLE EXISTING PRS:`);
            stepNumber++;
            sortedAudits.filter(a => a.status.hasOpenPR).forEach(audit => {
                lines.push(`   • ${audit.packageName}: Review ${audit.status.prUrl}`);
                lines.push(`     Option: Continue (publish will reuse PR) or close/merge it first`);
            });
            lines.push('');
        }

        if (branchInconsistentCount > 0) {
            lines.push(`${stepNumber}️⃣  ALIGN BRANCHES (if needed):`);
            stepNumber++;
            sortedAudits.filter(a => !a.status.isOnExpectedBranch).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && git checkout ${audit.status.expectedBranch}`);
            });
            lines.push('');
        }

        if (behindCount > 0) {
            lines.push(`${stepNumber}️⃣  SYNC WITH REMOTE:`);
            stepNumber++;
            sortedAudits.filter(a => a.status.needsSync && !a.status.hasMergeConflicts).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && git pull origin ${audit.status.name}`);
            });
            lines.push('');
        }

        if (unpushedCount > 0) {
            lines.push(`${stepNumber}️⃣  PUSH LOCAL COMMITS:`);
            stepNumber++;
            sortedAudits.filter(a => a.status.hasUnpushedCommits && !a.status.hasMergeConflicts).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && git push origin ${audit.status.name}`);
            });
            lines.push('');
        }

        if (noRemoteCount > 0) {
            lines.push(`${stepNumber}️⃣  CREATE REMOTE BRANCHES:`);
            stepNumber++;
            sortedAudits.filter(a => !a.status.remoteExists).forEach(audit => {
                lines.push(`   • ${audit.packageName}: cd ${audit.path} && git push -u origin ${audit.status.name}`);
            });
            lines.push('');
        }

        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');
        lines.push('🔄 After fixing issues, re-run audit to verify:');
        lines.push('   kodrdriv tree publish --audit-branches');
        lines.push('');
        lines.push('✅ Once all clear, proceed with publish:');
        lines.push('   kodrdriv tree publish --parallel --model "gpt-5-mini"');
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
                    logger.warn(`BRANCH_STATE_NO_FAST_FORWARD: Cannot fast-forward merge | Reason: Divergent history | Resolution: May need manual merge`);
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
        logger.error(`BRANCH_STATE_AUTO_SYNC_FAILED: Failed to auto-sync package | Path: ${packagePath} | Error: ${error.message}`);
        return { success: false, actions, error: error.message };
    } finally {
        process.chdir(originalCwd);
    }
}

