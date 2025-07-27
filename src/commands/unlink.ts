/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import { getLogger, getDryRunLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { safeJsonParse, validateLinkBackup, type LinkBackup } from '../util/validation';
import { run } from '../util/child';
import {
    PerformanceTimer,
    PackageJson,
    PackageJsonLocation,
    findAllPackageJsonFiles,
    scanDirectoryForPackages,
    checkForFileDependencies
} from '../util/performance';
import { smartNpmInstall } from '../util/npmOptimizations';

interface ExtendedPackageJson extends PackageJson {
    workspaces?: string[] | { packages?: string[] };
    overrides?: Record<string, any>;
    resolutions?: Record<string, any>;
}



interface ProblematicDependency {
    name: string;
    version: string;
    type: 'file:' | 'link:' | 'relative-path' | 'workspace' | 'override' | 'resolution';
    dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'workspaces' | 'overrides' | 'resolutions';
    packagePath: string;
    reason: string;
}

const EXCLUDED_DIRECTORIES = [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.git',
    '.next',
    '.nuxt',
    'out',
    'public',
    'static',
    'assets'
];



const findPackagesToUnlink = async (scopeRoots: Record<string, string>, storage: any): Promise<string[]> => {
    const logger = getLogger();
    const timer = PerformanceTimer.start(logger, 'Finding packages to unlink');
    const packagesToUnlink: string[] = [];

    logger.silly(`Finding packages to unlink from scope roots: ${JSON.stringify(scopeRoots)}`);

    // Scan all scope roots to build a comprehensive map of packages that should be unlinked
    const scopeTimer = PerformanceTimer.start(logger, 'Scanning all scope roots for packages to unlink');
    const allScopePackages = new Map<string, string>(); // packageName -> relativePath

    // Process all scopes in parallel for better performance
    const scopePromises = Object.entries(scopeRoots).map(async ([scope, rootDir]) => {
        logger.verbose(`Scanning scope ${scope} at root directory: ${rootDir}`);
        const scopePackages = await scanDirectoryForPackages(rootDir, storage);

        // Add packages from this scope to the overall map
        const scopeResults: Array<[string, string]> = [];
        for (const [packageName, packagePath] of scopePackages) {
            if (packageName.startsWith(scope)) {
                scopeResults.push([packageName, packagePath]);
                logger.debug(`Package to unlink: ${packageName} -> ${packagePath}`);
            }
        }
        return scopeResults;
    });

    const allScopeResults = await Promise.all(scopePromises);

    // Flatten results and collect package names
    for (const scopeResults of allScopeResults) {
        for (const [packageName, packagePath] of scopeResults) {
            allScopePackages.set(packageName, packagePath);
            packagesToUnlink.push(packageName);
        }
    }

    scopeTimer.end(`Scanned ${Object.keys(scopeRoots).length} scope roots, found ${packagesToUnlink.length} packages to unlink`);

    timer.end(`Found ${packagesToUnlink.length} packages to unlink`);
    return packagesToUnlink;
};

const readLinkBackup = async (storage: any): Promise<LinkBackup> => {
    const backupPath = path.join(process.cwd(), '.kodrdriv-link-backup.json');
    if (await storage.exists(backupPath)) {
        try {
            const content = await storage.readFile(backupPath, 'utf-8');
            const parsed = safeJsonParse(content, 'link backup file');
            return validateLinkBackup(parsed);
        } catch (error) {
            throw new Error(`Failed to parse link backup file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    return {};
};

const writeLinkBackup = async (backup: LinkBackup, storage: any): Promise<void> => {
    const backupPath = path.join(process.cwd(), '.kodrdriv-link-backup.json');
    if (Object.keys(backup).length === 0) {
        // Remove backup file if empty
        if (await storage.exists(backupPath)) {
            await storage.deleteFile(backupPath);
        }
    } else {
        await storage.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
    }
};

const restorePackageJson = async (
    packageJsonLocation: PackageJsonLocation,
    packagesToUnlink: string[],
    backup: LinkBackup,
    storage: any
): Promise<number> => {
    const logger = getLogger();
    let restoredCount = 0;
    const { packageJson, path: packageJsonPath, relativePath } = packageJsonLocation;

    // Restore original versions from backup
    for (const packageName of packagesToUnlink) {
        const backupKey = `${relativePath}:${packageName}`;
        const backupEntry = backup[backupKey];

        if (!backupEntry) {
            logger.debug(`No backup found for ${backupKey}, skipping`);
            continue;
        }

        const currentDeps = (packageJson as any)[backupEntry.dependencyType];
        if (currentDeps && currentDeps[packageName]?.startsWith('file:')) {
            // Restore the original version
            currentDeps[packageName] = backupEntry.originalVersion;
            restoredCount++;
            logger.verbose(`Restored ${relativePath}/${backupEntry.dependencyType}.${packageName}: file:... -> ${backupEntry.originalVersion}`);

            // Remove from backup
            delete backup[backupKey];
        }
    }

    // NOTE: Don't write the file here - let the caller handle all modifications
    return restoredCount;
};

/**
 * Comprehensive scan for all types of problematic dependencies that could cause GitHub build failures
 */
const scanForProblematicDependencies = (packageJsonFiles: PackageJsonLocation[]): ProblematicDependency[] => {
    const logger = getLogger();
    const timer = PerformanceTimer.start(logger, 'Scanning for problematic dependencies');
    const problematicDeps: ProblematicDependency[] = [];

    for (const { path: packagePath, packageJson, relativePath } of packageJsonFiles) {
        const extendedPackageJson = packageJson as ExtendedPackageJson;

        // Check dependencies, devDependencies, peerDependencies
        const depTypes: Array<keyof Pick<ExtendedPackageJson, 'dependencies' | 'devDependencies' | 'peerDependencies'>> = [
            'dependencies', 'devDependencies', 'peerDependencies'
        ];

        for (const depType of depTypes) {
            const deps = extendedPackageJson[depType];
            if (!deps) continue;

            for (const [name, version] of Object.entries(deps)) {
                let problemType: ProblematicDependency['type'] | null = null;
                let reason = '';

                // Check for file: dependencies
                if (version.startsWith('file:')) {
                    problemType = 'file:';
                    reason = 'File dependencies cause build failures in CI/CD environments';
                }
                // Check for link: dependencies
                else if (version.startsWith('link:')) {
                    problemType = 'link:';
                    reason = 'Link dependencies are not resolvable in remote environments';
                }
                // Check for relative path patterns that could be problematic
                else if (version.includes('../') || version.includes('./') || version.startsWith('/')) {
                    problemType = 'relative-path';
                    reason = 'Relative path dependencies are not resolvable in different environments';
                }
                // Check for workspace protocol (used by some package managers)
                else if (version.startsWith('workspace:')) {
                    problemType = 'workspace';
                    reason = 'Workspace protocol dependencies require workspace configuration';
                }

                if (problemType) {
                    problematicDeps.push({
                        name,
                        version,
                        type: problemType,
                        dependencyType: depType,
                        packagePath: relativePath,
                        reason
                    });
                }
            }
        }

        // Check workspace configurations
        if (extendedPackageJson.workspaces) {
            problematicDeps.push({
                name: 'workspaces',
                version: JSON.stringify(extendedPackageJson.workspaces),
                type: 'workspace',
                dependencyType: 'workspaces',
                packagePath: relativePath,
                reason: 'Workspace configurations can cause issues when published to npm'
            });
        }

        // Check overrides (npm 8.3+)
        if (extendedPackageJson.overrides) {
            for (const [name, override] of Object.entries(extendedPackageJson.overrides)) {
                if (typeof override === 'string' && (override.startsWith('file:') || override.startsWith('link:') || override.includes('../'))) {
                    problematicDeps.push({
                        name,
                        version: override,
                        type: 'override',
                        dependencyType: 'overrides',
                        packagePath: relativePath,
                        reason: 'Override configurations with local paths cause build failures'
                    });
                }
            }
        }

        // Check resolutions (Yarn)
        if (extendedPackageJson.resolutions) {
            for (const [name, resolution] of Object.entries(extendedPackageJson.resolutions)) {
                if (typeof resolution === 'string' && (resolution.startsWith('file:') || resolution.startsWith('link:') || resolution.includes('../'))) {
                    problematicDeps.push({
                        name,
                        version: resolution,
                        type: 'resolution',
                        dependencyType: 'resolutions',
                        packagePath: relativePath,
                        reason: 'Resolution configurations with local paths cause build failures'
                    });
                }
            }
        }
    }

    timer.end(`Found ${problematicDeps.length} problematic dependencies`);
    return problematicDeps;
};

/**
 * Enhanced function to display problematic dependencies with detailed information
 */
const displayProblematicDependencies = (problematicDeps: ProblematicDependency[]): void => {
    const logger = getLogger();

    if (problematicDeps.length === 0) {
        logger.info('✅ No problematic dependencies found');
        return;
    }

    logger.info('🔓 Found problematic dependencies that could cause GitHub build failures:');

    // Group by package path for better readability
    const grouped = problematicDeps.reduce((acc, dep) => {
        if (!acc[dep.packagePath]) {
            acc[dep.packagePath] = [];
        }
        acc[dep.packagePath].push(dep);
        return acc;
    }, {} as Record<string, ProblematicDependency[]>);

    for (const [packagePath, deps] of Object.entries(grouped)) {
        logger.info(`  📄 ${packagePath}:`);
        for (const dep of deps) {
            logger.info(`    ❌ ${dep.dependencyType}.${dep.name}: ${dep.version} (${dep.type})`);
            logger.info(`       💡 ${dep.reason}`);
        }
    }
};

/**
 * Verification step to ensure no problematic dependencies remain after cleanup
 */
const verifyCleanup = async (packageJsonFiles: PackageJsonLocation[]): Promise<boolean> => {
    const logger = getLogger();
    const timer = PerformanceTimer.start(logger, 'Verifying cleanup completion');

    const remainingProblems = scanForProblematicDependencies(packageJsonFiles);

    if (remainingProblems.length === 0) {
        logger.info('✅ Verification passed: No problematic dependencies remain');
        timer.end('Verification successful');
        return true;
    } else {
        logger.warn('⚠️ Verification failed: Found remaining problematic dependencies');
        displayProblematicDependencies(remainingProblems);
        timer.end('Verification failed');
        return false;
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || runConfig.unlink?.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const overallTimer = PerformanceTimer.start(logger, 'Unlink command execution');
    const storage = createStorage({ log: logger.info });

    logger.info('🔓 Unlinking workspace packages and cleaning up problematic dependencies...');

    // Get configuration
    const configTimer = PerformanceTimer.start(logger, 'Reading configuration');
    const scopeRoots = runConfig.unlink?.scopeRoots || runConfig.link?.scopeRoots || {};
    const workspaceFileName = runConfig.unlink?.workspaceFile || 'pnpm-workspace.yaml';
    configTimer.end('Configuration loaded');

    if (Object.keys(scopeRoots).length === 0) {
        logger.info('No scope roots configured. Skipping link management.');
        overallTimer.end('Unlink command (no scope roots)');
        return 'No scope roots configured. Skipping link management.';
    }

    // Find all package.json files in current directory tree
    const packageJsonFiles = await findAllPackageJsonFiles(process.cwd(), storage);

    if (packageJsonFiles.length === 0) {
        throw new Error('No package.json files found in current directory or subdirectories.');
    }

    logger.info(`Found ${packageJsonFiles.length} package.json file(s) to process`);
    logger.info(`Scanning ${Object.keys(scopeRoots).length} scope root(s): ${Object.keys(scopeRoots).join(', ')}`);

    // Comprehensive scan for all problematic dependencies
    const problematicDeps = scanForProblematicDependencies(packageJsonFiles);
    displayProblematicDependencies(problematicDeps);

    // Find packages to unlink based on scope roots
    const packagesToUnlinkNames = await findPackagesToUnlink(scopeRoots, storage);

    if (packagesToUnlinkNames.length === 0 && problematicDeps.length === 0) {
        logger.info('✅ No packages found matching scope roots for unlinking and no problematic dependencies detected.');
        overallTimer.end('Unlink command (nothing to clean)');
        return 'No packages found matching scope roots for unlinking and no problematic dependencies detected.';
    }

    logger.verbose(`Found ${packagesToUnlinkNames.length} packages that could be unlinked: ${packagesToUnlinkNames.join(', ')}`);

    // Read existing backup
    const backupTimer = PerformanceTimer.start(logger, 'Reading link backup');
    const backup = await readLinkBackup(storage);
    backupTimer.end('Link backup loaded');

    if (isDryRun) {
        logger.info('Would clean up problematic dependencies and restore original package.json dependencies');

        // Show what would be cleaned up
        let dryRunCount = 0;
        for (const packageName of packagesToUnlinkNames) {
            for (const { relativePath } of packageJsonFiles) {
                const backupKey = `${relativePath}:${packageName}`;
                const backupEntry = backup[backupKey];
                if (backupEntry) {
                    logger.verbose(`Would restore ${relativePath}/${packageName}: file:... -> ${backupEntry.originalVersion}`);
                    dryRunCount++;
                }
            }
        }

        // Show what problematic dependencies would be cleaned
        if (problematicDeps.length > 0) {
            logger.verbose(`Would clean up ${problematicDeps.length} problematic dependencies`);
        }

        overallTimer.end('Unlink command (dry run)');
        return `DRY RUN: Would unlink ${dryRunCount} dependency reference(s) and clean up ${problematicDeps.length} problematic dependencies across ${packageJsonFiles.length} package.json files`;
    } else {
        // Restore package.json files with original versions and clean up problematic dependencies
        let totalRestoredCount = 0;
        let totalCleanedCount = 0;

        for (const packageJsonLocation of packageJsonFiles) {
            const { packageJson, path: packageJsonPath, relativePath } = packageJsonLocation;
            let modified = false;

            // Restore from backup
            const restoredCount = await restorePackageJson(packageJsonLocation, packagesToUnlinkNames, backup, storage);
            totalRestoredCount += restoredCount;
            if (restoredCount > 0) modified = true;

            // Clean up problematic dependencies for this specific package
            const extendedPackageJson = packageJson as ExtendedPackageJson;

            // Remove workspace configurations
            if (extendedPackageJson.workspaces) {
                delete extendedPackageJson.workspaces;
                logger.verbose(`Removed workspace configuration from ${relativePath}`);
                modified = true;
                totalCleanedCount++;
            }

            // Clean overrides with problematic paths
            if (extendedPackageJson.overrides) {
                const cleanOverrides: Record<string, any> = {};
                let overridesModified = false;

                for (const [name, override] of Object.entries(extendedPackageJson.overrides)) {
                    if (typeof override === 'string' && (override.startsWith('file:') || override.startsWith('link:') || override.includes('../'))) {
                        logger.verbose(`Removed problematic override ${relativePath}/overrides.${name}: ${override}`);
                        overridesModified = true;
                        totalCleanedCount++;
                    } else {
                        cleanOverrides[name] = override;
                    }
                }

                if (overridesModified) {
                    if (Object.keys(cleanOverrides).length === 0) {
                        delete extendedPackageJson.overrides;
                    } else {
                        extendedPackageJson.overrides = cleanOverrides;
                    }
                    modified = true;
                }
            }

            // Clean resolutions with problematic paths
            if (extendedPackageJson.resolutions) {
                const cleanResolutions: Record<string, any> = {};
                let resolutionsModified = false;

                for (const [name, resolution] of Object.entries(extendedPackageJson.resolutions)) {
                    if (typeof resolution === 'string' && (resolution.startsWith('file:') || resolution.startsWith('link:') || resolution.includes('../'))) {
                        logger.verbose(`Removed problematic resolution ${relativePath}/resolutions.${name}: ${resolution}`);
                        resolutionsModified = true;
                        totalCleanedCount++;
                    } else {
                        cleanResolutions[name] = resolution;
                    }
                }

                if (resolutionsModified) {
                    if (Object.keys(cleanResolutions).length === 0) {
                        delete extendedPackageJson.resolutions;
                    } else {
                        extendedPackageJson.resolutions = cleanResolutions;
                    }
                    modified = true;
                }
            }

            // Save the modified package.json if any changes were made
            if (modified) {
                await storage.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
            }
        }

        // Save updated backup (with restored items removed)
        await writeLinkBackup(backup, storage);

        if (totalRestoredCount === 0 && totalCleanedCount === 0) {
            logger.info('✅ No problematic dependencies were found to clean up.');
            overallTimer.end('Unlink command (nothing to clean)');
            return 'No problematic dependencies were found to clean up.';
        }

        logger.info(`Cleaned up ${totalRestoredCount} linked dependencies and ${totalCleanedCount} other problematic dependencies across ${packageJsonFiles.length} package.json file(s)`);

        // CRITICAL: Clean up package-lock.json to prevent GitHub build failures
        // The lock file may still contain file: references even after restoring package.json
        logger.info('🧹 Cleaning up package-lock.json to remove any stale file references...');
        const packageLockPath = path.join(process.cwd(), 'package-lock.json');
        if (await storage.exists(packageLockPath)) {
            await storage.deleteFile(packageLockPath);
            logger.info('🗑️ Deleted package-lock.json to ensure clean state');
        }

        // Optionally clean up node_modules for thorough cleanup
        const cleanNodeModules = runConfig.unlink?.cleanNodeModules !== false; // default to true
        if (cleanNodeModules) {
            logger.info('🧹 Cleaning up node_modules for complete fresh start...');
            const nodeModulesPath = path.join(process.cwd(), 'node_modules');
            if (await storage.exists(nodeModulesPath)) {
                try {
                    await storage.removeDirectory(nodeModulesPath);
                    logger.info('🗑️ Deleted node_modules directory');
                } catch (error: any) {
                    logger.warn(`Could not delete node_modules (${error.message}), continuing...`);
                }
            }
        }

        // Re-read package.json files for verification
        const updatedPackageJsonFiles = await findAllPackageJsonFiles(process.cwd(), storage);

        // Verification step
        const verificationPassed = await verifyCleanup(updatedPackageJsonFiles);

        if (!verificationPassed) {
            logger.warn('⚠️ Some problematic dependencies may still remain. Please review the output above.');
        }

        // Rebuild dependencies with fresh install (NOT npm ci to avoid using stale lock file)
        logger.info('⏳ Running fresh npm install to regenerate clean dependencies (this may take a moment)...');
        try {
            const installResult = await smartNpmInstall({
                skipIfNotNeeded: false, // Always install after unlinking changes
                preferCi: false, // NEVER use npm ci here - we need fresh npm install to regenerate lock file
                verbose: false
            });

            if (installResult.skipped) {
                logger.info(`⚡ Dependencies were up to date (${installResult.method})`);
            } else {
                logger.info(`✅ Dependencies rebuilt cleanly using ${installResult.method} (${installResult.duration}ms)`);
            }
        } catch (error) {
            logger.warn(`Failed to rebuild dependencies: ${error}. You may need to run 'npm install' manually.`);
        }

        const summary = `Successfully cleaned up ${totalRestoredCount} linked dependencies and ${totalCleanedCount} other problematic dependencies across ${packageJsonFiles.length} package.json file(s)`;
        overallTimer.end('Unlink command completed');
        return summary;
    }
};
