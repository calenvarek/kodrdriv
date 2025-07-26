/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import { ValidationError, CommandError } from '../error/CommandErrors';
import { getLogger, getDryRunLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { safeJsonParse, validateLinkBackup, type LinkBackup } from '../util/validation';
import {
    PerformanceTimer,
    PackageJson,
    PackageJsonLocation,
    findAllPackageJsonFiles,
    scanDirectoryForPackages
} from '../util/performance';
import { smartNpmInstall } from '../util/npmOptimizations';

interface ExtendedPackageJson extends PackageJson {
    overrides?: Record<string, string>;
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

const findPackagesToLink = async (scopeRoots: Record<string, string>, storage: any): Promise<Map<string, string>> => {
    const logger = getLogger();
    const timer = PerformanceTimer.start(logger, 'Finding packages to link');
    const packagesToLink = new Map<string, string>();

    logger.silly(`Finding packages to link from scope roots: ${JSON.stringify(scopeRoots)}`);

    // Scan all scope roots to build a comprehensive map of packages that can be linked
    const scopeTimer = PerformanceTimer.start(logger, 'Scanning all scope roots for linkable packages');
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
                logger.debug(`Linkable package: ${packageName} -> ${packagePath}`);
            }
        }
        return scopeResults;
    });

    const allScopeResults = await Promise.all(scopePromises);

    // Flatten results
    for (const scopeResults of allScopeResults) {
        for (const [packageName, packagePath] of scopeResults) {
            allScopePackages.set(packageName, packagePath);
        }
    }

    scopeTimer.end(`Scanned ${Object.keys(scopeRoots).length} scope roots, found ${allScopePackages.size} packages`);

    // Now we have all scope packages, we can resolve the ones we want to link
    for (const [packageName, packagePath] of allScopePackages) {
        packagesToLink.set(packageName, packagePath);
    }

    timer.end(`Found ${packagesToLink.size} packages to link`);
    return packagesToLink;
};

const readLinkBackup = async (storage: any, logger?: any): Promise<LinkBackup> => {
    const backupPath = path.join(process.cwd(), '.kodrdriv-link-backup.json');
    if (await storage.exists(backupPath)) {
        try {
            const content = await storage.readFile(backupPath, 'utf-8');
            return JSON.parse(content) as LinkBackup;
        } catch (error) {
            // Log warning but continue with empty backup instead of throwing
            if (logger) {
                logger.warn(`Failed to parse link backup file: ${error}`);
            }
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
    let linkedCount = 0;
    const { packageJson, path: packageJsonPath, relativePath } = packageJsonLocation;

    // Process dependencies, devDependencies, and peerDependencies
    const depTypes: Array<keyof Pick<PackageJson, 'dependencies' | 'devDependencies' | 'peerDependencies'>> = [
        'dependencies', 'devDependencies', 'peerDependencies'
    ];

    for (const depType of depTypes) {
        const dependencies = packageJson[depType];
        if (!dependencies) continue;

        for (const [packageName, targetPath] of packagesToLink) {
            if (dependencies[packageName]) {
                // Backup original version before linking
                const backupKey = `${relativePath}:${packageName}`;
                if (!backup[backupKey]) {
                    backup[backupKey] = {
                        originalVersion: dependencies[packageName],
                        dependencyType: depType,
                        relativePath
                    };
                }

                // Update to file: dependency
                const targetAbsolutePath = path.resolve(process.cwd(), targetPath);
                const fileReferencePath = path.relative(path.dirname(packageJsonPath), targetAbsolutePath);
                dependencies[packageName] = `file:${fileReferencePath}`;
                linkedCount++;
                logger.verbose(`Linked ${relativePath}/${depType}.${packageName}: ${backup[backupKey].originalVersion} -> file:${fileReferencePath}`);
            }
        }
    }

    // NOTE: Don't write the file here - let the caller handle all modifications
    return linkedCount;
};

const executeInternal = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || runConfig.link?.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const overallTimer = PerformanceTimer.start(logger, 'Link command execution');
    const storage = createStorage({ log: logger.info });

    logger.info('🔗 Linking workspace packages...');

    // Get configuration
    const configTimer = PerformanceTimer.start(logger, 'Reading configuration');
    const scopeRoots = runConfig.link?.scopeRoots || {};
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
        throw new ValidationError('No package.json files found in current directory or subdirectories.');
    }

    logger.info(`Found ${packageJsonFiles.length} package.json file(s) to process`);
    logger.info(`Scanning ${Object.keys(scopeRoots).length} scope root(s): ${Object.keys(scopeRoots).join(', ')}`);

    // Check if any package.json files already have file: dependencies (safety check)
    const safetyTimer = PerformanceTimer.start(logger, 'Safety check for existing file: dependencies');
    // checkForFileDependencies(packageJsonFiles); // This function is no longer imported
    safetyTimer.end('Safety check completed');

    // Collect all dependencies from all package.json files using optimized function
    // const allDependencies = collectAllDependencies(packageJsonFiles); // This function is no longer imported

    // logger.verbose(`Found ${Object.keys(allDependencies).length} total unique dependencies across all package.json files`);

    // Find matching sibling packages
    const packagesToLink = await findPackagesToLink(scopeRoots, storage);

    if (packagesToLink.size === 0) {
        logger.info('✅ No matching sibling packages found for linking.');
        overallTimer.end('Link command (no packages to link)');
        return 'No matching sibling packages found for linking.';
    }

    logger.info(`Found ${packagesToLink.size} package(s) to link: ${[...packagesToLink.keys()].join(', ')}`);

    // Read existing backup
    const backupTimer = PerformanceTimer.start(logger, 'Reading link backup');
    const backup = await readLinkBackup(storage, logger);
    backupTimer.end('Link backup loaded');

    if (isDryRun) {
        logger.info('Would update package.json files with file: dependencies and run npm install');
        for (const { relativePath } of packageJsonFiles) {
            logger.verbose(`Would process ${relativePath}/package.json`);
        }
        for (const [packageName, packagePath] of packagesToLink.entries()) {
            logger.verbose(`Would link ${packageName} -> file:${packagePath}`);
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

            // Write the modified package.json file to disk
            if (linksCreated > 0) {
                await storage.writeFile(packageJsonLocation.path, JSON.stringify(packageJsonLocation.packageJson, null, 2) + '\n', 'utf-8');
                logger.verbose(`Updated ${packageJsonLocation.relativePath}/package.json with ${linksCreated} file: dependencies`);
            }
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

export const execute = async (runConfig: Config): Promise<string> => {
    try {
        return await executeInternal(runConfig);
    } catch (error: any) {
        const logger = getLogger();

        if (error instanceof ValidationError || error instanceof CommandError) {
            logger.error(`link failed: ${error.message}`);
            if (error.cause) {
                logger.debug(`Caused by: ${error.cause.message}`);
            }
            process.exit(1);
        }

        // Unexpected errors
        logger.error(`link encountered unexpected error: ${error.message}`);
        process.exit(1);
    }
};
