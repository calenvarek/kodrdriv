import path from 'path';
import yaml from 'js-yaml';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';

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

const findPackagesByScope = async (dependencies: Record<string, string>, scopeRoots: Record<string, string>, storage: any): Promise<string[]> => {
    const logger = getLogger();
    const workspacePackages: string[] = [];

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
            workspacePackages.push(packagePath);
            logger.info(`Found sibling package: ${depName} at ${packagePath}`);
        }
    }

    return workspacePackages;
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

    logger.info('Starting pnpm workspace link management...');

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
    const workspacePackages = await findPackagesByScope(allDependencies, scopeRoots, storage);

    if (workspacePackages.length === 0) {
        logger.info('No matching sibling packages found for linking.');
        return 'No matching sibling packages found for linking.';
    }

    logger.info(`Found ${workspacePackages.length} packages to link: ${workspacePackages.join(', ')}`);

    // Read existing workspace configuration
    const workspaceFilePath = path.join(process.cwd(), workspaceFileName);
    const workspaceConfig = await readCurrentWorkspaceFile(workspaceFilePath, storage);

    // Merge with existing packages (avoid duplicates)
    const existingPackages = workspaceConfig.packages || [];
    const allPackages = [...new Set([...existingPackages, ...workspacePackages])];

    const updatedConfig: WorkspaceConfig = {
        packages: allPackages.sort()
    };

    // Write the updated workspace file
    if (isDryRun) {
        logger.info('DRY RUN: Would write the following workspace configuration:');
        logger.info(yaml.dump(updatedConfig, { indent: 2 }));
    } else {
        await writeWorkspaceFile(workspaceFilePath, updatedConfig, storage);
        logger.info(`Updated ${workspaceFileName} with ${workspacePackages.length} linked packages`);
    }

    const summary = `Successfully linked ${workspacePackages.length} sibling packages:\n${workspacePackages.map(pkg => `  - ${pkg}`).join('\n')}`;

    return summary;
}; 