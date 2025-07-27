#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { run } from '../util/child';
import * as Commit from './commit';
import { safeJsonParse, validatePackageJson } from '../util/validation';

// Create a package-scoped logger that prefixes all messages
const createPackageLogger = (packageName: string, sequenceNumber: number, totalCount: number, isDryRun: boolean = false) => {
    const baseLogger = getLogger();
    const prefix = `[${sequenceNumber}/${totalCount}] ${packageName}:`;
    const dryRunPrefix = isDryRun ? 'DRY RUN: ' : '';

    return {
        info: (message: string, ...args: any[]) => baseLogger.info(`${dryRunPrefix}${prefix} ${message}`, ...args),
        warn: (message: string, ...args: any[]) => baseLogger.warn(`${dryRunPrefix}${prefix} ${message}`, ...args),
        error: (message: string, ...args: any[]) => baseLogger.error(`${dryRunPrefix}${prefix} ${message}`, ...args),
        debug: (message: string, ...args: any[]) => baseLogger.debug(`${dryRunPrefix}${prefix} ${message}`, ...args),
        verbose: (message: string, ...args: any[]) => baseLogger.verbose(`${dryRunPrefix}${prefix} ${message}`, ...args),
        silly: (message: string, ...args: any[]) => baseLogger.silly(`${dryRunPrefix}${prefix} ${message}`, ...args),
    };
};

// Execute an operation with package context logging for nested operations
const withPackageContext = async <T>(
    packageName: string,
    sequenceNumber: number,
    totalCount: number,
    isDryRun: boolean,
    operation: () => Promise<T>
): Promise<T> => {
    const packageLogger = createPackageLogger(packageName, sequenceNumber, totalCount, isDryRun);

    try {
        packageLogger.verbose(`Starting nested operation...`);
        const result = await operation();
        packageLogger.verbose(`Nested operation completed`);
        return result;
    } catch (error: any) {
        packageLogger.error(`Nested operation failed: ${error.message}`);
        throw error;
    }
};

// Helper function to format subproject error output
const formatSubprojectError = (packageName: string, error: any): string => {
    const lines: string[] = [];

    lines.push(`❌ Command failed in package ${packageName}:`);

    // Format the main error message with indentation
    if (error.message) {
        const indentedMessage = error.message
            .split('\n')
            .map((line: string) => `    ${line}`)
            .join('\n');
        lines.push(indentedMessage);
    }

    // If there's stderr output, show it indented as well
    if (error.stderr && error.stderr.trim()) {
        lines.push('    STDERR:');
        const indentedStderr = error.stderr
            .split('\n')
            .filter((line: string) => line.trim())
            .map((line: string) => `      ${line}`)
            .join('\n');
        lines.push(indentedStderr);
    }

    // If there's stdout output, show it indented as well
    if (error.stdout && error.stdout.trim()) {
        lines.push('    STDOUT:');
        const indentedStdout = error.stdout
            .split('\n')
            .filter((line: string) => line.trim())
            .map((line: string) => `      ${line}`)
            .join('\n');
        lines.push(indentedStdout);
    }

    return lines.join('\n');
};

const matchesPattern = (filePath: string, pattern: string): boolean => {
    // Convert simple glob patterns to regex
    const regexPattern = pattern
        .replace(/\\/g, '\\\\')   // Escape backslashes
        .replace(/\*\*/g, '.*')   // ** matches any path segments
        .replace(/\*/g, '[^/]*')  // * matches any characters except path separator
        .replace(/\?/g, '.')      // ? matches any single character
        .replace(/\./g, '\\.');   // Escape literal dots

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(path.basename(filePath));
};

const shouldExclude = (packageJsonPath: string, excludedPatterns: string[]): boolean => {
    if (!excludedPatterns || excludedPatterns.length === 0) {
        return false;
    }

    // Check both the full path and relative path patterns
    const relativePath = path.relative(process.cwd(), packageJsonPath);

    return excludedPatterns.some(pattern =>
        matchesPattern(packageJsonPath, pattern) ||
        matchesPattern(relativePath, pattern) ||
        matchesPattern(path.dirname(packageJsonPath), pattern) ||
        matchesPattern(path.dirname(relativePath), pattern)
    );
};

