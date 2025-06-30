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

const findPackagesByScope = async (dependencies: Record<string, string>, scopeRoots: Record<string, string>, storage: any): Promise<Map<string, string>> => {
    const logger = getLogger();
    const workspacePackages = new Map<string, string>();

    logger.debug(`Checking dependencies against scope roots: ${JSON.stringify(scopeRoots)}`);

    // First, scan all scope roots to build a comprehensive map of available packages
    const allPackages = new Map<string, string>(); // packageName -> relativePath

    for (const [scope, rootDir] of Object.entries(scopeRoots)) {
        logger.debug(`Scanning scope ${scope} at root directory: ${rootDir}`);
        const scopePackages = await scanDirectoryForPackages(rootDir, storage);

        // Add packages from this scope to the overall map
        for (const [packageName, packagePath] of scopePackages) {
            if (packageName.startsWith(scope)) {
                allPackages.set(packageName, packagePath);
                logger.debug(`Registered package: ${packageName} -> ${packagePath}`);
            }
        }
    }

    // Now check each dependency against our discovered packages
    for (const [depName, depVersion] of Object.entries(dependencies)) {
        logger.debug(`Processing dependency: ${depName}@${depVersion}`);

        if (allPackages.has(depName)) {
            const packagePath = allPackages.get(depName)!;
            workspacePackages.set(depName, packagePath);
            logger.info(`Found sibling package: ${depName} at ${packagePath}`);
        }
    }

    return workspacePackages;
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

    logger.info('Starting pnpm workspace link management using overrides...');

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

    // Collect all dependencies
    const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies
    };

    logger.info(`Found ${Object.keys(allDependencies).length} total dependencies`);

    // Find matching sibling packages
    const packagesToLink = await findPackagesByScope(allDependencies, scopeRoots, storage);

    if (packagesToLink.size === 0) {
        logger.info('No matching sibling packages found for linking.');
        return 'No matching sibling packages found for linking.';
    }

    logger.info(`Found ${packagesToLink.size} packages to link: ${[...packagesToLink.keys()].join(', ')}`);

    // Read existing workspace configuration
    const workspaceFilePath = path.join(process.cwd(), workspaceFileName);
    const workspaceConfig = await readCurrentWorkspaceFile(workspaceFilePath, storage);

    // Create overrides
    const newOverrides: Record<string, string> = {};
    for (const [packageName, packagePath] of packagesToLink.entries()) {
        newOverrides[packageName] = `link:${packagePath}`;
    }

    const updatedOverrides = { ...(workspaceConfig.overrides || {}), ...newOverrides };

    const sortedOverrides = Object.keys(updatedOverrides)
        .sort()
        .reduce((obj, key) => {
            obj[key] = updatedOverrides[key];
            return obj;
        }, {} as Record<string, string>);

    const updatedConfig: PnpmWorkspaceFile = {
        ...workspaceConfig,
        overrides: sortedOverrides
    };


    // Write the updated workspace file
    if (isDryRun) {
        logger.info('DRY RUN: Would write the following workspace configuration:');
        logger.info(yaml.dump(updatedConfig, { indent: 2 }));
    } else {
        await writeWorkspaceFile(workspaceFilePath, updatedConfig, storage);
        logger.info(`Updated ${workspaceFileName} with ${packagesToLink.size} linked packages in overrides.`);

        // Rebuild pnpm lock file and node_modules
        logger.info('Running pnpm install to apply links...');
        try {
            await run('pnpm install');
            logger.info('Successfully applied links.');
        } catch (error) {
            logger.warn(`Failed to run pnpm install: ${error}. You may need to run 'pnpm install' manually.`);
        }
    }

    const summary = `Successfully linked ${packagesToLink.size} sibling packages:\n${[...packagesToLink.entries()].map(([name, path]) => `  - ${name}: link:${path}`).join('\n')}`;

    return summary;
};