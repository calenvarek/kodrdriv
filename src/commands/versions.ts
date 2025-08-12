#!/usr/bin/env node
/**
 * Versions command - Update dependency versions in package.json files
 *
 * This command helps manage dependency versions across packages in a workspace.
 * It can update dependencies to use semantic versioning patterns (^, ~, etc.)
 * for packages within the same scope.
 *
 * Supported subcommands:
 * - minor: Updates all same-scope dependencies to use ^ (caret) range for minor updates
 */

import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { safeJsonParse, validatePackageJson } from '../util/validation';


interface PackageInfo {
    name: string;
    version: string;
    packageJsonPath: string;
}

/**
 * Discover all package.json files in the workspace
 */
const discoverPackages = async (
    directories: string[],
    logger: any
): Promise<PackageInfo[]> => {
    const storage = createStorage({ log: logger.info });
    const packages: PackageInfo[] = [];

    for (const directory of directories) {
        logger.verbose(`Scanning directory: ${directory}`);

        try {
            const packageJsonPath = path.join(directory, 'package.json');

            if (await storage.exists(packageJsonPath)) {
                const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
                const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
                const packageJson = validatePackageJson(parsed, packageJsonPath);

                if (packageJson.name) {
                    packages.push({
                        name: packageJson.name,
                        version: packageJson.version,
                        packageJsonPath
                    });
                    logger.verbose(`Found package: ${packageJson.name}@${packageJson.version}`);
                }
            } else {
                // Look for nested package.json files in subdirectories
                try {
                    const entries = await fs.readdir(directory, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                            const subDir = path.join(directory, entry.name);
                            const subPackages = await discoverPackages([subDir], logger);
                            packages.push(...subPackages);
                        }
                    }
                } catch (error) {
                    logger.debug(`Could not scan subdirectories in ${directory}: ${error}`);
                }
            }
        } catch (error: any) {
            logger.warn(`Failed to process ${directory}: ${error.message}`);
        }
    }

    return packages;
};

/**
 * Extract scope from package name (e.g., "@eldrforge/package" -> "@eldrforge")
 */
const getPackageScope = (packageName: string): string | null => {
    if (packageName.startsWith('@')) {
        const parts = packageName.split('/');
        if (parts.length >= 2) {
            return parts[0];
        }
    }
    return null;
};



/**
 * Normalize version string to major.minor format (remove patch version)
 */
const normalizeToMinorVersion = (versionString: string): string => {
    // Extract the version number, preserving any prefix (^, ~, >=, etc.)
    const match = versionString.match(/^([^0-9]*)([0-9]+\.[0-9]+)(\.[0-9]+)?(.*)$/);

    if (match) {
        const [, prefix, majorMinor, , suffix] = match;
        return `${prefix}${majorMinor}${suffix || ''}`;
    }

    // If it doesn't match the expected pattern, return as-is
    return versionString;
};

/**
 * Update dependencies in a package.json to normalize same-scope dependencies to major.minor format
 */