interface PackageInfo {
    name: string;
    version: string;
    path: string;
    dependencies: Set<string>;
    localDependencies: Set<string>; // Dependencies that are local to this workspace
}

interface DependencyGraph {
    packages: Map<string, PackageInfo>;
    edges: Map<string, Set<string>>; // package -> set of packages it depends on
}

const scanForPackageJsonFiles = async (directory: string, excludedPatterns: string[] = []): Promise<string[]> => {
    const logger = getLogger();
    const packageJsonPaths: string[] = [];

    try {
        const entries = await fs.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subDirPath = path.join(directory, entry.name);
                const packageJsonPath = path.join(subDirPath, 'package.json');

                try {
                    await fs.access(packageJsonPath);

                    // Check if this package should be excluded
                    if (shouldExclude(packageJsonPath, excludedPatterns)) {
                        logger.verbose(`Excluding package.json at: ${packageJsonPath} (matches exclusion pattern)`);
                        continue;
                    }

                    packageJsonPaths.push(packageJsonPath);
                    logger.verbose(`Found package.json at: ${packageJsonPath}`);
                } catch {
                    // No package.json in this directory, continue
                }
            }
        }
    } catch (error) {
        logger.error(`Failed to scan directory ${directory}: ${error}`);
        throw error;
    }

    return packageJsonPaths;
};

const parsePackageJson = async (packageJsonPath: string): Promise<PackageInfo> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        const content = await storage.readFile(packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(content, packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageJsonPath);

        if (!packageJson.name) {
            throw new Error(`Package at ${packageJsonPath} has no name field`);
        }

        const dependencies = new Set<string>();

        // Collect all types of dependencies
        const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
        for (const depType of depTypes) {
            if (packageJson[depType]) {
                Object.keys(packageJson[depType]).forEach(dep => dependencies.add(dep));
            }
        }

        return {
            name: packageJson.name,
            version: packageJson.version || '0.0.0',
            path: path.dirname(packageJsonPath),
            dependencies,
            localDependencies: new Set() // Will be populated later
        };
    } catch (error) {
        logger.error(`Failed to parse package.json at ${packageJsonPath}: ${error}`);
        throw error;
    }
};

const buildDependencyGraph = async (packageJsonPaths: string[]): Promise<DependencyGraph> => {
    const logger = getLogger();
    const packages = new Map<string, PackageInfo>();
    const edges = new Map<string, Set<string>>();

    // First pass: parse all package.json files
    for (const packageJsonPath of packageJsonPaths) {
        const packageInfo = await parsePackageJson(packageJsonPath);
        packages.set(packageInfo.name, packageInfo);
        logger.verbose(`Parsed package: ${packageInfo.name} at ${packageInfo.path}`);
    }

    // Second pass: identify local dependencies and build edges
    for (const [packageName, packageInfo] of packages) {
        const localDeps = new Set<string>();
        const edges_set = new Set<string>();

        for (const dep of packageInfo.dependencies) {
            if (packages.has(dep)) {
                localDeps.add(dep);
                edges_set.add(dep);
                logger.verbose(`${packageName} depends on local package: ${dep}`);
            }
        }

        packageInfo.localDependencies = localDeps;
        edges.set(packageName, edges_set);
    }

    return { packages, edges };
};

const topologicalSort = (graph: DependencyGraph): string[] => {
    const logger = getLogger();
    const { packages, edges } = graph;
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (packageName: string): void => {
        if (visited.has(packageName)) {
            return;
        }

        if (visiting.has(packageName)) {
            throw new Error(`Circular dependency detected involving package: ${packageName}`);
        }

        visiting.add(packageName);

        // Visit all dependencies first
        const deps = edges.get(packageName) || new Set();
        for (const dep of deps) {
            visit(dep);
        }

        visiting.delete(packageName);
        visited.add(packageName);
        result.push(packageName);
    };

    // Visit all packages
    for (const packageName of packages.keys()) {
        if (!visited.has(packageName)) {
            visit(packageName);
        }
    }

    logger.verbose(`Topological sort completed. Build order determined for ${result.length} packages.`);
    return result;
};

