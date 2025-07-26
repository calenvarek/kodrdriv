/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { run } from '../util/child';
import {
    PerformanceTimer,
    PackageJson,
    PackageJsonLocation,
    findAllPackageJsonFiles,
    findPackagesByScope,
    collectAllDependencies,
    checkForFileDependencies
} from '../util/performance';
import { smartNpmInstall } from '../util/npmOptimizations';

interface LinkBackup {
    [packageName: string]: {
        originalVersion: string;
        dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies';
        relativePath: string;
    };
}

// Local functions remain for backup and package.json manipulation

const readLinkBackup = async (storage: any): Promise<LinkBackup> => {
    const backupPath = path.join(process.cwd(), '.kodrdriv-link-backup.json');
    if (await storage.exists(backupPath)) {
        try {
            const content = await storage.readFile(backupPath, 'utf-8');
            return JSON.parse(content) as LinkBackup;
        } catch (error) {
            // If backup is corrupted, start fresh
            return {};
        }
    }
    return {};
};

const writeLinkBackup = async (backup: LinkBackup, storage: any): Promise<void> => {
    const backupPath = path.join(process.cwd(), '.kodrdriv-link-backup.json');
    await storage.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
};

const updatePackageJson = async (
    packageJsonLocation: PackageJsonLocation,
    packagesToLink: Map<string, string>,
    backup: LinkBackup,
    storage: any
): Promise<number> => {
    const logger = getLogger();
    let linksCreated = 0;
    const { packageJson, path: packageJsonPath, relativePath } = packageJsonLocation;

    // Backup original versions and update to file: paths
    for (const [packageName, packagePath] of packagesToLink.entries()) {
        // Calculate relative path from this package.json to the target package
        const packageJsonDir = path.dirname(packageJsonPath);
        const absoluteTargetPath = path.resolve(process.cwd(), packagePath);
        const relativeToPackage = path.relative(packageJsonDir, absoluteTargetPath);
        const filePath = `file:${relativeToPackage}`;

        let updated = false;

        if (packageJson.dependencies?.[packageName]) {
            const backupKey = `${relativePath}:${packageName}`;
            backup[backupKey] = {
                originalVersion: packageJson.dependencies[packageName],
                dependencyType: 'dependencies',
                relativePath: packageJsonPath
            };
            packageJson.dependencies[packageName] = filePath;
            updated = true;
            logger.verbose(`Updated ${relativePath}/dependencies.${packageName}: ${backup[backupKey].originalVersion} -> ${filePath}`);
        } else if (packageJson.devDependencies?.[packageName]) {
            const backupKey = `${relativePath}:${packageName}`;
            backup[backupKey] = {
                originalVersion: packageJson.devDependencies[packageName],
                dependencyType: 'devDependencies',
                relativePath: packageJsonPath
            };
            packageJson.devDependencies[packageName] = filePath;
            updated = true;
            logger.verbose(`Updated ${relativePath}/devDependencies.${packageName}: ${backup[backupKey].originalVersion} -> ${filePath}`);
        } else if (packageJson.peerDependencies?.[packageName]) {
            const backupKey = `${relativePath}:${packageName}`;
            backup[backupKey] = {
                originalVersion: packageJson.peerDependencies[packageName],
                dependencyType: 'peerDependencies',
                relativePath: packageJsonPath
            };
            packageJson.peerDependencies[packageName] = filePath;
            updated = true;
            logger.verbose(`Updated ${relativePath}/peerDependencies.${packageName}: ${backup[backupKey].originalVersion} -> ${filePath}`);
        }

        if (updated) {
            linksCreated++;
        }
    }

    if (linksCreated > 0) {
        await storage.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
    }

    return linksCreated;
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const overallTimer = PerformanceTimer.start(logger, 'Link command execution');
    const storage = createStorage({ log: logger.info });

    logger.info('🔗 Linking workspace packages...');

    // Get configuration
    const configTimer = PerformanceTimer.start(logger, 'Reading configuration');
    const scopeRoots = runConfig.link?.scopeRoots || {};
    const isDryRun = runConfig.dryRun || runConfig.link?.dryRun || false;
    configTimer.end('Configuration loaded');

    if (Object.keys(scopeRoots).length === 0) {
        logger.info('No scope roots configured. Skipping link management.');
        overallTimer.end('Link command (no scope roots)');
        return 'No scope roots configured. Skipping link management.';
    }

    // Find all package.json files in current directory tree
    const packageJsonFiles = await findAllPackageJsonFiles(process.cwd(), storage);

    if (packageJsonFiles.length === 0) {
        overallTimer.end('Link command (no package.json files)');
        throw new Error('No package.json files found in current directory or subdirectories.');
    }

    logger.info(`Found ${packageJsonFiles.length} package.json file(s) to process`);
    logger.info(`Scanning ${Object.keys(scopeRoots).length} scope root(s): ${Object.keys(scopeRoots).join(', ')}`);

    // Check if any package.json files already have file: dependencies (safety check)
    const safetyTimer = PerformanceTimer.start(logger, 'Safety check for existing file: dependencies');
    checkForFileDependencies(packageJsonFiles);
    safetyTimer.end('Safety check completed');

    // Collect all dependencies from all package.json files using optimized function
    const allDependencies = collectAllDependencies(packageJsonFiles);

    logger.verbose(`Found ${Object.keys(allDependencies).length} total unique dependencies across all package.json files`);

    // Find matching sibling packages
    const packagesToLink = await findPackagesByScope(allDependencies, scopeRoots, storage);

    if (packagesToLink.size === 0) {
        logger.info('✅ No matching sibling packages found for linking.');
        overallTimer.end('Link command (no packages to link)');
        return 'No matching sibling packages found for linking.';
    }

    logger.info(`Found ${packagesToLink.size} package(s) to link: ${[...packagesToLink.keys()].join(', ')}`);

    // Read existing backup
    const backupTimer = PerformanceTimer.start(logger, 'Reading link backup');
    const backup = await readLinkBackup(storage);
    backupTimer.end('Link backup loaded');

    if (isDryRun) {
        logger.info('DRY RUN: Would update package.json files with file: dependencies and run npm install');
        for (const { relativePath } of packageJsonFiles) {
            logger.verbose(`DRY RUN: Would process ${relativePath}/package.json`);
        }
        for (const [packageName, packagePath] of packagesToLink.entries()) {
            logger.verbose(`DRY RUN: Would link ${packageName} -> file:${packagePath}`);
        }
        overallTimer.end('Link command (dry run)');
        return `DRY RUN: Would link ${packagesToLink.size} packages across ${packageJsonFiles.length} package.json files`;
    } else {
        // Update all package.json files with file: dependencies
        const updateTimer = PerformanceTimer.start(logger, 'Updating package.json files');
        let totalLinksCreated = 0;
        for (const packageJsonLocation of packageJsonFiles) {
            const linksCreated = await updatePackageJson(packageJsonLocation, packagesToLink, backup, storage);
            totalLinksCreated += linksCreated;
        }
        updateTimer.end(`Updated ${packageJsonFiles.length} package.json files, created ${totalLinksCreated} links`);

        if (totalLinksCreated === 0) {
            logger.info('✅ No dependencies were linked (packages may not be referenced).');
            overallTimer.end('Link command (no links created)');
            return 'No dependencies were linked.';
        }

        // Save backup after all changes
        const saveTimer = PerformanceTimer.start(logger, 'Saving link backup');
        await writeLinkBackup(backup, storage);
        saveTimer.end('Link backup saved');
        logger.info(`Updated ${packageJsonFiles.length} package.json file(s) with file: dependencies`);

        // Run optimized npm install to create symlinks
        logger.info('⏳ Installing dependencies to create symlinks...');
        try {
            const installResult = await smartNpmInstall({
                skipIfNotNeeded: false, // Always install after linking changes
                preferCi: false, // Use npm install to handle new file: dependencies
                verbose: false
            });

            if (installResult.skipped) {
                logger.info(`⚡ Dependencies were up to date (${installResult.method})`);
            } else {
                logger.info(`✅ Links applied successfully using ${installResult.method} (${installResult.duration}ms)`);
            }
        } catch (error) {
            logger.warn(`Failed to install dependencies: ${error}. You may need to run 'npm install' manually.`);
        }

        const summary = `Successfully linked ${totalLinksCreated} dependency reference(s) across ${packageJsonFiles.length} package.json file(s):\n${[...packagesToLink.entries()].map(([name, path]) => `  - ${name}: file:${path}`).join('\n')}`;

        overallTimer.end('Link command execution completed');
        return summary;
    }
};
