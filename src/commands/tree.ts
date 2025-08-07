#!/usr/bin/env node
/**
 * Tree command - Central dependency analysis and tree traversal for kodrdriv
 *
 * This command supports two execution modes:
 * 1. Custom command mode: `kodrdriv tree --cmd "npm install"`
 * 2. Built-in command mode: `kodrdriv tree commit`, `kodrdriv tree publish`, etc.
 *
 * Built-in commands shell out to separate kodrdriv processes to preserve
 * individual project configurations while leveraging centralized dependency analysis.
 *
 * Supported built-in commands: commit, publish, link, unlink
 *
 * Enhanced logging based on debug/verbose flags:
 *
 * --debug:
 *   - Shows all command output (stdout/stderr)
 *   - Shows detailed debug messages about dependency levels and execution flow
 *   - Shows package-by-package dependency analysis
 *   - Shows detailed level start/completion information
 *
 * --verbose:
 *   - Shows exactly what's happening without full command output
 *   - Shows level-by-level execution progress
 *   - Shows package grouping information
 *   - Shows basic execution flow
 *
 * No flags:
 *   - Shows basic progress with numeric representation ([1/5] Package: Running...)
 *   - Shows level-by-level execution summaries
 *   - Shows completion status for each package and level
 */
import path from 'path';
import fs from 'fs/promises';
import child_process, { exec } from 'child_process';
import util from 'util';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { safeJsonParse, validatePackageJson } from '../util/validation';
import { getOutputPath } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Commit from './commit';

// Track published versions during tree publish
interface PublishedVersion {
    packageName: string;
    version: string;
    publishTime: Date;
}

// Tree execution context for persistence
interface TreeExecutionContext {
    command: string;
    originalConfig: Config;
    publishedVersions: PublishedVersion[];
    completedPackages: string[];
    buildOrder: string[];
    startTime: Date;
    lastUpdateTime: Date;
}

// Global state to track published versions during tree execution - protected by mutex
let publishedVersions: PublishedVersion[] = [];
let executionContext: TreeExecutionContext | null = null;

// Simple mutex to prevent race conditions in global state access
class SimpleMutex {
    private locked = false;
    private queue: Array<() => void> = [];

    async lock(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    unlock(): void {
        this.locked = false;
        const next = this.queue.shift();
        if (next) {
            this.locked = true;
            next();
        }
    }
}

const globalStateMutex = new SimpleMutex();

// Update inter-project dependencies in package.json based on published versions
const updateInterProjectDependencies = async (
    packageDir: string,
    publishedVersions: PublishedVersion[],
    allPackageNames: Set<string>,
    packageLogger: any,
    isDryRun: boolean
): Promise<boolean> => {
    const storage = createStorage({ log: packageLogger.info });
    const packageJsonPath = path.join(packageDir, 'package.json');

    if (!await storage.exists(packageJsonPath)) {
        packageLogger.verbose('No package.json found, skipping dependency updates');
        return false;
    }

    let hasChanges = false;

    try {
        const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageJsonPath);

        const sectionsToUpdate = ['dependencies', 'devDependencies', 'peerDependencies'];

        for (const publishedVersion of publishedVersions) {
            const { packageName, version } = publishedVersion;

            // Only update if this is an inter-project dependency (exists in our build tree)
            if (!allPackageNames.has(packageName)) {
                continue;
            }

            // Update the dependency in all relevant sections
            for (const section of sectionsToUpdate) {
                const deps = packageJson[section];
                if (deps && deps[packageName]) {
                    const oldVersion = deps[packageName];
                    const newVersion = `^${version}`;

                    if (oldVersion !== newVersion) {
                        if (isDryRun) {
                            packageLogger.info(`Would update ${section}.${packageName}: ${oldVersion} → ${newVersion}`);
                        } else {
                            packageLogger.info(`Updating ${section}.${packageName}: ${oldVersion} → ${newVersion}`);
                            deps[packageName] = newVersion;
                        }
                        hasChanges = true;
                    }
                }
            }
        }

        if (hasChanges && !isDryRun) {
            // Write updated package.json
            await storage.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
            packageLogger.info('Inter-project dependencies updated successfully');
        }

    } catch (error: any) {
        packageLogger.warn(`Failed to update inter-project dependencies: ${error.message}`);
        return false;
    }