// Group packages into dependency levels for parallel execution
const groupPackagesByDependencyLevels = (graph: DependencyGraph, buildOrder: string[]): string[][] => {
    const logger = getLogger();
    const { edges } = graph;
    const levels: string[][] = [];
    const packageLevels = new Map<string, number>();

    // Calculate the dependency level for each package
    const calculateLevel = (packageName: string): number => {
        if (packageLevels.has(packageName)) {
            return packageLevels.get(packageName)!;
        }

        const deps = edges.get(packageName) || new Set();
        if (deps.size === 0) {
            // No dependencies - this is level 0
            packageLevels.set(packageName, 0);
            return 0;
        }

        // Level is 1 + max level of dependencies
        let maxDepLevel = -1;
        for (const dep of deps) {
            const depLevel = calculateLevel(dep);
            maxDepLevel = Math.max(maxDepLevel, depLevel);
        }

        const level = maxDepLevel + 1;
        packageLevels.set(packageName, level);
        return level;
    };

    // Calculate levels for all packages
    for (const packageName of buildOrder) {
        calculateLevel(packageName);
    }

    // Group packages by their levels
    for (const packageName of buildOrder) {
        const level = packageLevels.get(packageName)!;
        while (levels.length <= level) {
            levels.push([]);
        }
        levels[level].push(packageName);
    }

    logger.verbose(`Packages grouped into ${levels.length} dependency levels for parallel execution`);
    for (let i = 0; i < levels.length; i++) {
        logger.verbose(`  Level ${i}: ${levels[i].join(', ')}`);
    }

    return levels;
};

