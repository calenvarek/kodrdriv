import { getDryRunLogger, getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { run } from '../util/child';
import {
    findAllPackageJsonFiles
} from '../util/performance';
import { safeJsonParse, validatePackageJson } from '../util/validation';

// Helper function to parse package names and scopes (same as link command)
const parsePackageArgument = (packageArg: string): { scope: string; packageName?: string } => {
    if (packageArg.startsWith('@')) {
        const parts = packageArg.split('/');
        if (parts.length === 1) {
            // Just a scope like "@fjell"
            return { scope: parts[0] };
        } else {
            // Full package name like "@fjell/core"
            return { scope: parts[0], packageName: packageArg };
        }
    } else {
        throw new Error(`Package argument must start with @ (scope): ${packageArg}`);
    }
};

// Find packages in the workspace that match the given scope or package name
const findMatchingPackages = async (
    targetDirectories: string[],
    scope: string,
    storage: any,
    logger: any,
    packageName?: string
): Promise<Array<{ name: string; path: string; isSource: boolean }>> => {
    const matchingPackages: Array<{ name: string; path: string; isSource: boolean }> = [];

    // Find all package.json files in target directories
    let allPackageJsonFiles: any[] = [];
    for (const targetDirectory of targetDirectories) {
        const packageJsonFiles = await findAllPackageJsonFiles(targetDirectory, storage);
        allPackageJsonFiles = allPackageJsonFiles.concat(packageJsonFiles);
    }

    for (const packageJsonLocation of allPackageJsonFiles) {
        const packageDir = packageJsonLocation.path.replace('/package.json', '');

        try {
            const packageJsonContent = await storage.readFile(packageJsonLocation.path, 'utf-8');
            const parsed = safeJsonParse(packageJsonContent, packageJsonLocation.path);
            const packageJson = validatePackageJson(parsed, packageJsonLocation.path);

            if (!packageJson.name) continue;

            const isInScope = packageJson.name.startsWith(scope + '/');
            const isExactMatch = packageName && packageJson.name === packageName;

            if (isInScope || isExactMatch) {
                matchingPackages.push({
                    name: packageJson.name,
                    path: packageDir,
                    isSource: packageName ? packageJson.name === packageName : isInScope
                });
            }
        } catch (error: any) {
            logger.warn(`Failed to parse ${packageJsonLocation.path}: ${error.message}`);
        }
    }

    return matchingPackages;
};

// Find packages that depend on the target package
const findConsumingPackages = async (
    targetDirectories: string[],
    targetPackageName: string,
    storage: any,
    logger: any
): Promise<Array<{ name: string; path: string }>> => {
    const consumingPackages: Array<{ name: string; path: string }> = [];

    // Find all package.json files in target directories
    let allPackageJsonFiles: any[] = [];
    for (const targetDirectory of targetDirectories) {
        const packageJsonFiles = await findAllPackageJsonFiles(targetDirectory, storage);
        allPackageJsonFiles = allPackageJsonFiles.concat(packageJsonFiles);
    }

    for (const packageJsonLocation of allPackageJsonFiles) {
        const packageDir = packageJsonLocation.path.replace('/package.json', '');

        try {
            const packageJsonContent = await storage.readFile(packageJsonLocation.path, 'utf-8');
            const parsed = safeJsonParse(packageJsonContent, packageJsonLocation.path);
            const packageJson = validatePackageJson(parsed, packageJsonLocation.path);

            if (!packageJson.name) continue;

            // Check if this package depends on the target package
            const dependencyTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            const hasDependency = dependencyTypes.some(depType =>
                packageJson[depType] && packageJson[depType][targetPackageName]
            );

            if (hasDependency && packageJson.name !== targetPackageName) {
                consumingPackages.push({
                    name: packageJson.name,
                    path: packageDir
                });
            }
        } catch (error: any) {
            logger.warn(`Failed to parse ${packageJsonLocation.path}: ${error.message}`);
        }
    }

    return consumingPackages;
};

const executeInternal = async (runConfig: Config, packageArgument?: string): Promise<string> => {
    const isDryRun = runConfig.dryRun || runConfig.unlink?.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.info });

    // Get target directories from config, default to current directory
    const targetDirectories = runConfig.tree?.directories || [process.cwd()];

    if (targetDirectories.length === 1) {
        logger.info(`Analyzing workspace at: ${targetDirectories[0]}`);
    } else {
        logger.info(`Analyzing workspaces at: ${targetDirectories.join(', ')}`);
    }

    // If no package argument provided, implement new behavior for current project
    if (!packageArgument) {
        logger.info('🔓 Unlinking current project...');

        const currentDir = process.cwd();
        const packageJsonPath = `${currentDir}/package.json`;

        // Check if we're in a directory with package.json
        if (!(await storage.exists(packageJsonPath))) {
            const message = `No package.json found in current directory: ${currentDir}`;
            logger.warn(message);
            return message;
        }

        // Parse package.json to get package name
        let packageName: string;
        try {
            const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
            const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
            const packageJson = validatePackageJson(parsed, packageJsonPath);

            if (!packageJson.name) {
                throw new Error('package.json has no name field');
            }
            packageName = packageJson.name;
        } catch (error: any) {
            const message = `Failed to parse package.json: ${error.message}`;
            logger.error(message);
            return message;
        }

        logger.info(`Processing package: ${packageName}`);

        const cleanNodeModules = runConfig.unlink?.cleanNodeModules || false;



        if (isDryRun) {
            logger.info(`DRY RUN: Would execute unlink steps for ${packageName}:`);
            logger.info(`  1. npm unlink -g`);
            if (cleanNodeModules) {
                logger.info(`  2. rm -rf node_modules package-lock.json`);
                logger.info(`  3. npm install`);
                logger.info(`  4. Check for remaining links with npm ls --link`);
            } else {
                logger.info(`  2. Check for remaining links with npm ls --link`);
                logger.info(`  Note: Use --clean-node-modules flag to also clean and reinstall dependencies`);
            }
            return `DRY RUN: Would execute unlink steps for ${packageName}`;
        }

        // Step 1: Remove global link
        logger.info('Step 1: Removing global link...');
        try {
            await run('npm unlink -g');
            logger.info('✅ Global link removed');
        } catch (error: any) {
            // This might fail if the package wasn't globally linked, which is OK
            logger.warn(`⚠️ Failed to remove global link (this is OK if package wasn't linked): ${error.message}`);
        }

        if (cleanNodeModules) {
            // Step 2: Clean node_modules and package-lock.json
            logger.info('Step 2: Cleaning node_modules and package-lock.json...');
            try {
                await run('rm -rf node_modules package-lock.json');
                logger.info('✅ Cleaned node_modules and package-lock.json');
            } catch (error: any) {
                logger.warn(`⚠️ Failed to clean node_modules/package-lock.json: ${error.message}`);
            }

            // Step 3: Install dependencies
            logger.info('Step 3: Installing dependencies...');
            try {
                await run('npm install');
                logger.info('✅ Dependencies installed');
            } catch (error: any) {
                logger.error(`❌ Failed to install dependencies: ${error.message}`);
                throw error;
            }

            // Step 4: Check for remaining links (suppress output and errors)
            logger.info('Step 4: Checking for remaining links...');
        } else {
            // Step 2: Check for remaining links (suppress output and errors)
            logger.info('Step 2: Checking for remaining links...');
            logger.info('Note: Use --clean-node-modules flag to also clean and reinstall dependencies');
        }

        try {
            // Use child_process directly to suppress logging and get JSON output
            const util = await import('util');
            const child_process = await import('child_process');
            const execPromise = util.promisify(child_process.exec);

            const result = await execPromise('npm ls --link --json');

            // Parse JSON output to check for links to packages in the same scope
            const packageScope = packageName.includes('/') ? packageName.split('/')[0] : null;

            if (packageScope && result.stdout.trim()) {
                try {
                    const linksData = JSON.parse(result.stdout);
                    const linkedPackages = Object.keys(linksData.dependencies || {});
                    const scopeLinkedPackages = linkedPackages.filter(pkg => pkg.startsWith(packageScope + '/'));

                    if (scopeLinkedPackages.length > 0) {
                        logger.warn(`⚠️ Found remaining links to packages in scope ${packageScope}: ${scopeLinkedPackages.join(', ')}`);
                        logger.verbose('This may be expected if other packages in your workspace are still linked');
                    } else {
                        logger.info('✅ No problematic links found');
                    }
                } catch {
                    // If JSON parsing fails, fall back to basic check
                    logger.verbose('Failed to parse npm ls --link --json output, using basic check');
                    if (result.stdout.includes(packageScope)) {
                        logger.warn(`⚠️ Found remaining links to packages in scope ${packageScope}`);
                        logger.verbose('This may be expected if other packages in your workspace are still linked');
                    } else {
                        logger.info('✅ No problematic links found');
                    }
                }
            } else {
                logger.info('✅ No problematic links found');
            }
        } catch {
            // npm ls --link returns non-zero when there are no links, which is what we want
            // So we only log this at verbose level
            logger.verbose('npm ls --link check completed (non-zero exit is expected when no links exist)');
        }

        const summary = `Successfully unlinked ${packageName}`;
        logger.info(summary);
        return summary;
    }

    // New scope-based unlinking behavior
    logger.info(`🔓 Unlinking scope/package: ${packageArgument}`);

    const { scope, packageName } = parsePackageArgument(packageArgument);
    logger.verbose(`Parsed scope: ${scope}, package: ${packageName || 'all packages in scope'}`);

    // Find matching packages in the workspace
    const matchingPackages = await findMatchingPackages(targetDirectories, scope, storage, logger, packageName);

    if (matchingPackages.length === 0) {
        const message = packageName
            ? `No package found matching: ${packageName}`
            : `No packages found in scope: ${scope}`;
        logger.warn(message);
        return message;
    }

    logger.info(`Found ${matchingPackages.length} matching package(s)`);

    const unlinkedPackages: string[] = [];

    // If specific package name provided, use that; otherwise unlink all packages in scope
    const packagesToUnlink = packageName
        ? matchingPackages.filter(pkg => pkg.name === packageName)
        : matchingPackages;

    for (const pkg of packagesToUnlink) {
        logger.info(`Processing package: ${pkg.name}`);

        // Step A: Find all packages that depend on this package and unlink them first
        const consumingPackages = await findConsumingPackages(targetDirectories, pkg.name, storage, logger);

        if (consumingPackages.length === 0) {
            logger.info(`No consuming packages found for: ${pkg.name}`);
        } else {
            logger.info(`Found ${consumingPackages.length} consuming package(s) for: ${pkg.name}`);

            for (const consumer of consumingPackages) {
                try {
                    const consumerOriginalCwd = process.cwd();
                    process.chdir(consumer.path);

                    try {
                        if (isDryRun) {
                            logger.info(`DRY RUN: Would run 'npm unlink ${pkg.name}' in: ${consumer.path}`);
                        } else {
                            logger.verbose(`Running 'npm unlink ${pkg.name}' in consumer: ${consumer.path}`);
                            await run(`npm unlink ${pkg.name}`);
                            logger.info(`✅ Consumer unlinked: ${consumer.name} -/-> ${pkg.name}`);
                        }
                    } finally {
                        process.chdir(consumerOriginalCwd);
                    }
                } catch (error: any) {
                    // npm unlink can fail if package wasn't linked, but that's OK
                    logger.warn(`⚠️ Failed to unlink ${pkg.name} in ${consumer.name}: ${error.message}`);
                }
            }
        }

        // Step B: Run 'npm unlink' in the source package directory
        try {
            const originalCwd = process.cwd();
            process.chdir(pkg.path);

            try {
                if (isDryRun) {
                    logger.info(`DRY RUN: Would run 'npm unlink' in: ${pkg.path}`);
                } else {
                    logger.verbose(`Running 'npm unlink' in source: ${pkg.path}`);
                    await run('npm unlink');
                    logger.info(`✅ Source unlinked: ${pkg.name}`);
                }
            } finally {
                process.chdir(originalCwd);
            }

            unlinkedPackages.push(pkg.name);
        } catch (error: any) {
            // npm unlink can fail if package wasn't linked, but that's OK
            logger.warn(`⚠️ Failed to unlink source package ${pkg.name}: ${error.message}`);
            unlinkedPackages.push(pkg.name); // Still count as success
        }
    }

    const summary = `Successfully unlinked ${unlinkedPackages.length} package(s): ${unlinkedPackages.join(', ')}`;
    logger.info(summary);
    return summary;
};

export const execute = async (runConfig: Config, packageArgument?: string): Promise<string> => {
    try {
        // Use packageArgument from runConfig if not provided as parameter
        const finalPackageArgument = packageArgument || runConfig.unlink?.packageArgument;
        return await executeInternal(runConfig, finalPackageArgument);
    } catch (error: any) {
        const logger = getLogger();
        logger.error(`unlink failed: ${error.message}`);
        throw error;
    }
};
