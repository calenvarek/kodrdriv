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

interface WorkspaceConfig {
    packages?: string[];
}

const scanDirectoryForPackages = async (rootDir: string, storage: any): Promise<Map<string, string>> => {
    const logger = getLogger();
    const packageMap = new Map<string, string>(); // packageName -> relativePath

    const absoluteRootDir = path.resolve(process.cwd(), rootDir);
    logger.debug(`Scanning directory for packages: ${absoluteRootDir}`);

    if (!await storage.exists(absoluteRootDir) || !await storage.isDirectory(absoluteRootDir)) {
        logger.debug(`Root directory does not exist or is not a directory: ${absoluteRootDir}`);
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

    logger.debug(`Finding packages to unlink from scope roots: ${JSON.stringify(scopeRoots)}`);

    // Scan all scope roots to build a comprehensive map of packages that should be unlinked
    const allScopePackages = new Map<string, string>(); // packageName -> relativePath

    for (const [scope, rootDir] of Object.entries(scopeRoots)) {
        logger.debug(`Scanning scope ${scope} at root directory: ${rootDir}`);
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

const readCurrentWorkspaceFile = async (workspaceFilePath: string, storage: any): Promise<WorkspaceConfig> => {
    if (await storage.exists(workspaceFilePath)) {
        try {
            const content = await storage.readFile(workspaceFilePath, 'utf-8');
            return yaml.load(content) as WorkspaceConfig;
        } catch (error) {
            throw new Error(`Failed to parse existing workspace file: ${error}`);
        }
    }
    return { packages: [] };
};

const writeWorkspaceFile = async (workspaceFilePath: string, config: WorkspaceConfig, storage: any): Promise<void> => {
    const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
    });
    await storage.writeFile(workspaceFilePath, yamlContent, 'utf-8');
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    logger.info('Starting pnpm workspace unlink management...');

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

    logger.info(`Processing package: ${packageJson.name || 'unnamed'}`);

    // Get configuration
    const scopeRoots = runConfig.link?.scopeRoots || {};
    const workspaceFileName = runConfig.link?.workspaceFile || 'pnpm-workspace.yaml';
    const isDryRun = runConfig.dryRun || runConfig.link?.dryRun || false;

    logger.debug('Extracted scopeRoots:', JSON.stringify(scopeRoots));
    logger.debug('Extracted workspaceFileName:', workspaceFileName);
    logger.debug('Extracted isDryRun:', isDryRun);

    if (Object.keys(scopeRoots).length === 0) {
        throw new Error('No scope roots configured. Please configure scope roots in your config file or via --scope-roots CLI option.');
    }

    logger.info(`Configured scope roots: ${JSON.stringify(scopeRoots)}`);

    // Find packages to unlink based on scope roots
    const packagesToUnlink = await findPackagesToUnlink(scopeRoots, storage);

    if (packagesToUnlink.length === 0) {
        logger.info('No packages found matching scope roots for unlinking.');
        return 'No packages found matching scope roots for unlinking.';
    }

    logger.info(`Found ${packagesToUnlink.length} packages that could be unlinked: ${packagesToUnlink.join(', ')}`);

    // Read existing workspace configuration
    const workspaceFilePath = path.join(process.cwd(), workspaceFileName);
    const workspaceConfig = await readCurrentWorkspaceFile(workspaceFilePath, storage);

    // Filter out packages that match our scope roots
    const existingPackages = workspaceConfig.packages || [];
    const remainingPackages = existingPackages.filter(pkg => !packagesToUnlink.includes(pkg));
    const actuallyRemovedPackages = existingPackages.filter(pkg => packagesToUnlink.includes(pkg));

    if (actuallyRemovedPackages.length === 0) {
        logger.info('No linked packages found in workspace file that match scope roots.');
        return 'No linked packages found in workspace file that match scope roots.';
    }

    const updatedConfig: WorkspaceConfig = {
        packages: remainingPackages.sort()
    };

    // Write the updated workspace file
    if (isDryRun) {
        logger.info('DRY RUN: Would write the following workspace configuration:');
        logger.info(yaml.dump(updatedConfig, { indent: 2 }));
        logger.info(`DRY RUN: Would remove ${actuallyRemovedPackages.length} packages: ${actuallyRemovedPackages.join(', ')}`);
    } else {
        await writeWorkspaceFile(workspaceFilePath, updatedConfig, storage);
        logger.info(`Updated ${workspaceFileName} - removed ${actuallyRemovedPackages.length} linked packages`);

        // Rebuild pnpm lock file and node_modules
        logger.info('Rebuilding pnpm lock file and node_modules...');
        try {
            // Remove existing lock file and node_modules to force clean rebuild
            const fs = await import('fs');
            const pnpmLockPath = path.join(process.cwd(), 'pnpm-lock.yaml');
            const nodeModulesPath = path.join(process.cwd(), 'node_modules');

            if (await storage.exists(pnpmLockPath)) {
                await fs.promises.unlink(pnpmLockPath);
                logger.debug('Removed existing pnpm-lock.yaml');
            }

            if (await storage.exists(nodeModulesPath) && await storage.isDirectory(nodeModulesPath)) {
                await fs.promises.rm(nodeModulesPath, { recursive: true, force: true });
                logger.debug('Removed existing node_modules directory');
            }

            // Install dependencies fresh
            await run('pnpm install');
            logger.info('Successfully rebuilt pnpm lock file and node_modules');
        } catch (error) {
            logger.warn(`Failed to rebuild dependencies: ${error}. You may need to run 'pnpm install' manually.`);
        }
    }

    const summary = `Successfully unlinked ${actuallyRemovedPackages.length} sibling packages:\n${actuallyRemovedPackages.map(pkg => `  - ${pkg}`).join('\n')}`;

    return summary;
}; 