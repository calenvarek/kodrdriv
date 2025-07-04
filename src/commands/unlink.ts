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

    if (!await storage.exists(absoluteRootDir) || !await storage.isDirectory(absoluteRootDir)) {
        logger.verbose(`Root directory does not exist or is not a directory: ${absoluteRootDir}`);
        return packageMap;
    }

    try {
        // Get all subdirectories in the root directory
        const items = await storage.listFiles(absoluteRootDir);

        for (const item of items) {
            const itemPath = path.join(absoluteRootDir, item);

            if (await storage.isDirectory(itemPath)) {
                const packageJsonPath = path.join(itemPath, 'package.json');

                if (await storage.exists(packageJsonPath)) {
                    try {
                        const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
                        const packageJson = JSON.parse(packageJsonContent) as PackageJson;

                        if (packageJson.name) {
                            const relativePath = path.relative(process.cwd(), itemPath);
                            packageMap.set(packageJson.name, relativePath);
                            logger.debug(`Found package: ${packageJson.name} at ${relativePath}`);
                        }
                    } catch (error) {
                        logger.debug(`Failed to parse package.json at ${packageJsonPath}: ${error}`);
                    }
                }
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

    logger.verbose('Starting pnpm workspace unlink management...');

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

    logger.verbose(`Processing package: ${packageJson.name || 'unnamed'}`);

    // Get configuration
    const scopeRoots = runConfig.link?.scopeRoots || {};
    const workspaceFileName = runConfig.link?.workspaceFile || 'pnpm-workspace.yaml';
    const isDryRun = runConfig.dryRun || runConfig.link?.dryRun || false;

    logger.silly('Extracted scopeRoots:', JSON.stringify(scopeRoots));
    logger.debug('Extracted workspaceFileName:', workspaceFileName);
    logger.debug('Extracted isDryRun:', isDryRun);

    if (Object.keys(scopeRoots).length === 0) {
        logger.verbose('No scope roots configured. Skipping unlink management.');
        return 'No scope roots configured. Skipping unlink management.';
    }

    logger.silly(`Configured scope roots: ${JSON.stringify(scopeRoots)}`);

    // Find packages to unlink based on scope roots
    const packagesToUnlinkPaths = await findPackagesToUnlink(scopeRoots, storage);

    if (packagesToUnlinkPaths.length === 0) {
        logger.verbose('No packages found matching scope roots for unlinking.');
        return 'No packages found matching scope roots for unlinking.';
    }

    logger.verbose(`Found ${packagesToUnlinkPaths.length} packages that could be unlinked: ${packagesToUnlinkPaths.join(', ')}`);

    // Read existing workspace configuration
    const workspaceFilePath = path.join(process.cwd(), workspaceFileName);
    const workspaceConfig = await readCurrentWorkspaceFile(workspaceFilePath, storage);

    if (!workspaceConfig.overrides || Object.keys(workspaceConfig.overrides).length === 0) {
        logger.verbose('No overrides found in workspace file. Nothing to do.');
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
        logger.verbose('No linked packages found in workspace file that match scope roots.');
        return 'No linked packages found in workspace file that match scope roots.';
    }

    const updatedConfig: PnpmWorkspaceFile = {
        ...workspaceConfig,
        overrides: remainingOverrides
    };

    if (Object.keys(remainingOverrides).length === 0) {
        delete updatedConfig.overrides;
    }

    // Write the updated workspace file
    if (isDryRun) {
        logger.verbose('DRY RUN: Would write the following workspace configuration:');
        logger.silly(yaml.dump(updatedConfig, { indent: 2 }));
        logger.verbose(`DRY RUN: Would remove ${actuallyRemovedPackages.length} packages: ${actuallyRemovedPackages.join(', ')}`);
    } else {
        await writeWorkspaceFile(workspaceFilePath, updatedConfig, storage);
        logger.verbose(`Updated ${workspaceFileName} - removed ${actuallyRemovedPackages.length} linked packages from overrides.`);

        // Rebuild pnpm lock file and node_modules
        logger.verbose('Rebuilding pnpm lock file and node_modules...');
        try {
            await run('pnpm install');
            logger.verbose('Successfully rebuilt pnpm lock file and node_modules');
        } catch (error) {
            logger.warn(`Failed to rebuild dependencies: ${error}. You may need to run 'pnpm install' manually.`);
        }
    }

    const summary = `Successfully unlinked ${actuallyRemovedPackages.length} sibling packages:\n${actuallyRemovedPackages.map(pkg => `  - ${pkg}`).join('\n')}`;

    return summary;
};