    return hasChanges;
};

// Get the context file path
const getContextFilePath = (outputDirectory?: string): string => {
    const outputDir = outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    return getOutputPath(outputDir, '.kodrdriv-context');
};

// Save execution context to file
const saveExecutionContext = async (context: TreeExecutionContext, outputDirectory?: string): Promise<void> => {
    const storage = createStorage({ log: () => {} }); // Silent storage for context operations
    const contextFilePath = getContextFilePath(outputDirectory);

    try {
        // Ensure output directory exists
        await storage.ensureDirectory(path.dirname(contextFilePath));

        // Save context with JSON serialization that handles dates
        const contextData = {
            ...context,
            startTime: context.startTime.toISOString(),
            lastUpdateTime: context.lastUpdateTime.toISOString(),
            publishedVersions: context.publishedVersions.map(v => ({
                ...v,
                publishTime: v.publishTime.toISOString()
            }))
        };

        await storage.writeFile(contextFilePath, JSON.stringify(contextData, null, 2), 'utf-8');
    } catch (error: any) {
        // Don't fail the entire operation if context saving fails
        const logger = getLogger();
        logger.warn(`Warning: Failed to save execution context: ${error.message}`);
    }
};

// Load execution context from file
const loadExecutionContext = async (outputDirectory?: string): Promise<TreeExecutionContext | null> => {
    const storage = createStorage({ log: () => {} }); // Silent storage for context operations
    const contextFilePath = getContextFilePath(outputDirectory);

    try {
        if (!await storage.exists(contextFilePath)) {
            return null;
        }

        const contextContent = await storage.readFile(contextFilePath, 'utf-8');
        const contextData = JSON.parse(contextContent);

        // Restore dates from ISO strings
        return {
            ...contextData,
            startTime: new Date(contextData.startTime),
            lastUpdateTime: new Date(contextData.lastUpdateTime),
            publishedVersions: contextData.publishedVersions.map((v: any) => ({
                ...v,
                publishTime: new Date(v.publishTime)
            }))
        };
    } catch (error: any) {
        const logger = getLogger();
        logger.warn(`Warning: Failed to load execution context: ${error.message}`);
        return null;
    }
};

// Clean up context file
const cleanupContext = async (outputDirectory?: string): Promise<void> => {
    const storage = createStorage({ log: () => {} }); // Silent storage for context operations
    const contextFilePath = getContextFilePath(outputDirectory);

    try {
        if (await storage.exists(contextFilePath)) {
            await storage.deleteFile(contextFilePath);
        }
    } catch (error: any) {
        // Don't fail if cleanup fails
        const logger = getLogger();
        logger.warn(`Warning: Failed to cleanup execution context: ${error.message}`);
    }
};

// Extract published version from package.json after successful publish
const extractPublishedVersion = async (
    packageDir: string,
    packageLogger: any
): Promise<PublishedVersion | null> => {
    const storage = createStorage({ log: packageLogger.info });
    const packageJsonPath = path.join(packageDir, 'package.json');

    try {
        const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageJsonPath);

        return {
            packageName: packageJson.name,
            version: packageJson.version,
            publishTime: new Date()
        };
    } catch (error: any) {
        packageLogger.warn(`Failed to extract published version: ${error.message}`);
        return null;
    }
};

