import path from 'path';
import { getLogger } from '../logging';

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
                    const packageJson = JSON.parse(packageJsonContent) as PackageJson;
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

    logger.warn(`⚠️  WARNING: Found file: dependencies that should not be committed during ${context}:`);
    for (const issue of issues) {
        logger.warn(`  📄 ${issue.packagePath}:`);
        for (const dep of issue.dependencies) {
            logger.warn(`    - ${dep.name}: ${dep.version} (${dep.dependencyType})`);
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

    logger.warn('💡 To resolve this:');
    if (hasUnlinkCapability) {
        logger.warn('   1. Run "kodrdriv unlink" to restore registry versions');
        logger.warn('   2. Complete your commit');
        logger.warn('   3. Run "kodrdriv link" again for local development');
    } else {
        logger.warn('   1. Manually restore registry versions in package.json files');
        logger.warn('   2. Complete your commit');
        logger.warn('   3. Re-link your local dependencies');
    }
    logger.warn('');
    logger.warn('   Or to bypass this check:');
    logger.warn('   - Add --skip-file-check flag to your command');
    logger.warn('   - Or use git commit --no-verify to skip all hooks');
    logger.warn('');
};