// Execute commit operations for a single package
const executeCommitForPackage = async (
    packageName: string,
    packageInfo: PackageInfo,
    runConfig: Config,
    isDryRun: boolean,
    index: number,
    total: number
): Promise<{ success: boolean; error?: any }> => {
    const packageLogger = createPackageLogger(packageName, index + 1, total, isDryRun);
    const packageDir = packageInfo.path;

    packageLogger.info(`Starting commit operations...`);
    packageLogger.verbose(`Working directory: ${packageDir}`);

    try {
        if (isDryRun) {
            packageLogger.info(`Would execute: git add -A`);
            packageLogger.info(`Would execute: kodrdriv commit`);
            packageLogger.info(`In directory: ${packageDir}`);
        } else {
            // Change to the package directory and run the commands
            const originalCwd = process.cwd();
            try {
                process.chdir(packageDir);
                packageLogger.verbose(`Changed to directory: ${packageDir}`);

                // Step 1: Add all changes
                packageLogger.info(`Adding all changes to git...`);
                await withPackageContext(packageName, index + 1, total, isDryRun, async () => {
                    await run('git add -A');
                });
                packageLogger.verbose(`Git add completed`);

                // Step 2: Run commit command
                packageLogger.info(`Running commit command...`);
                await withPackageContext(packageName, index + 1, total, isDryRun, async () => {
                    await Commit.execute(runConfig);
                });
                packageLogger.info(`Commit completed successfully`);

                packageLogger.info(`✅ All commit operations completed successfully`);
            } finally {
                process.chdir(originalCwd);
                packageLogger.verbose(`Restored working directory to: ${originalCwd}`);
            }
        }
        return { success: true };
    } catch (error: any) {
        packageLogger.error(`❌ Commit operations failed: ${error.message}`);
        return { success: false, error };
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Determine the target directory - either specified or current working directory
    const targetDirectory = runConfig.commitTree?.directory || process.cwd();

    logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspace for commit operations at: ${targetDirectory}`);

    try {
        // Get exclusion patterns from config, fallback to empty array
        const excludedPatterns = runConfig.commitTree?.excludedPatterns || [];

        if (excludedPatterns.length > 0) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Using exclusion patterns: ${excludedPatterns.join(', ')}`);
        }

        // Scan for package.json files
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Scanning for package.json files...`);
        const packageJsonPaths = await scanForPackageJsonFiles(targetDirectory, excludedPatterns);

        if (packageJsonPaths.length === 0) {
            const message = `No package.json files found in subdirectories of ${targetDirectory}`;
            logger.warn(message);
            return message;
        }

        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Found ${packageJsonPaths.length} package.json files`);

        // Build dependency graph
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Building dependency graph...`);
        const dependencyGraph = await buildDependencyGraph(packageJsonPaths);

        // Perform topological sort to determine build order
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Determining build order...`);
        let buildOrder = topologicalSort(dependencyGraph);

        // Handle start-from functionality if specified
        const startFrom = runConfig.commitTree?.startFrom;
        if (startFrom) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Looking for start package: ${startFrom}`);

            // Find the package that matches the startFrom directory name
            const startIndex = buildOrder.findIndex(packageName => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const dirName = path.basename(packageInfo.path);
                return dirName === startFrom || packageName === startFrom;
            });

            if (startIndex === -1) {
                const availablePackages = buildOrder.map(name => {
                    const packageInfo = dependencyGraph.packages.get(name)!;
                    return `${path.basename(packageInfo.path)} (${name})`;
                }).join(', ');

                throw new Error(`Package directory '${startFrom}' not found. Available packages: ${availablePackages}`);
            }

            const skippedCount = startIndex;
            buildOrder = buildOrder.slice(startIndex);

            if (skippedCount > 0) {
                logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Resuming from '${startFrom}' - skipping ${skippedCount} package${skippedCount === 1 ? '' : 's'}`);
            }
        }

        // Display results
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Build order determined for commit operations:`);

        let output = `\nCommit Order for ${buildOrder.length} packages${startFrom ? ` (starting from ${startFrom})` : ''}:\n`;
        output += '======================================\n\n';

        buildOrder.forEach((packageName, index) => {
            const packageInfo = dependencyGraph.packages.get(packageName)!;
            const localDeps = Array.from(packageInfo.localDependencies);

            output += `${index + 1}. ${packageName} (${packageInfo.version})\n`;
            output += `   Path: ${packageInfo.path}\n`;

            if (localDeps.length > 0) {
                output += `   Local Dependencies: ${localDeps.join(', ')}\n`;
            } else {
                output += `   Local Dependencies: none\n`;
            }
            output += '\n';

            // Log each step
            if (localDeps.length > 0) {
                logger.info(`${index + 1}. ${packageName} (depends on: ${localDeps.join(', ')})`);
            } else {
                logger.info(`${index + 1}. ${packageName} (no local dependencies)`);
            }
        });

        // Execute commit operations
        const useParallel = runConfig.commitTree?.parallel || false;
        const parallelInfo = useParallel ? ' (with parallel execution)' : '';
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Running commit operations (git add -A + kodrdriv commit) in ${buildOrder.length} packages${parallelInfo}...`);

        let successCount = 0;
        let failedPackage: string | null = null;

        if (useParallel) {
            // Parallel execution: group packages by dependency levels
            const dependencyLevels = groupPackagesByDependencyLevels(dependencyGraph, buildOrder);

            for (let levelIndex = 0; levelIndex < dependencyLevels.length; levelIndex++) {
                const currentLevel = dependencyLevels[levelIndex];

                if (currentLevel.length === 1) {
                    const packageName = currentLevel[0];
                    logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Level ${levelIndex + 1}: Executing commit operations for ${packageName}...`);
                } else {
                    logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Level ${levelIndex + 1}: Executing commit operations for ${currentLevel.length} packages in parallel: ${currentLevel.join(', ')}...`);
                }

                // Execute all packages in this level in parallel
                const levelPromises = currentLevel.map((packageName) => {
                    const packageInfo = dependencyGraph.packages.get(packageName)!;
                    const globalIndex = buildOrder.indexOf(packageName);
                    return executeCommitForPackage(
                        packageName,
                        packageInfo,
                        runConfig,
                        isDryRun,
                        globalIndex,
                        buildOrder.length
                    );
                });

                // Wait for all packages in this level to complete
                const results = await Promise.allSettled(levelPromises);

                // Check results and handle errors
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];
                    const packageName = currentLevel[i];
                    const globalIndex = buildOrder.indexOf(packageName);
                    const packageLogger = createPackageLogger(packageName, globalIndex + 1, buildOrder.length, isDryRun);

                    if (result.status === 'fulfilled') {
                        if (result.value.success) {
                            successCount++;
                        } else {
                            // Package failed
                            failedPackage = packageName;
                            const formattedError = formatSubprojectError(packageName, result.value.error);

                            if (!isDryRun) {
                                packageLogger.error(`Commit operations failed`);
                                logger.error(formattedError);
                                logger.error(`Failed after ${successCount} successful packages.`);

                                const packageDir = dependencyGraph.packages.get(packageName)!.path;
                                const packageDirName = path.basename(packageDir);
                                logger.error(`To resume from this package, run:`);
                                logger.error(`    kodrdriv commit-tree --start-from ${packageDirName}`);

                                throw new Error(`Commit operations failed in package ${packageName}`);
                            }
                            break;
                        }
                    } else {
                        // Promise was rejected
                        failedPackage = packageName;

                        if (!isDryRun) {
                            packageLogger.error(`Unexpected error: ${result.reason}`);
                            logger.error(`Failed after ${successCount} successful packages.`);

                            const packageDir = dependencyGraph.packages.get(packageName)!.path;
                            const packageDirName = path.basename(packageDir);
                            logger.error(`To resume from this package, run:`);
                            logger.error(`    kodrdriv commit-tree --start-from ${packageDirName}`);

                            throw new Error(`Unexpected error in package ${packageName}`);
                        }
                        break;
                    }
                }

                // If any package failed, stop execution
                if (failedPackage) {
                    break;
                }

                if (currentLevel.length > 1) {
                    logger.info(`✅ Level ${levelIndex + 1} completed: all ${currentLevel.length} packages finished successfully`);
                } else if (currentLevel.length === 1 && successCount > 0) {
                    const packageName = currentLevel[0];
                    const globalIndex = buildOrder.indexOf(packageName);
                    const packageLogger = createPackageLogger(packageName, globalIndex + 1, buildOrder.length, isDryRun);
                    packageLogger.info(`✅ Level ${levelIndex + 1} completed successfully`);
                }
            }
        } else {
            // Sequential execution
            for (let i = 0; i < buildOrder.length; i++) {
                const packageName = buildOrder[i];
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const packageLogger = createPackageLogger(packageName, i + 1, buildOrder.length, isDryRun);

                const result = await executeCommitForPackage(
                    packageName,
                    packageInfo,
                    runConfig,
                    isDryRun,
                    i,
                    buildOrder.length
                );

                if (result.success) {
                    successCount++;
                } else {
                    failedPackage = packageName;
                    const formattedError = formatSubprojectError(packageName, result.error);

                    if (!isDryRun) {
                        packageLogger.error(`Commit operations failed`);
                        logger.error(formattedError);
                        logger.error(`Failed after ${successCount} successful packages.`);

                        const packageDir = packageInfo.path;
                        const packageDirName = path.basename(packageDir);
                        logger.error(`To resume from this package, run:`);
                        logger.error(`    kodrdriv commit-tree --start-from ${packageDirName}`);

                        throw new Error(`Commit operations failed in package ${packageName}`);
                    }
                    break;
                }
            }
        }

        if (!failedPackage) {
            const summary = `${isDryRun ? 'DRY RUN: ' : ''}All ${buildOrder.length} packages completed commit operations successfully! 🎉`;
            logger.info(summary);
            return output + `\n${summary}\n`;
        }

        return output;

    } catch (error: any) {
        const errorMessage = `Failed to execute commit-tree: ${error.message}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
};