// Enhanced run function that can show output based on log level
const runWithLogging = async (
    command: string,
    packageLogger: any,
    options: child_process.ExecOptions = {},
    showOutput: 'none' | 'minimal' | 'full' = 'none'
): Promise<{ stdout: string; stderr: string }> => {
    const execPromise = util.promisify(exec);

    if (showOutput === 'full') {
        packageLogger.debug(`Executing command: ${command}`);
        // Use info level to show on console in debug mode
        packageLogger.info(`🔧 Running: ${command}`);
    } else if (showOutput === 'minimal') {
        packageLogger.verbose(`Running: ${command}`);
    }

    try {
        const result = await execPromise(command, options);

        if (showOutput === 'full') {
            if (result.stdout.trim()) {
                packageLogger.debug('STDOUT:');
                packageLogger.debug(result.stdout);
                // Show on console using info level for immediate feedback
                packageLogger.info(`📤 STDOUT:`);
                result.stdout.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
            if (result.stderr.trim()) {
                packageLogger.debug('STDERR:');
                packageLogger.debug(result.stderr);
                // Show on console using info level for immediate feedback
                packageLogger.info(`⚠️  STDERR:`);
                result.stderr.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
        }

        return result;
    } catch (error: any) {
        if (showOutput === 'full' || showOutput === 'minimal') {
            packageLogger.error(`Command failed: ${command}`);
            if (error.stdout && showOutput === 'full') {
                packageLogger.debug('STDOUT:');
                packageLogger.debug(error.stdout);
                packageLogger.info(`📤 STDOUT:`);
                error.stdout.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
            if (error.stderr && showOutput === 'full') {
                packageLogger.debug('STDERR:');
                packageLogger.debug(error.stderr);
                packageLogger.info(`❌ STDERR:`);
                error.stderr.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
        }
        throw error;
    }
};

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
        .replace(/\\/g, '\\\\')  // Escape backslashes
        .replace(/\*\*/g, '.*')  // ** matches any path segments
        .replace(/\*/g, '[^/]*') // * matches any characters except path separator
        .replace(/\?/g, '.')     // ? matches any single character
        .replace(/\./g, '\\.');  // Escape literal dots

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
        // First check if there's a package.json in the specified directory itself
        const directPackageJsonPath = path.join(directory, 'package.json');
        try {
            await fs.access(directPackageJsonPath);

            // Check if this package should be excluded
            if (!shouldExclude(directPackageJsonPath, excludedPatterns)) {
                packageJsonPaths.push(directPackageJsonPath);
                logger.verbose(`Found package.json at: ${directPackageJsonPath}`);
            } else {
                logger.verbose(`Excluding package.json at: ${directPackageJsonPath} (matches exclusion pattern)`);
            }
        } catch {
            // No package.json in the root of this directory, that's fine
        }

        // Then scan subdirectories for package.json files
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
const groupPackagesByDependencyLevels = (graph: DependencyGraph, buildOrder: string[], runConfig?: Config): string[][] => {
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
            if (runConfig?.debug) {
                logger.debug(`${packageName}: Level 0 (no local dependencies)`);
            }
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
        if (runConfig?.debug) {
            const depsList = Array.from(deps).join(', ');
            logger.debug(`${packageName}: Level ${level} (depends on: ${depsList})`);
        }
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

    // Only show grouping info if verbose or debug mode is enabled
    if (runConfig?.verbose || runConfig?.debug) {
        logger.verbose(`Packages grouped into ${levels.length} dependency levels for parallel execution`);
        for (let i = 0; i < levels.length; i++) {
            logger.verbose(`  Level ${i}: ${levels[i].join(', ')}`);
        }
    }

    return levels;
};

// Execute a single package and return execution result
const executePackage = async (
    packageName: string,
    packageInfo: PackageInfo,
    commandToRun: string,
    runConfig: Config,
    isDryRun: boolean,
    index: number,
    total: number,
    allPackageNames: Set<string>,
    isBuiltInCommand: boolean = false
): Promise<{ success: boolean; error?: any }> => {
    const packageLogger = createPackageLogger(packageName, index + 1, total, isDryRun);
    const packageDir = packageInfo.path;
    const logger = getLogger();

    // Determine output level based on flags
    let showOutput: 'none' | 'minimal' | 'full' = 'none';
    if (runConfig.debug) {
        showOutput = 'full';
    } else if (runConfig.verbose) {
        showOutput = 'minimal';
    }

    // Show package start info - always visible for progress tracking
    if (runConfig.debug) {
        packageLogger.debug(`Starting execution in ${packageDir}`);
        packageLogger.debug(`Command: ${commandToRun}`);
    } else if (runConfig.verbose) {
        packageLogger.verbose(`Starting execution in ${packageDir}`);
    } else {
        // Basic progress info even without flags
        logger.info(`[${index + 1}/${total}] ${packageName}: Running ${commandToRun}...`);
    }

    try {
        if (isDryRun) {
            // Handle inter-project dependency updates for publish commands in dry run mode
            await globalStateMutex.lock();
            try {
                if (isBuiltInCommand && commandToRun.includes('publish') && publishedVersions.length > 0) {
                    packageLogger.info('Would check for inter-project dependency updates before publish...');
                    const versionSnapshot = [...publishedVersions]; // Create safe copy
                    globalStateMutex.unlock();
                    await updateInterProjectDependencies(packageDir, versionSnapshot, allPackageNames, packageLogger, isDryRun);
                } else {
                    globalStateMutex.unlock();
                }
            } catch (error) {
                globalStateMutex.unlock();
                throw error;
            }

            // Use main logger for the specific message tests expect
            logger.info(`DRY RUN: Would execute: ${commandToRun}`);
            if (runConfig.debug || runConfig.verbose) {
                packageLogger.info(`In directory: ${packageDir}`);
            }
        } else {
            // Change to the package directory and run the command
            const originalCwd = process.cwd();
            try {
                process.chdir(packageDir);
                if (runConfig.debug) {
                    packageLogger.debug(`Changed to directory: ${packageDir}`);
                }

                // Handle inter-project dependency updates for publish commands before executing
                if (isBuiltInCommand && commandToRun.includes('publish') && publishedVersions.length > 0) {
                    packageLogger.info('Updating inter-project dependencies based on previously published packages...');
                    const hasUpdates = await updateInterProjectDependencies(packageDir, publishedVersions, allPackageNames, packageLogger, isDryRun);

                    if (hasUpdates) {
                        // Commit the dependency updates using kodrdriv commit
                        packageLogger.info('Committing inter-project dependency updates...');
                        try {
                            await Commit.execute({...runConfig, dryRun: false});
                            packageLogger.info('Inter-project dependency updates committed successfully');
                        } catch (commitError: any) {
                            packageLogger.warn(`Failed to commit inter-project dependency updates: ${commitError.message}`);
                            // Continue with publish anyway - the updates are still in place
                        }
                    }
                }

                if (runConfig.debug || runConfig.verbose) {
                    if (isBuiltInCommand) {
                        packageLogger.info(`Executing built-in command: ${commandToRun}`);
                    } else {
                        packageLogger.info(`Executing command: ${commandToRun}`);
                    }
                }

                // For built-in commands, shell out to a separate kodrdriv process
                // This preserves individual project configurations
                if (isBuiltInCommand) {
                    // Extract the command name from "kodrdriv <command>"
                    const builtInCommandName = commandToRun.replace('kodrdriv ', '');
                    if (runConfig.debug) {
                        packageLogger.debug(`Shelling out to separate kodrdriv process for ${builtInCommandName} command`);
                    }
                    // Use runWithLogging for built-in commands to capture all output
                    await runWithLogging(commandToRun, packageLogger, {}, showOutput);
                } else {
                    // For custom commands, use the existing logic
                    await runWithLogging(commandToRun, packageLogger, {}, showOutput);
                }

                // Track published version after successful publish
                if (isBuiltInCommand && commandToRun.includes('publish')) {
                    const publishedVersion = await extractPublishedVersion(packageDir, packageLogger);
                    if (publishedVersion) {
                        await globalStateMutex.lock();
                        try {
                            publishedVersions.push(publishedVersion);
                            packageLogger.info(`Tracked published version: ${publishedVersion.packageName}@${publishedVersion.version}`);
                        } finally {
                            globalStateMutex.unlock();
                        }
                    }
                }

                if (runConfig.debug || runConfig.verbose) {
                    packageLogger.info(`Command completed successfully`);
                } else {
                    // Basic completion info
                    logger.info(`[${index + 1}/${total}] ${packageName}: ✅ Completed`);
                }
            } finally {
                process.chdir(originalCwd);
                if (runConfig.debug) {
                    packageLogger.debug(`Restored working directory to: ${originalCwd}`);
                }
            }
        }
        return { success: true };
    } catch (error: any) {
        if (runConfig.debug || runConfig.verbose) {
            packageLogger.error(`❌ Execution failed: ${error.message}`);
        } else {
            logger.error(`[${index + 1}/${total}] ${packageName}: ❌ Failed - ${error.message}`);
        }
        return { success: false, error };
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;
    const isContinue = runConfig.tree?.continue || false;

    // Handle continue mode
    if (isContinue) {
        const savedContext = await loadExecutionContext(runConfig.outputDirectory);
        if (savedContext) {
            logger.info('Continuing previous tree execution...');
            logger.info(`Original command: ${savedContext.command}`);
            logger.info(`Started: ${savedContext.startTime.toISOString()}`);
            logger.info(`Previously completed: ${savedContext.completedPackages.length}/${savedContext.buildOrder.length} packages`);

            // Restore state safely
            await globalStateMutex.lock();
            try {
                publishedVersions = savedContext.publishedVersions;
            } finally {
                globalStateMutex.unlock();
            }
            executionContext = savedContext;

            // Use original config but allow some overrides (like dry run)
            runConfig = {
                ...savedContext.originalConfig,
                dryRun: runConfig.dryRun, // Allow dry run override
                outputDirectory: runConfig.outputDirectory || savedContext.originalConfig.outputDirectory
            };
        } else {
            logger.warn('No previous execution context found. Starting new execution...');
        }
    } else {
        // Reset published versions tracking for new tree execution
        publishedVersions = [];
        executionContext = null;
    }

    // Check if we're in built-in command mode (tree command with second argument)
    const builtInCommand = runConfig.tree?.builtInCommand;
    const supportedBuiltInCommands = ['commit', 'publish', 'link', 'unlink'];

    if (builtInCommand && !supportedBuiltInCommands.includes(builtInCommand)) {
        throw new Error(`Unsupported built-in command: ${builtInCommand}. Supported commands: ${supportedBuiltInCommands.join(', ')}`);
    }

    // Determine the target directories - either specified or current working directory
    const targetDirectories = runConfig.tree?.directories || [process.cwd()];

    if (targetDirectories.length === 1) {
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspace at: ${targetDirectories[0]}`);
    } else {
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspaces at: ${targetDirectories.join(', ')}`);
    }

    try {
        // Get exclusion patterns from config, fallback to empty array
        const excludedPatterns = runConfig.tree?.excludedPatterns || [];

        if (excludedPatterns.length > 0) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Using exclusion patterns: ${excludedPatterns.join(', ')}`);
        }

        // Scan for package.json files across all directories
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Scanning for package.json files...`);
        let allPackageJsonPaths: string[] = [];

        for (const targetDirectory of targetDirectories) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Scanning directory: ${targetDirectory}`);
            const packageJsonPaths = await scanForPackageJsonFiles(targetDirectory, excludedPatterns);
            allPackageJsonPaths = allPackageJsonPaths.concat(packageJsonPaths);
        }

        const packageJsonPaths = allPackageJsonPaths;

        if (packageJsonPaths.length === 0) {
            const directoriesStr = targetDirectories.join(', ');
            const message = `No package.json files found in subdirectories of: ${directoriesStr}`;
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
        const startFrom = runConfig.tree?.startFrom;
        if (startFrom) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Looking for start package: ${startFrom}`);

            // Find the package that matches the startFrom directory name
            const startIndex = buildOrder.findIndex(packageName => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const dirName = path.basename(packageInfo.path);
                return dirName === startFrom || packageName === startFrom;
            });

            if (startIndex === -1) {
                // Check if the package exists but was excluded across all directories
                let allPackageJsonPathsForCheck: string[] = [];
                for (const targetDirectory of targetDirectories) {
                    const packageJsonPaths = await scanForPackageJsonFiles(targetDirectory, []); // No exclusions
                    allPackageJsonPathsForCheck = allPackageJsonPathsForCheck.concat(packageJsonPaths);
                }
                let wasExcluded = false;

                for (const packageJsonPath of allPackageJsonPathsForCheck) {
                    try {
                        const packageInfo = await parsePackageJson(packageJsonPath);
                        const dirName = path.basename(packageInfo.path);

                        if (dirName === startFrom || packageInfo.name === startFrom) {
                            // Check if this package was excluded
                            if (shouldExclude(packageJsonPath, excludedPatterns)) {
                                wasExcluded = true;
                                break;
                            }
                        }
                    } catch {
                        // Skip invalid package.json files
                        continue;
                    }
                }

                if (wasExcluded) {
                    const excludedPatternsStr = excludedPatterns.join(', ');
                    throw new Error(`Package directory '${startFrom}' was excluded by exclusion patterns: ${excludedPatternsStr}. Remove the exclusion pattern or choose a different starting package.`);
                } else {
                    const availablePackages = buildOrder.map(name => {
                        const packageInfo = dependencyGraph.packages.get(name)!;
                        return `${path.basename(packageInfo.path)} (${name})`;
                    }).join(', ');

                    throw new Error(`Package directory '${startFrom}' not found. Available packages: ${availablePackages}`);
                }
            }

            const skippedCount = startIndex;
            buildOrder = buildOrder.slice(startIndex);

            if (skippedCount > 0) {
                logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Resuming from '${startFrom}' - skipping ${skippedCount} package${skippedCount === 1 ? '' : 's'}`);
            }
        }

        // Display results
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Build order determined:`);

        let returnOutput = '';

        if (runConfig.verbose || runConfig.debug) {
            // Verbose mode: Skip simple format, show detailed format before command execution
            logger.info(''); // Add spacing
            logger.info(`Detailed Build Order for ${buildOrder.length} packages${startFrom ? ` (starting from ${startFrom})` : ''}:`);
            logger.info('==========================================');

            buildOrder.forEach((packageName, index) => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const localDeps = Array.from(packageInfo.localDependencies);

                logger.info(`${index + 1}. ${packageName} (${packageInfo.version})`);
                logger.info(`   Path: ${packageInfo.path}`);

                if (localDeps.length > 0) {
                    logger.info(`   Local Dependencies: ${localDeps.join(', ')}`);
                } else {
                    logger.info(`   Local Dependencies: none`);
                }
                logger.info(''); // Add spacing between packages
            });

            // Simple return output for verbose mode (no need to repeat detailed info)
            returnOutput = `\nBuild order: ${buildOrder.join(' → ')}\n`;
        } else {
            // Non-verbose mode: Show simple build order
            buildOrder.forEach((packageName, index) => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const localDeps = Array.from(packageInfo.localDependencies);

                // Log each step
                if (localDeps.length > 0) {
                    logger.info(`${index + 1}. ${packageName} (depends on: ${localDeps.join(', ')})`);
                } else {
                    logger.info(`${index + 1}. ${packageName} (no local dependencies)`);
                }
            });

            // Simple return output for non-verbose mode
            returnOutput = `\nBuild order: ${buildOrder.join(' → ')}\n`;
        }

        // Execute command if provided (custom command or built-in command)
        const cmd = runConfig.tree?.cmd;
        const useParallel = runConfig.tree?.parallel || false;

        // Determine command to execute
        let commandToRun: string | undefined;
        let isBuiltInCommand = false;

        if (builtInCommand) {
            // Built-in command mode: shell out to kodrdriv subprocess
            commandToRun = `kodrdriv ${builtInCommand}`;
            isBuiltInCommand = true;
        } else if (cmd) {
            // Custom command mode
            commandToRun = cmd;
        }

        if (commandToRun) {
            // Create set of all package names for inter-project dependency detection
            const allPackageNames = new Set(Array.from(dependencyGraph.packages.keys()));

            // Initialize execution context if not continuing
            if (!executionContext) {
                executionContext = {
                    command: commandToRun,
                    originalConfig: runConfig,
                    publishedVersions: [],
                    completedPackages: [],
                    buildOrder: buildOrder,
                    startTime: new Date(),
                    lastUpdateTime: new Date()
                };

                // Save initial context
                if (isBuiltInCommand && builtInCommand === 'publish' && !isDryRun) {
                    await saveExecutionContext(executionContext, runConfig.outputDirectory);
                }
            }

            // Add spacing before command execution
            logger.info('');
            const executionDescription = isBuiltInCommand ? `built-in command "${builtInCommand}"` : `"${commandToRun}"`;
            const parallelInfo = useParallel ? ' (with parallel execution)' : '';
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Executing ${executionDescription} in ${buildOrder.length} packages${parallelInfo}...`);

            // Show info for publish commands
            if (isBuiltInCommand && builtInCommand === 'publish') {
                logger.info('Inter-project dependencies will be automatically updated before each publish.');
            }

            let successCount = 0;
            let failedPackage: string | null = null;

            // If continuing, start from where we left off
            const startIndex = isContinue && executionContext ? executionContext.completedPackages.length : 0;

            if (useParallel) {
                // Parallel execution: group packages by dependency levels
                const dependencyLevels = groupPackagesByDependencyLevels(dependencyGraph, buildOrder, runConfig);

                if (runConfig.debug) {
                    logger.debug(`Parallel execution strategy: ${dependencyLevels.length} dependency levels identified`);
                    for (let i = 0; i < dependencyLevels.length; i++) {
                        const level = dependencyLevels[i];
                        logger.debug(`  Level ${i + 1}: ${level.join(', ')} ${level.length > 1 ? '(parallel)' : '(sequential)'}`);
                    }
                }

                for (let levelIndex = 0; levelIndex < dependencyLevels.length; levelIndex++) {
                    const currentLevel = dependencyLevels[levelIndex];

                    if (runConfig.debug) {
                        if (currentLevel.length === 1) {
                            const packageName = currentLevel[0];
                            logger.debug(`Starting Level ${levelIndex + 1}: ${packageName} (no dependencies within this level)`);
                        } else {
                            logger.debug(`Starting Level ${levelIndex + 1}: ${currentLevel.length} packages can run in parallel`);
                            logger.debug(`  Parallel packages: ${currentLevel.join(', ')}`);
                        }
                    } else if (runConfig.verbose) {
                        if (currentLevel.length === 1) {
                            const packageName = currentLevel[0];
                            logger.verbose(`Level ${levelIndex + 1}: Executing ${packageName}...`);
                        } else {
                            logger.verbose(`Level ${levelIndex + 1}: Executing ${currentLevel.length} packages in parallel: ${currentLevel.join(', ')}...`);
                        }
                    } else {
                        // Basic level info
                        if (currentLevel.length === 1) {
                            const packageName = currentLevel[0];
                            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Level ${levelIndex + 1}: Executing ${packageName}...`);
                        } else {
                            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Level ${levelIndex + 1}: Executing ${currentLevel.length} packages in parallel: ${currentLevel.join(', ')}...`);
                        }
                    }

                    // Execute all packages in this level in parallel
                    const levelPromises = currentLevel.map((packageName) => {
                        const packageInfo = dependencyGraph.packages.get(packageName)!;
                        const globalIndex = buildOrder.indexOf(packageName);
                        return executePackage(
                            packageName,
                            packageInfo,
                            commandToRun!,
                            runConfig,
                            isDryRun,
                            globalIndex,
                            buildOrder.length,
                            allPackageNames,
                            isBuiltInCommand
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
                                // Add spacing between packages (except after the last one in the level)
                                if (i < currentLevel.length - 1) {
                                    logger.info('');
                                    logger.info('');
                                }
                            } else {
                                // Package failed
                                failedPackage = packageName;
                                const formattedError = formatSubprojectError(packageName, result.value.error);

                                if (!isDryRun) {
                                    packageLogger.error(`Execution failed`);
                                    logger.error(formattedError);
                                    logger.error(`Failed after ${successCount} successful packages.`);

                                    const packageDir = dependencyGraph.packages.get(packageName)!.path;
                                    const packageDirName = path.basename(packageDir);
                                    logger.error(`To resume from this package, run:`);
                                    if (isBuiltInCommand) {
                                        logger.error(`    kodrdriv tree ${builtInCommand} --start-from ${packageDirName}`);
                                    } else {
                                        logger.error(`    kodrdriv tree --start-from ${packageDirName} --cmd "${commandToRun}"`);
                                    }

                                    throw new Error(`Command failed in package ${packageName}`);
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
                                if (isBuiltInCommand) {
                                    logger.error(`    kodrdriv tree ${builtInCommand} --start-from ${packageDirName}`);
                                } else {
                                    logger.error(`    kodrdriv tree --start-from ${packageDirName} --cmd "${commandToRun}"`);
                                }

                                throw new Error(`Unexpected error in package ${packageName}`);
                            }
                            break;
                        }
                    }

                    // If any package failed, stop execution
                    if (failedPackage) {
                        break;
                    }

                    // Level completion logging
                    if (runConfig.debug) {
                        if (currentLevel.length > 1) {
                            logger.debug(`✅ Level ${levelIndex + 1} completed: all ${currentLevel.length} packages finished successfully`);
                            logger.debug(`  Completed packages: ${currentLevel.join(', ')}`);
                        } else if (currentLevel.length === 1 && successCount > 0) {
                            const packageName = currentLevel[0];
                            logger.debug(`✅ Level ${levelIndex + 1} completed: ${packageName} finished successfully`);
                        }
                    } else if (runConfig.verbose) {
                        if (currentLevel.length > 1) {
                            logger.verbose(`✅ Level ${levelIndex + 1} completed: all ${currentLevel.length} packages finished successfully`);
                        } else if (currentLevel.length === 1 && successCount > 0) {
                            const packageName = currentLevel[0];
                            logger.verbose(`✅ Level ${levelIndex + 1} completed: ${packageName} finished successfully`);
                        }
                    } else {
                        // Basic completion info
                        if (currentLevel.length > 1) {
                            logger.info(`✅ Level ${levelIndex + 1} completed: all ${currentLevel.length} packages finished successfully`);
                        } else if (currentLevel.length === 1 && successCount > 0) {
                            const packageName = currentLevel[0];
                            logger.info(`✅ Level ${levelIndex + 1} completed: ${packageName} finished successfully`);
                        }
                    }
                }
            } else {
                // Sequential execution
                for (let i = startIndex; i < buildOrder.length; i++) {
                    const packageName = buildOrder[i];

                    // Skip if already completed (in continue mode)
                    if (executionContext && executionContext.completedPackages.includes(packageName)) {
                        successCount++;
                        continue;
                    }

                    const packageInfo = dependencyGraph.packages.get(packageName)!;
                    const packageLogger = createPackageLogger(packageName, i + 1, buildOrder.length, isDryRun);

                    const result = await executePackage(
                        packageName,
                        packageInfo,
                        commandToRun!,
                        runConfig,
                        isDryRun,
                        i,
                        buildOrder.length,
                        allPackageNames,
                        isBuiltInCommand
                    );

                    if (result.success) {
                        successCount++;

                        // Update context
                        if (executionContext && isBuiltInCommand && builtInCommand === 'publish' && !isDryRun) {
                            executionContext.completedPackages.push(packageName);
                            executionContext.publishedVersions = publishedVersions;
                            executionContext.lastUpdateTime = new Date();
                            await saveExecutionContext(executionContext, runConfig.outputDirectory);
                        }

                        // Add spacing between packages (except after the last one)
                        if (i < buildOrder.length - 1) {
                            logger.info('');
                            logger.info('');
                        }
                    } else {
                        failedPackage = packageName;
                        const formattedError = formatSubprojectError(packageName, result.error);

                        if (!isDryRun) {
                            packageLogger.error(`Execution failed`);
                            logger.error(formattedError);
                            logger.error(`Failed after ${successCount} successful packages.`);

                            logger.error(`To resume from this point, run:`);
                            if (isBuiltInCommand) {
                                logger.error(`    kodrdriv tree ${builtInCommand} --continue`);
                            } else {
                                logger.error(`    kodrdriv tree --continue --cmd "${commandToRun}"`);
                            }

                            throw new Error(`Command failed in package ${packageName}`);
                        }
                        break;
                    }
                }
            }

            if (!failedPackage) {
                const summary = `${isDryRun ? 'DRY RUN: ' : ''}All ${buildOrder.length} packages completed successfully! 🎉`;
                logger.info(summary);

                // Clean up context on successful completion
                if (isBuiltInCommand && builtInCommand === 'publish' && !isDryRun) {
                    await cleanupContext(runConfig.outputDirectory);
                }

                return returnOutput; // Don't duplicate the summary in return string
            }
        }

        return returnOutput;

    } catch (error: any) {
        const errorMessage = `Failed to analyze workspace: ${error.message}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
};
