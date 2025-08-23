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
 * Supported built-in commands: commit, publish, link, unlink, development, branches
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
import * as Link from './link';
import * as Unlink from './unlink';
import { getGitStatusSummary, getGloballyLinkedPackages, getLinkedDependencies, getLinkCompatibilityProblems } from '../util/git';

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

// Function to reset global state (for testing)
export const __resetGlobalState = () => {
    publishedVersions = [];
    executionContext = null;
};

// Simple mutex to prevent race conditions in global state access
class SimpleMutex {
    private locked = false;
    private queue: Array<() => void> = [];
    private destroyed = false;

    async lock(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.destroyed) {
                reject(new Error('Mutex has been destroyed'));
                return;
            }

            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    unlock(): void {
        if (this.destroyed) {
            return;
        }

        this.locked = false;
        const next = this.queue.shift();
        if (next) {
            this.locked = true;
            try {
                next();
            } catch {
                // If resolver throws, unlock and continue with next in queue
                this.locked = false;
                const nextInQueue = this.queue.shift();
                if (nextInQueue) {
                    this.locked = true;
                    nextInQueue();
                }
            }
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.locked = false;

        // Reject all queued promises to prevent memory leaks
        while (this.queue.length > 0) {
            const resolver = this.queue.shift();
            if (resolver) {
                try {
                    // Treat as rejected promise to clean up
                    (resolver as any)(new Error('Mutex destroyed'));
                } catch {
                    // Ignore errors from rejected resolvers
                }
            }
        }
    }

    isDestroyed(): boolean {
        return this.destroyed;
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
        const contextData = safeJsonParse(contextContent, contextFilePath);

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
        if (isDryRun && !isBuiltInCommand) {
            // Handle inter-project dependency updates for publish commands in dry run mode
            if (isBuiltInCommand && commandToRun.includes('publish') && publishedVersions.length > 0) {
                let mutexLocked = false;
                try {
                    await globalStateMutex.lock();
                    mutexLocked = true;
                    packageLogger.info('Would check for inter-project dependency updates before publish...');
                    const versionSnapshot = [...publishedVersions]; // Create safe copy
                    globalStateMutex.unlock();
                    mutexLocked = false;
                    await updateInterProjectDependencies(packageDir, versionSnapshot, allPackageNames, packageLogger, isDryRun);
                } catch (error) {
                    if (mutexLocked) {
                        globalStateMutex.unlock();
                    }
                    throw error;
                }
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
                // Validate package directory exists before changing to it
                try {
                    await fs.access(packageDir);
                    const stat = await fs.stat(packageDir);
                    if (!stat.isDirectory()) {
                        throw new Error(`Path is not a directory: ${packageDir}`);
                    }
                } catch (accessError: any) {
                    throw new Error(`Cannot access package directory: ${packageDir} - ${accessError.message}`);
                }

                process.chdir(packageDir);
                if (runConfig.debug) {
                    packageLogger.debug(`Changed to directory: ${packageDir}`);
                }

                // Handle inter-project dependency updates for publish commands before executing (skip during dry run)
                if (!isDryRun && isBuiltInCommand && commandToRun.includes('publish') && publishedVersions.length > 0) {
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
                let publishWasSkipped: boolean | undefined;
                if (isBuiltInCommand) {
                    // Extract the command name from "kodrdriv <command>"
                    const builtInCommandName = commandToRun.replace('kodrdriv ', '');
                    if (runConfig.debug) {
                        packageLogger.debug(`Shelling out to separate kodrdriv process for ${builtInCommandName} command`);
                    }
                    // Ensure dry-run propagates to subprocess even during overall dry-run mode
                    const effectiveCommand = runConfig.dryRun && !commandToRun.includes('--dry-run')
                        ? `${commandToRun} --dry-run`
                        : commandToRun;
                    // Use runWithLogging for built-in commands to capture all output
                    const { stdout } = await runWithLogging(effectiveCommand, packageLogger, {}, showOutput);
                    // Detect explicit skip marker from publish to avoid propagating versions
                    if (builtInCommandName === 'publish' && stdout && stdout.includes('KODRDRIV_PUBLISH_SKIPPED')) {
                        packageLogger.info('Publish skipped for this package; will not record or propagate a version.');
                        publishWasSkipped = true;
                    }
                } else {
                    // For custom commands, use the existing logic
                    await runWithLogging(commandToRun, packageLogger, {}, showOutput);
                }

                // Track published version after successful publish (skip during dry run)
                if (!isDryRun && isBuiltInCommand && commandToRun.includes('publish')) {
                    // If publish was skipped, do not record a version
                    if (publishWasSkipped) {
                        packageLogger.verbose('Skipping version tracking due to earlier skip.');
                    } else {
                        // Only record a published version if a new tag exists (avoid recording for skipped publishes)
                        const publishedVersion = await extractPublishedVersion(packageDir, packageLogger);
                        if (publishedVersion) {
                            let mutexLocked = false;
                            try {
                                await globalStateMutex.lock();
                                mutexLocked = true;
                                publishedVersions.push(publishedVersion);
                                packageLogger.info(`Tracked published version: ${publishedVersion.packageName}@${publishedVersion.version}`);
                                globalStateMutex.unlock();
                                mutexLocked = false;
                            } catch (error) {
                                if (mutexLocked) {
                                    globalStateMutex.unlock();
                                }
                                throw error;
                            }
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
                // Safely restore working directory
                try {
                    // Validate original directory still exists before changing back
                    const fs = await import('fs/promises');
                    await fs.access(originalCwd);
                    process.chdir(originalCwd);
                    if (runConfig.debug) {
                        packageLogger.debug(`Restored working directory to: ${originalCwd}`);
                    }
                } catch (restoreError: any) {
                    // If we can't restore to original directory, at least log the issue
                    packageLogger.error(`Failed to restore working directory to ${originalCwd}: ${restoreError.message}`);
                    packageLogger.error(`Current working directory is now: ${process.cwd()}`);
                    // Don't throw here to avoid masking the original error
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
            let mutexLocked = false;
            try {
                await globalStateMutex.lock();
                mutexLocked = true;
                publishedVersions = savedContext.publishedVersions;
                globalStateMutex.unlock();
                mutexLocked = false;
            } catch (error) {
                if (mutexLocked) {
                    globalStateMutex.unlock();
                }
                throw error;
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
    const supportedBuiltInCommands = ['commit', 'publish', 'link', 'unlink', 'development', 'branches'];

    if (builtInCommand && !supportedBuiltInCommands.includes(builtInCommand)) {
        throw new Error(`Unsupported built-in command: ${builtInCommand}. Supported commands: ${supportedBuiltInCommands.join(', ')}`);
    }

    // Determine the target directories - either specified or current working directory
    const directories = runConfig.tree?.directories || [process.cwd()];

    // Handle link status subcommand
    if (builtInCommand === 'link' && runConfig.tree?.packageArgument === 'status') {
        // For tree link status, we want to show status across all packages
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Running link status across workspace...`);

        // Create a config that will be passed to the link command
        const linkConfig: Config = {
            ...runConfig,
            tree: {
                ...runConfig.tree,
                directories: directories
            }
        };

        try {
            const result = await Link.execute(linkConfig, 'status');
            return result;
        } catch (error: any) {
            logger.error(`Link status failed: ${error.message}`);
            throw error;
        }
    }

    // Handle unlink status subcommand
    if (builtInCommand === 'unlink' && runConfig.tree?.packageArgument === 'status') {
        // For tree unlink status, we want to show status across all packages
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Running unlink status across workspace...`);

        // Create a config that will be passed to the unlink command
        const unlinkConfig: Config = {
            ...runConfig,
            tree: {
                ...runConfig.tree,
                directories: directories
            }
        };

        try {
            const result = await Unlink.execute(unlinkConfig, 'status');
            return result;
        } catch (error: any) {
            logger.error(`Unlink status failed: ${error.message}`);
            throw error;
        }
    }

    if (directories.length === 1) {
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspace at: ${directories[0]}`);
    } else {
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspaces at: ${directories.join(', ')}`);
    }

    try {
        // Get exclusion patterns from config, fallback to empty array
        const excludedPatterns = runConfig.tree?.exclude || [];

        if (excludedPatterns.length > 0) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Using exclusion patterns: ${excludedPatterns.join(', ')}`);
        }

        // Scan for package.json files across all directories
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Scanning for package.json files...`);
        let allPackageJsonPaths: string[] = [];

        for (const targetDirectory of directories) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Scanning directory: ${targetDirectory}`);
            const packageJsonPaths = await scanForPackageJsonFiles(targetDirectory, excludedPatterns);
            allPackageJsonPaths = allPackageJsonPaths.concat(packageJsonPaths);
        }

        const packageJsonPaths = allPackageJsonPaths;

        if (packageJsonPaths.length === 0) {
            const directoriesStr = directories.join(', ');
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

            // Resolve the actual package name (can be package name or directory name)
            let startPackageName: string | null = null;
            for (const [pkgName, pkgInfo] of dependencyGraph.packages) {
                const dirName = path.basename(pkgInfo.path);
                if (dirName === startFrom || pkgName === startFrom) {
                    startPackageName = pkgName;
                    break;
                }
            }

            if (!startPackageName) {
                // Check if the package exists but was excluded across all directories
                let allPackageJsonPathsForCheck: string[] = [];
                for (const targetDirectory of directories) {
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

            // Build reverse dependency map (who depends on whom)
            const reverseEdges = new Map<string, Set<string>>();
            for (const [pkg, deps] of dependencyGraph.edges) {
                for (const dep of deps) {
                    if (!reverseEdges.has(dep)) reverseEdges.set(dep, new Set<string>());
                    reverseEdges.get(dep)!.add(pkg);
                }
                if (!reverseEdges.has(pkg)) reverseEdges.set(pkg, new Set<string>());
            }

            // Step 1: collect the start package and all its transitive dependents (consumers)
            const dependentsClosure = new Set<string>();
            const queueDependents: string[] = [startPackageName!];
            while (queueDependents.length > 0) {
                const current = queueDependents.shift()!;
                if (dependentsClosure.has(current)) continue;
                dependentsClosure.add(current);
                const consumers = reverseEdges.get(current) || new Set<string>();
                for (const consumer of consumers) {
                    if (!dependentsClosure.has(consumer)) queueDependents.push(consumer);
                }
            }

            // Step 2: expand to include all forward dependencies required to build those packages
            const relevantPackages = new Set<string>(dependentsClosure);
            const queueDependencies: string[] = Array.from(relevantPackages);
            while (queueDependencies.length > 0) {
                const current = queueDependencies.shift()!;
                const deps = dependencyGraph.edges.get(current) || new Set<string>();
                for (const dep of deps) {
                    if (!relevantPackages.has(dep)) {
                        relevantPackages.add(dep);
                        queueDependencies.push(dep);
                    }
                }
            }

            // Filter graph to only relevant packages
            const filteredGraph: DependencyGraph = {
                packages: new Map<string, PackageInfo>(),
                edges: new Map<string, Set<string>>()
            };
            for (const pkgName of relevantPackages) {
                const info = dependencyGraph.packages.get(pkgName)!;
                filteredGraph.packages.set(pkgName, info);
                const deps = dependencyGraph.edges.get(pkgName) || new Set<string>();
                const filteredDeps = new Set<string>();
                for (const dep of deps) {
                    if (relevantPackages.has(dep)) filteredDeps.add(dep);
                }
                filteredGraph.edges.set(pkgName, filteredDeps);
            }

            // Recompute build order for the filtered subgraph
            buildOrder = topologicalSort(filteredGraph);
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Limiting scope to '${startFrom}' and its dependencies (${buildOrder.length} package${buildOrder.length === 1 ? '' : 's'}).`);
        }

        // Handle stop-at functionality if specified
        const stopAt = runConfig.tree?.stopAt;
        if (stopAt) {
            logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Looking for stop package: ${stopAt}`);

            // Find the package that matches the stopAt directory name
            const stopIndex = buildOrder.findIndex(packageName => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const dirName = path.basename(packageInfo.path);
                return dirName === stopAt || packageName === stopAt;
            });

            if (stopIndex === -1) {
                // Check if the package exists but was excluded across all directories
                let allPackageJsonPathsForCheck: string[] = [];
                for (const targetDirectory of directories) {
                    const packageJsonPaths = await scanForPackageJsonFiles(targetDirectory, []); // No exclusions
                    allPackageJsonPathsForCheck = allPackageJsonPathsForCheck.concat(packageJsonPaths);
                }
                let wasExcluded = false;

                for (const packageJsonPath of allPackageJsonPathsForCheck) {
                    try {
                        const packageInfo = await parsePackageJson(packageJsonPath);
                        const dirName = path.basename(packageInfo.path);

                        if (dirName === stopAt || packageInfo.name === stopAt) {
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
                    throw new Error(`Package directory '${stopAt}' was excluded by exclusion patterns: ${excludedPatternsStr}. Remove the exclusion pattern or choose a different stop package.`);
                } else {
                    const availablePackages = buildOrder.map(name => {
                        const packageInfo = dependencyGraph.packages.get(name)!;
                        return `${path.basename(packageInfo.path)} (${name})`;
                    }).join(', ');

                    throw new Error(`Package directory '${stopAt}' not found. Available packages: ${availablePackages}`);
                }
            }

            // Truncate the build order before the stop package (the stop package is not executed)
            const originalLength = buildOrder.length;
            buildOrder = buildOrder.slice(0, stopIndex);

            const stoppedCount = originalLength - stopIndex;
            if (stoppedCount > 0) {
                logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Stopping before '${stopAt}' - excluding ${stoppedCount} package${stoppedCount === 1 ? '' : 's'}`);
            }
        }

        // Helper function to determine version scope indicator
        const getVersionScopeIndicator = (versionRange: string): string => {
            // Remove whitespace and check the pattern
            const cleanRange = versionRange.trim();

            // Preserve the original prefix (^, ~, >=, etc.)
            const prefixMatch = cleanRange.match(/^([^0-9]*)/);
            const prefix = prefixMatch ? prefixMatch[1] : '';

            // Extract the version part after the prefix
            const versionPart = cleanRange.substring(prefix.length);

            // Count the number of dots to determine scope
            const dotCount = (versionPart.match(/\./g) || []).length;

            if (dotCount >= 2) {
                // Has patch version (e.g., "^4.4.32" -> "^P")
                return prefix + 'P';
            } else if (dotCount === 1) {
                // Has minor version only (e.g., "^4.4" -> "^m")
                return prefix + 'm';
            } else if (dotCount === 0 && versionPart.match(/^\d+$/)) {
                // Has major version only (e.g., "^4" -> "^M")
                return prefix + 'M';
            }

            // For complex ranges or non-standard formats, return as-is
            return cleanRange;
        };

        // Helper function to find packages that consume a given package
        const findConsumingPackagesForBranches = async (
            targetPackageName: string,
            allPackages: Map<string, PackageInfo>,
            storage: any
        ): Promise<string[]> => {
            const consumers: string[] = [];

            // Extract scope from target package name (e.g., "@fjell/eslint-config" -> "@fjell/")
            const targetScope = targetPackageName.includes('/') ? targetPackageName.split('/')[0] + '/' : null;

            for (const [packageName, packageInfo] of allPackages) {
                if (packageName === targetPackageName) continue;

                try {
                    const packageJsonPath = path.join(packageInfo.path, 'package.json');
                    const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
                    const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
                    const packageJson = validatePackageJson(parsed, packageJsonPath);

                    // Check if this package depends on the target package and get the version range
                    const dependencyTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
                    let versionRange: string | null = null;

                    for (const depType of dependencyTypes) {
                        if (packageJson[depType] && packageJson[depType][targetPackageName]) {
                            versionRange = packageJson[depType][targetPackageName];
                            break;
                        }
                    }

                    if (versionRange) {
                        // Apply scope substitution for consumers in the same scope
                        let consumerDisplayName = packageName;
                        if (targetScope && packageName.startsWith(targetScope)) {
                            // Replace scope with "./" (e.g., "@fjell/core" -> "./core")
                            consumerDisplayName = './' + packageName.substring(targetScope.length);
                        }

                        // Add version scope indicator
                        const scopeIndicator = getVersionScopeIndicator(versionRange);
                        consumerDisplayName += ` (${scopeIndicator})`;

                        consumers.push(consumerDisplayName);
                    }
                } catch {
                    // Skip packages we can't parse
                    continue;
                }
            }

            return consumers.sort();
        };

        // Handle special "branches" command that displays table
        if (builtInCommand === 'branches') {
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Branch Status Summary:`);
            logger.info('');

            // Calculate column widths for nice formatting
            let maxNameLength = 'Package'.length;
            let maxBranchLength = 'Branch'.length;
            let maxVersionLength = 'Version'.length;
            let maxStatusLength = 'Status'.length;
            let maxLinkLength = 'Linked'.length;
            let maxConsumersLength = 'Consumers'.length;

            const branchInfos: Array<{
                name: string;
                branch: string;
                version: string;
                status: string;
                linked: string;
                consumers: string[];
            }> = [];

            // Create storage instance for consumer lookup
            const storage = createStorage({ log: () => {} });

            // Get globally linked packages once at the beginning
            const globallyLinkedPackages = await getGloballyLinkedPackages();

            // ANSI escape codes for progress display
            const ANSI = {
                CURSOR_UP: '\x1b[1A',
                CURSOR_TO_START: '\x1b[0G',
                CLEAR_LINE: '\x1b[2K',
                GREEN: '\x1b[32m',
                BLUE: '\x1b[34m',
                YELLOW: '\x1b[33m',
                RESET: '\x1b[0m',
                BOLD: '\x1b[1m'
            };

            // Check if terminal supports ANSI
            const supportsAnsi = process.stdout.isTTY &&
                                  process.env.TERM !== 'dumb' &&
                                  !process.env.NO_COLOR;

            const totalPackages = buildOrder.length;
            const concurrency = 5; // Process up to 5 packages at a time
            let completedCount = 0;
            let isFirstProgress = true;

            // Function to update progress display
            const updateProgress = (currentPackage: string, completed: number, total: number) => {
                if (!supportsAnsi) return;

                if (!isFirstProgress) {
                    // Move cursor up and clear the line
                    process.stdout.write(ANSI.CURSOR_UP + ANSI.CURSOR_TO_START + ANSI.CLEAR_LINE);
                }

                const percentage = Math.round((completed / total) * 100);
                const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
                const progress = `${ANSI.BLUE}${ANSI.BOLD}Analyzing packages... ${ANSI.GREEN}[${progressBar}] ${percentage}%${ANSI.RESET} ${ANSI.YELLOW}(${completed}/${total})${ANSI.RESET}`;
                const current = currentPackage ? ` - Currently: ${currentPackage}` : '';

                process.stdout.write(progress + current + '\n');
                isFirstProgress = false;
            };

            // Function to process a single package
            const processPackage = async (packageName: string): Promise<{
                name: string;
                branch: string;
                version: string;
                status: string;
                linked: string;
                consumers: string[];
            }> => {
                const packageInfo = dependencyGraph.packages.get(packageName)!;

                try {
                    // Process git status and consumers in parallel
                    const [gitStatus, consumers] = await Promise.all([
                        getGitStatusSummary(packageInfo.path),
                        findConsumingPackagesForBranches(packageName, dependencyGraph.packages, storage)
                    ]);

                    // Check if this package is globally linked (available to be linked to)
                    const isGloballyLinked = globallyLinkedPackages.has(packageName);
                    const linkedText = isGloballyLinked ? '✓' : '';

                    // Add asterisk to consumers that are actively linking to globally linked packages
                    // and check for link problems to highlight in red
                    const consumersWithLinkStatus = await Promise.all(consumers.map(async (consumer) => {
                        // Extract the base consumer name from the format "package-name (^P)" or "./scoped-name (^m)"
                        const baseConsumerName = consumer.replace(/ \([^)]+\)$/, ''); // Remove version scope indicator

                        // Get the original package name from display name (remove scope substitution)
                        const originalConsumerName = baseConsumerName.startsWith('./')
                            ? baseConsumerName.replace('./', packageName.split('/')[0] + '/')
                            : baseConsumerName;

                        // Find the consumer package info to get its path
                        const consumerPackageInfo = Array.from(dependencyGraph.packages.values())
                            .find(pkg => pkg.name === originalConsumerName);

                        if (consumerPackageInfo) {
                            const [consumerLinkedDeps, linkProblems] = await Promise.all([
                                getLinkedDependencies(consumerPackageInfo.path),
                                getLinkCompatibilityProblems(consumerPackageInfo.path, dependencyGraph.packages)
                            ]);

                            let consumerDisplay = consumer;

                            // Add asterisk if this consumer is actively linking to this package
                            if (consumerLinkedDeps.has(packageName)) {
                                consumerDisplay += '*';
                            }

                            // Check if this consumer has link problems with the current package
                            if (linkProblems.has(packageName)) {
                                // Highlight in red using ANSI escape codes (only if terminal supports it)
                                if (supportsAnsi) {
                                    consumerDisplay = `\x1b[31m${consumerDisplay}\x1b[0m`;
                                } else {
                                    // Fallback for terminals that don't support ANSI colors
                                    consumerDisplay += ' [LINK PROBLEM]';
                                }
                            }

                            return consumerDisplay;
                        }

                        return consumer;
                    }));

                    return {
                        name: packageName,
                        branch: gitStatus.branch,
                        version: packageInfo.version,
                        status: gitStatus.status,
                        linked: linkedText,
                        consumers: consumersWithLinkStatus
                    };
                } catch (error: any) {
                    logger.warn(`Failed to get git status for ${packageName}: ${error.message}`);
                    return {
                        name: packageName,
                        branch: 'error',
                        version: packageInfo.version,
                        status: 'error',
                        linked: '✗',
                        consumers: ['error']
                    };
                }
            };

            // Process packages in batches with progress updates
            updateProgress('Starting...', 0, totalPackages);

            for (let i = 0; i < buildOrder.length; i += concurrency) {
                const batch = buildOrder.slice(i, i + concurrency);

                // Update progress to show current batch
                const currentBatchStr = batch.length === 1 ? batch[0] : `${batch[0]} + ${batch.length - 1} others`;
                updateProgress(currentBatchStr, completedCount, totalPackages);

                // Process batch in parallel
                const batchResults = await Promise.all(
                    batch.map(packageName => processPackage(packageName))
                );

                // Add results and update column widths
                for (const result of batchResults) {
                    branchInfos.push(result);
                    maxNameLength = Math.max(maxNameLength, result.name.length);
                    maxBranchLength = Math.max(maxBranchLength, result.branch.length);
                    maxVersionLength = Math.max(maxVersionLength, result.version.length);
                    maxStatusLength = Math.max(maxStatusLength, result.status.length);
                    maxLinkLength = Math.max(maxLinkLength, result.linked.length);

                    // For consumers, calculate the width based on the longest consumer name
                    const maxConsumerLength = result.consumers.length > 0
                        ? Math.max(...result.consumers.map(c => c.length))
                        : 0;
                    maxConsumersLength = Math.max(maxConsumersLength, maxConsumerLength);
                }

                completedCount += batch.length;
                updateProgress('', completedCount, totalPackages);
            }

            // Clear progress line and add spacing
            if (supportsAnsi && !isFirstProgress) {
                process.stdout.write(ANSI.CURSOR_UP + ANSI.CURSOR_TO_START + ANSI.CLEAR_LINE);
            }
            logger.info(`${ANSI.GREEN}✅ Analysis complete!${ANSI.RESET} Processed ${totalPackages} packages in batches of ${concurrency}.`);
            logger.info('');

            // Print header (new order: Package | Branch | Version | Status | Linked | Consumers)
            const nameHeader = 'Package'.padEnd(maxNameLength);
            const branchHeader = 'Branch'.padEnd(maxBranchLength);
            const versionHeader = 'Version'.padEnd(maxVersionLength);
            const statusHeader = 'Status'.padEnd(maxStatusLength);
            const linkHeader = 'Linked'.padEnd(maxLinkLength);
            const consumersHeader = 'Consumers';

            logger.info(`${nameHeader} | ${branchHeader} | ${versionHeader} | ${statusHeader} | ${linkHeader} | ${consumersHeader}`);
            logger.info(`${'-'.repeat(maxNameLength)} | ${'-'.repeat(maxBranchLength)} | ${'-'.repeat(maxVersionLength)} | ${'-'.repeat(maxStatusLength)} | ${'-'.repeat(maxLinkLength)} | ${'-'.repeat(9)}`);

            // Print data rows with multi-line consumers
            for (const info of branchInfos) {
                const nameCol = info.name.padEnd(maxNameLength);
                const branchCol = info.branch.padEnd(maxBranchLength);
                const versionCol = info.version.padEnd(maxVersionLength);
                const statusCol = info.status.padEnd(maxStatusLength);
                const linkCol = info.linked.padEnd(maxLinkLength);

                if (info.consumers.length === 0) {
                    // No consumers - single line
                    logger.info(`${nameCol} | ${branchCol} | ${versionCol} | ${statusCol} | ${linkCol} | `);
                } else if (info.consumers.length === 1) {
                    // Single consumer - single line
                    logger.info(`${nameCol} | ${branchCol} | ${versionCol} | ${statusCol} | ${linkCol} | ${info.consumers[0]}`);
                } else {
                    // Multiple consumers - first consumer on same line, rest on new lines with continuous column separators
                    logger.info(`${nameCol} | ${branchCol} | ${versionCol} | ${statusCol} | ${linkCol} | ${info.consumers[0]}`);

                    // Additional consumers on separate lines with proper column separators
                    const emptyNameCol = ' '.repeat(maxNameLength);
                    const emptyBranchCol = ' '.repeat(maxBranchLength);
                    const emptyVersionCol = ' '.repeat(maxVersionLength);
                    const emptyStatusCol = ' '.repeat(maxStatusLength);
                    const emptyLinkCol = ' '.repeat(maxLinkLength);

                    for (let i = 1; i < info.consumers.length; i++) {
                        logger.info(`${emptyNameCol} | ${emptyBranchCol} | ${emptyVersionCol} | ${emptyStatusCol} | ${emptyLinkCol} | ${info.consumers[i]}`);
                    }
                }
            }

            logger.info('');
            // Add legend explaining the symbols and colors
            logger.info('Legend:');
            logger.info('  * = Consumer is actively linking to this package');
            logger.info('  (^P) = Patch-level dependency (e.g., "^4.4.32")');
            logger.info('  (^m) = Minor-level dependency (e.g., "^4.4")');
            logger.info('  (^M) = Major-level dependency (e.g., "^4")');
            logger.info('  (~P), (>=M), etc. = Other version prefixes preserved');
            if (supportsAnsi) {
                logger.info('  \x1b[31mRed text\x1b[0m = Consumer has link problems (version mismatches) with this package');
            } else {
                logger.info('  [LINK PROBLEM] = Consumer has link problems (version mismatches) with this package');
            }
            logger.info('');
            return `Branch status summary for ${branchInfos.length} packages completed.`;
        }

        // Display results
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Build order determined:`);

        let returnOutput = '';

        if (runConfig.verbose || runConfig.debug) {
            // Verbose mode: Skip simple format, show detailed format before command execution
            logger.info(''); // Add spacing
            const rangeInfo = [];
            if (startFrom) rangeInfo.push(`starting from ${startFrom}`);
            if (stopAt) rangeInfo.push(`stopping before ${stopAt}`);
            const rangeStr = rangeInfo.length > 0 ? ` (${rangeInfo.join(', ')})` : '';
            logger.info(`Detailed Build Order for ${buildOrder.length} packages${rangeStr}:`);
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

        // Determine command to execute
        let commandToRun: string | undefined;
        let isBuiltInCommand = false;

        if (builtInCommand) {
            // Built-in command mode: shell out to kodrdriv subprocess
            // Build command with propagated global options
            const globalOptions: string[] = [];

            // Propagate global flags that should be inherited by subprocesses
            if (runConfig.debug) globalOptions.push('--debug');
            if (runConfig.verbose) globalOptions.push('--verbose');
            if (runConfig.dryRun) globalOptions.push('--dry-run');
            if (runConfig.overrides) globalOptions.push('--overrides');

            // Propagate global options with values
            if (runConfig.model) globalOptions.push(`--model "${runConfig.model}"`);
            if (runConfig.configDirectory) globalOptions.push(`--config-dir "${runConfig.configDirectory}"`);
            if (runConfig.outputDirectory) globalOptions.push(`--output-dir "${runConfig.outputDirectory}"`);
            if (runConfig.preferencesDirectory) globalOptions.push(`--preferences-dir "${runConfig.preferencesDirectory}"`);

            // Build the command with global options
            const optionsString = globalOptions.length > 0 ? ` ${globalOptions.join(' ')}` : '';

            // Add package argument for link/unlink commands
            const packageArg = runConfig.tree?.packageArgument;
            const packageArgString = (packageArg && (builtInCommand === 'link' || builtInCommand === 'unlink'))
                ? ` "${packageArg}"`
                : '';

            // Add command-specific options
            let commandSpecificOptions = '';
            if (builtInCommand === 'unlink' && runConfig.tree?.cleanNodeModules) {
                commandSpecificOptions += ' --clean-node-modules';
            }
            if ((builtInCommand === 'link' || builtInCommand === 'unlink') && runConfig.tree?.externals && runConfig.tree.externals.length > 0) {
                commandSpecificOptions += ` --externals ${runConfig.tree.externals.join(' ')}`;
            }

            commandToRun = `kodrdriv ${builtInCommand}${optionsString}${packageArgString}${commandSpecificOptions}`;
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
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Executing ${executionDescription} in ${buildOrder.length} packages...`);

            // Show info for publish commands
            if (isBuiltInCommand && builtInCommand === 'publish') {
                logger.info('Inter-project dependencies will be automatically updated before each publish.');
            }

            let successCount = 0;
            let failedPackage: string | null = null;

            // If continuing, start from where we left off
            const startIndex = isContinue && executionContext ? executionContext.completedPackages.length : 0;

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
    } finally {
        // Intentionally preserve the mutex across executions to support multiple runs in the same process (e.g., test suite)
        // Do not destroy here; the process lifecycle will clean up resources.
    }
};
