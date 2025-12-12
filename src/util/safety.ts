import path from 'path';
import { getLogger } from '../logging';
import { safeJsonParse, validatePackageJson } from '@eldrforge/git-tools';

interface PackageJson {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

interface PackageJsonLocation {
    path: string;
    packageJson: PackageJson;
    relativePath: string;
}

interface FileDependencyIssue {
    packagePath: string;
    dependencies: Array<{
        name: string;
        version: string;
        dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies';
    }>;
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

const findAllPackageJsonFiles = async (rootDir: string, storage: any): Promise<PackageJsonLocation[]> => {
    const logger = getLogger();
    const packageJsonFiles: PackageJsonLocation[] = [];

    const scanDirectory = async (currentDir: string, depth: number = 0): Promise<void> => {
        // Prevent infinite recursion and overly deep scanning
        if (depth > 5) {
            return;
        }

        try {
            if (!await storage.exists(currentDir) || !await storage.isDirectory(currentDir)) {
                return;
            }

            const items = await storage.listFiles(currentDir);

            // Check for package.json in current directory
            if (items.includes('package.json')) {
                const packageJsonPath = path.join(currentDir, 'package.json');
                try {
                    const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
                    const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
                    const packageJson = validatePackageJson(parsed, packageJsonPath);
                    const relativePath = path.relative(rootDir, currentDir);

                    packageJsonFiles.push({
                        path: packageJsonPath,
                        packageJson,
                        relativePath: relativePath || '.'
                    });

                    logger.debug(`Found package.json at: ${relativePath || '.'}`);
                } catch (error: any) {
                    logger.debug(`Skipped invalid package.json at ${packageJsonPath}: ${error.message}`);
                }
            }

            // Scan subdirectories, excluding build/generated directories
            for (const item of items) {
                if (EXCLUDED_DIRECTORIES.includes(item)) {
                    continue;
                }

                const itemPath = path.join(currentDir, item);
                try {
                    if (await storage.isDirectory(itemPath)) {
                        await scanDirectory(itemPath, depth + 1);
                    }
                } catch (error: any) {
                    // Skip directories that can't be accessed
                    logger.debug(`Skipped directory ${itemPath}: ${error.message}`);
                    continue;
                }
            }
        } catch (error: any) {
            logger.debug(`Failed to scan directory ${currentDir}: ${error.message}`);
        }
    };

    await scanDirectory(rootDir);

    logger.debug(`Found ${packageJsonFiles.length} package.json file(s) in directory tree`);
    return packageJsonFiles;
};

/**
 * Checks for file: dependencies in package.json files that should not be committed
 * @param storage Storage utility instance
 * @param rootDir Root directory to scan (defaults to current working directory)
 * @returns Array of issues found, empty array if no issues
 */
export const checkForFileDependencies = async (storage: any, rootDir: string = process.cwd()): Promise<FileDependencyIssue[]> => {
    const logger = getLogger();
    const issues: FileDependencyIssue[] = [];

    try {
        const packageJsonFiles = await findAllPackageJsonFiles(rootDir, storage);

        for (const { packageJson, relativePath } of packageJsonFiles) {
            const fileDeps: Array<{name: string, version: string, dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies'}> = [];

            // Check all dependency types for file: paths
            const dependencyChecks = [
                { deps: packageJson.dependencies, type: 'dependencies' as const },
                { deps: packageJson.devDependencies, type: 'devDependencies' as const },
                { deps: packageJson.peerDependencies, type: 'peerDependencies' as const }
            ];

            for (const { deps, type } of dependencyChecks) {
                if (deps) {
                    for (const [name, version] of Object.entries(deps)) {
                        if (version.startsWith('file:')) {
                            fileDeps.push({ name, version, dependencyType: type });
                        }
                    }
                }
            }

            if (fileDeps.length > 0) {
                issues.push({
                    packagePath: relativePath,
                    dependencies: fileDeps
                });
            }
        }
    } catch (error: any) {
        logger.debug(`Failed to check for file dependencies: ${error.message}`);
    }

    return issues;
};

/**
 * Logs file dependency issues in a user-friendly format
 * @param issues Array of file dependency issues
 * @param context Context for the warning (e.g., 'commit', 'link check')
 */
export const logFileDependencyWarning = (issues: FileDependencyIssue[], context: string = 'operation'): void => {
    const logger = getLogger();

    if (issues.length === 0) {
        return;
    }

    logger.warn(`FILE_DEPS_WARNING: Found file: dependencies that should not be committed | Context: ${context} | Count: ${issues.length} | Impact: May cause build issues`);
    for (const issue of issues) {
        logger.warn(`FILE_DEPS_PACKAGE: Package with file dependencies | Package: ${issue.packagePath}`);
        for (const dep of issue.dependencies) {
            logger.warn(`FILE_DEPS_DETAIL: Dependency details | Name: ${dep.name} | Version: ${dep.version} | Type: ${dep.dependencyType}`);
        }
    }
    logger.warn('');
};

/**
 * Provides suggestions for resolving file dependency issues
 * @param hasUnlinkCapability Whether the current context supports unlinking
 */
export const logFileDependencySuggestions = (hasUnlinkCapability: boolean = true): void => {
    const logger = getLogger();

    logger.warn('FILE_DEPS_RESOLUTION: Steps to resolve file dependency issues:');
    if (hasUnlinkCapability) {
        logger.warn('   STEP_1: Restore registry versions | Command: kodrdriv unlink');
        logger.warn('   STEP_2: Complete commit operation | Command: git commit');
        logger.warn('   STEP_3: Restore local development links | Command: kodrdriv link');
    } else {
        logger.warn('   STEP_1: Manually restore registry versions in package.json files');
        logger.warn('   STEP_2: Complete commit operation | Command: git commit');
        logger.warn('   STEP_3: Re-link local dependencies for development');
    }
    logger.warn('');
    logger.warn('FILE_DEPS_BYPASS: Alternative bypass options:');
    logger.warn('   OPTION_1: Skip file check | Flag: --skip-file-check');
    logger.warn('   OPTION_2: Skip all hooks | Command: git commit --no-verify');
    logger.warn('');
};