const updateDependenciesMinor = async (
    packageInfo: PackageInfo,
    allPackages: PackageInfo[],
    isDryRun: boolean,
    logger: any
): Promise<boolean> => {
    const storage = createStorage({ log: logger.info });
    const currentScope = getPackageScope(packageInfo.name);

    if (!currentScope) {
        logger.verbose(`Skipping ${packageInfo.name} - not a scoped package`);
        return false;
    }

    logger.verbose(`Processing ${packageInfo.name} for scope ${currentScope}`);

    try {
        const packageJsonContent = await storage.readFile(packageInfo.packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(packageJsonContent, packageInfo.packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageInfo.packageJsonPath);

        const sectionsToUpdate = ['dependencies', 'devDependencies', 'peerDependencies'];
        let hasChanges = false;

        // Create a set of same-scope package names for quick lookup
        const sameScopePackageNames = new Set<string>();
        for (const pkg of allPackages) {
            const pkgScope = getPackageScope(pkg.name);
            if (pkgScope === currentScope) {
                sameScopePackageNames.add(pkg.name);
            }
        }

        for (const section of sectionsToUpdate) {
            const deps = packageJson[section];
            if (!deps) continue;

            for (const [depName, currentVersion] of Object.entries(deps)) {
                // Update if this is a same-scope dependency (check scope, not just discovered packages)
                const depScope = getPackageScope(depName);
                if (depScope === currentScope) {
                    const normalizedVersion = normalizeToMinorVersion(currentVersion as string);

                    if (currentVersion !== normalizedVersion) {
                        if (isDryRun) {
                            logger.info(`Would update ${section}.${depName}: ${currentVersion} → ${normalizedVersion}`);
                        } else {
                            logger.info(`Updating ${section}.${depName}: ${currentVersion} → ${normalizedVersion}`);
                            deps[depName] = normalizedVersion;
                        }
                        hasChanges = true;
                    }
                }
            }
        }

        if (hasChanges && !isDryRun) {
            // Write updated package.json
            await storage.writeFile(
                packageInfo.packageJsonPath,
                JSON.stringify(packageJson, null, 2) + '\n',
                'utf-8'
            );
            logger.info(`Updated dependencies in ${packageInfo.name}`);
        }

        return hasChanges;

    } catch (error: any) {
        logger.warn(`Failed to update dependencies in ${packageInfo.name}: ${error.message}`);
        return false;
    }
};

/**
 * Execute the versions minor command
 */
const executeMinor = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    logger.info('🔄 Normalizing same-scope dependencies to major.minor format...');

    // Determine directories to scan
    const directories = runConfig.versions?.directories ||
                       runConfig.contextDirectories ||
                       [process.cwd()];

    if (directories.length === 0) {
        directories.push(process.cwd());
    }

    logger.verbose(`Scanning directories: ${directories.join(', ')}`);

    // Discover all packages
    const allPackages = await discoverPackages(directories, logger);

    if (allPackages.length === 0) {
        logger.warn('No packages found in the specified directories');
        return 'No packages found to process.';
    }

    logger.info(`Found ${allPackages.length} packages`);

    // Group packages by scope
    const packagesByScope = new Map<string, PackageInfo[]>();
    const unscopedPackages: PackageInfo[] = [];

    for (const pkg of allPackages) {
        const scope = getPackageScope(pkg.name);
        if (scope) {
            if (!packagesByScope.has(scope)) {
                packagesByScope.set(scope, []);
            }
            packagesByScope.get(scope)!.push(pkg);
        } else {
            unscopedPackages.push(pkg);
        }
    }

    logger.info(`Found ${packagesByScope.size} scopes: ${Array.from(packagesByScope.keys()).join(', ')}`);
    if (unscopedPackages.length > 0) {
        logger.info(`Found ${unscopedPackages.length} unscoped packages (will be skipped)`);
        // Log each unscoped package being skipped
        for (const pkg of unscopedPackages) {
            logger.verbose(`Skipping ${pkg.name} - not a scoped package`);
        }
    }

    let totalUpdated = 0;
    let totalChanges = 0;

    // Process each scope
    for (const [scope, packages] of packagesByScope) {
        logger.info(`\n📦 Processing scope: ${scope} (${packages.length} packages)`);

        for (const pkg of packages) {
            const hasChanges = await updateDependenciesMinor(pkg, allPackages, isDryRun, logger);
            if (hasChanges) {
                totalChanges++;
            }
        }
        totalUpdated += packages.length;
    }

    const verb = isDryRun ? 'Would update' : 'Updated';
    const summary = `${verb} ${totalChanges} of ${totalUpdated} packages with dependency changes.`;

    if (isDryRun) {
        logger.info(`\n✅ Dry run complete. ${summary}`);
        return `Dry run complete. ${summary}`;
    } else {
        logger.info(`\n✅ Dependencies updated successfully. ${summary}`);
        return `Dependencies updated successfully. ${summary}`;
    }
};

/**
 * Main execute function for the versions command
 */
export const execute = async (runConfig: Config): Promise<string> => {
    const subcommand = runConfig.versions?.subcommand;

    if (!subcommand) {
        throw new Error('Versions command requires a subcommand. Use: kodrdriv versions minor');
    }

    switch (subcommand) {
        case 'minor':
            return await executeMinor(runConfig);
        default:
            throw new Error(`Unknown versions subcommand: ${subcommand}. Supported: minor`);
    }
};
