/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import yaml from 'js-yaml';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { run } from '../util/child';

interface PackageJson {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

interface PnpmWorkspaceFile {
    packages?: string[];
    overrides?: Record<string, string>;
}

const scanDirectoryForPackages = async (rootDir: string, storage: any): Promise<Map<string, string>> => {
    const logger = getLogger();
    const packageMap = new Map<string, string>(); // packageName -> relativePath

    const absoluteRootDir = path.resolve(process.cwd(), rootDir);
    logger.verbose(`Scanning directory for packages: ${absoluteRootDir}`);

    try {
        // Use single stat call to check if directory exists and is directory
        const rootStat = await storage.exists(absoluteRootDir);
        if (!rootStat) {
            logger.verbose(`Root directory does not exist: ${absoluteRootDir}`);
            return packageMap;
        }

        if (!await storage.isDirectory(absoluteRootDir)) {
            logger.verbose(`Root path is not a directory: ${absoluteRootDir}`);
            return packageMap;
        }

        // Get all items in the root directory
        const items = await storage.listFiles(absoluteRootDir);

        // Process directories in batches to avoid overwhelming the filesystem
        const directories = [];
        for (const item of items) {
            const itemPath = path.join(absoluteRootDir, item);
            try {
                // Quick check if it's a directory without logging
                if (await storage.isDirectory(itemPath)) {
                    directories.push({ item, itemPath });
                }
            } catch (error: any) {
                // Skip items that can't be stat'ed (permissions, etc)
                continue;
            }
        }

        logger.verbose(`Found ${directories.length} subdirectories to check for packages`);

        // Check each directory for package.json
        for (const { item, itemPath } of directories) {
            const packageJsonPath = path.join(itemPath, 'package.json');

            try {
                if (await storage.exists(packageJsonPath)) {
                    const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
                    const packageJson = JSON.parse(packageJsonContent) as PackageJson;

                    if (packageJson.name) {
                        const relativePath = path.relative(process.cwd(), itemPath);
                        packageMap.set(packageJson.name, relativePath);
                        logger.debug(`Found package: ${packageJson.name} at ${relativePath}`);
                    }
                }
            } catch (error: any) {
                // Skip directories with unreadable or invalid package.json
                logger.debug(`Skipped ${packageJsonPath}: ${error.message || error}`);
                continue;
            }
        }
    } catch (error) {
        logger.warn(`Failed to read directory ${absoluteRootDir}: ${error}`);
    }

    return packageMap;
};

const findPackagesToUnlink = async (scopeRoots: Record<string, string>, storage: any): Promise<string[]> => {
    const logger = getLogger();
    const packagesToUnlink: string[] = [];

    logger.silly(`Finding packages to unlink from scope roots: ${JSON.stringify(scopeRoots)}`);

    // Scan all scope roots to build a comprehensive map of packages that should be unlinked
    const allScopePackages = new Map<string, string>(); // packageName -> relativePath

    for (const [scope, rootDir] of Object.entries(scopeRoots)) {
        logger.verbose(`Scanning scope ${scope} at root directory: ${rootDir}`);
        const scopePackages = await scanDirectoryForPackages(rootDir, storage);

        // Add packages from this scope to the overall map
        for (const [packageName, packagePath] of scopePackages) {
            if (packageName.startsWith(scope)) {
                allScopePackages.set(packageName, packagePath);
                packagesToUnlink.push(packagePath);
                logger.debug(`Package to unlink: ${packageName} -> ${packagePath}`);
            }
        }
    }

    return packagesToUnlink;
};

const readCurrentWorkspaceFile = async (workspaceFilePath: string, storage: any): Promise<PnpmWorkspaceFile> => {
    if (await storage.exists(workspaceFilePath)) {
        try {
            const content = await storage.readFile(workspaceFilePath, 'utf-8');
            return (yaml.load(content) as PnpmWorkspaceFile) || {};
        } catch (error) {
            throw new Error(`Failed to parse existing workspace file: ${error}`);
        }
    }
    return {};
};

const writeWorkspaceFile = async (workspaceFilePath: string, config: PnpmWorkspaceFile, storage: any): Promise<void> => {
    let yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
        quotingType: "'",
        forceQuotes: true
    });

    // Post-process to fix numeric values that shouldn't be quoted
    yamlContent = yamlContent.replace(/: '(\d+(?:\.\d+)*)'/g, ': $1');

    await storage.writeFile(workspaceFilePath, yamlContent, 'utf-8');
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    logger.info('🔓 Unlinking workspace packages...');

    // Read current package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!await storage.exists(packageJsonPath)) {
        throw new Error('package.json not found in current directory.');
    }

    let packageJson: PackageJson;
    try {
        const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
        throw new Error(`Failed to parse package.json: ${error}`);
    }

    // Get configuration
    const scopeRoots = runConfig.link?.scopeRoots || {};
    const workspaceFileName = runConfig.link?.workspaceFile || 'pnpm-workspace.yaml';
    const isDryRun = runConfig.dryRun || runConfig.link?.dryRun || false;

    if (Object.keys(scopeRoots).length === 0) {
        logger.info('No scope roots configured. Skipping unlink management.');
        return 'No scope roots configured. Skipping unlink management.';
    }

    logger.info(`Scanning ${Object.keys(scopeRoots).length} scope root(s): ${Object.keys(scopeRoots).join(', ')}`);

    // Find packages to unlink based on scope roots
    const startTime = Date.now();
    const packagesToUnlinkPaths = await findPackagesToUnlink(scopeRoots, storage);
    const scanTime = Date.now() - startTime;
    logger.verbose(`Directory scan completed in ${scanTime}ms`);

    if (packagesToUnlinkPaths.length === 0) {
        logger.info('✅ No packages found matching scope roots for unlinking.');
        return 'No packages found matching scope roots for unlinking.';
    }

    logger.verbose(`Found ${packagesToUnlinkPaths.length} packages that could be unlinked: ${packagesToUnlinkPaths.join(', ')}`);

    // Read existing workspace configuration
    const workspaceFilePath = path.join(process.cwd(), workspaceFileName);
    const workspaceConfig = await readCurrentWorkspaceFile(workspaceFilePath, storage);

    if (!workspaceConfig.overrides || Object.keys(workspaceConfig.overrides).length === 0) {
        logger.info('✅ No overrides found in workspace file. Nothing to do.');
        return 'No overrides found in workspace file. Nothing to do.';
    }

    // Filter out packages that match our scope roots from overrides
    const existingOverrides = workspaceConfig.overrides || {};
    const remainingOverrides: Record<string, string> = {};
    const actuallyRemovedPackages: string[] = [];
    const packagesToUnlinkSet = new Set(packagesToUnlinkPaths.map(p => `link:${p}`));

    for (const [pkgName, pkgLink] of Object.entries(existingOverrides)) {
        if (packagesToUnlinkSet.has(pkgLink)) {
            actuallyRemovedPackages.push(pkgName);
        } else {
            remainingOverrides[pkgName] = pkgLink;
        }
    }

    if (actuallyRemovedPackages.length === 0) {
        logger.info('✅ No linked packages found in workspace file that match scope roots.');
        return 'No linked packages found in workspace file that match scope roots.';
    }

    logger.info(`Found ${actuallyRemovedPackages.length} package(s) to unlink: ${actuallyRemovedPackages.join(', ')}`);

    const updatedConfig: PnpmWorkspaceFile = {
        ...workspaceConfig,
        overrides: remainingOverrides
    };

    if (Object.keys(remainingOverrides).length === 0) {
        delete updatedConfig.overrides;
    }

    // Write the updated workspace file
    if (isDryRun) {
        logger.info('DRY RUN: Would update workspace configuration and run pnpm install');
        logger.verbose('DRY RUN: Would write the following workspace configuration:');
        logger.silly(yaml.dump(updatedConfig, { indent: 2 }));
        logger.verbose(`DRY RUN: Would remove ${actuallyRemovedPackages.length} packages: ${actuallyRemovedPackages.join(', ')}`);
    } else {
        await writeWorkspaceFile(workspaceFilePath, updatedConfig, storage);
        logger.info(`Updated ${workspaceFileName} - removed linked packages`);

        // Rebuild pnpm lock file and node_modules
        logger.info('⏳ Running pnpm install to apply changes (this may take a moment)...');
        const installStart = Date.now();
        try {
            await run('pnpm install');
            const installTime = Date.now() - installStart;
            logger.info(`✅ Changes applied successfully (${installTime}ms)`);
        } catch (error) {
            logger.warn(`Failed to rebuild dependencies: ${error}. You may need to run 'pnpm install' manually.`);
        }
    }

    const summary = `Successfully unlinked ${actuallyRemovedPackages.length} sibling packages:\n${actuallyRemovedPackages.map(pkg => `  - ${pkg}`).join('\n')}`;

    return summary;
};
