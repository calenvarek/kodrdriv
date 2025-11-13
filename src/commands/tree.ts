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
 * Supported built-in commands: commit, publish, link, unlink, development, branches, checkout
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
import { run, runSecure, safeJsonParse, validatePackageJson, getGitStatusSummary, getGloballyLinkedPackages, getLinkedDependencies, getLinkCompatibilityProblems } from '@eldrforge/git-tools';
import util from 'util';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { getOutputPath } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Commit from './commit';
import * as Link from './link';
import * as Unlink from './unlink';

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

            // Skip prerelease versions (e.g., 1.0.0-beta.1, 2.0.0-alpha.3)
            // Prerelease versions should not be automatically propagated to consumers
            if (version.includes('-')) {
                packageLogger.verbose(`Skipping prerelease version ${packageName}@${version} - not updating dependencies`);
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

// Helper function to promote a package to completed status in the context
const promotePackageToCompleted = async (
    packageName: string,
    outputDirectory?: string
): Promise<void> => {
    const storage = createStorage({ log: () => {} });
    const contextFilePath = getContextFilePath(outputDirectory);

    try {
        if (!await storage.exists(contextFilePath)) {
            return;
        }

        const contextContent = await storage.readFile(contextFilePath, 'utf-8');
        const contextData = safeJsonParse(contextContent, contextFilePath);

        // Restore dates from ISO strings
        const context: TreeExecutionContext = {
            ...contextData,
            startTime: new Date(contextData.startTime),
            lastUpdateTime: new Date(contextData.lastUpdateTime),
            publishedVersions: contextData.publishedVersions.map((v: any) => ({
                ...v,
                publishTime: new Date(v.publishTime)
            }))
        };

        // Add package to completed list if not already there
        if (!context.completedPackages.includes(packageName)) {
            context.completedPackages.push(packageName);
            context.lastUpdateTime = new Date();
            await saveExecutionContext(context, outputDirectory);
        }
    } catch (error: any) {
        const logger = getLogger();
        logger.warn(`Warning: Failed to promote package to completed: ${error.message}`);
    }
};

// Helper function to validate that all packages have the required scripts
const validateScripts = async (
    packages: Map<string, PackageInfo>,
    scripts: string[]
): Promise<{ valid: boolean; missingScripts: Map<string, string[]> }> => {
    const logger = getLogger();
    const missingScripts = new Map<string, string[]>();
    const storage = createStorage({ log: () => {} });

    logger.debug(`Validating scripts: ${scripts.join(', ')}`);

    for (const [packageName, packageInfo] of packages) {
        const packageJsonPath = path.join(packageInfo.path, 'package.json');
        const missingForPackage: string[] = [];

        try {
            const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
            const packageJson = safeJsonParse(packageJsonContent, packageJsonPath);
            const validated = validatePackageJson(packageJson, packageJsonPath);

            // Check if each required script exists
            for (const script of scripts) {
                if (!validated.scripts || !validated.scripts[script]) {
                    missingForPackage.push(script);
                }
            }

            if (missingForPackage.length > 0) {
                missingScripts.set(packageName, missingForPackage);
                logger.debug(`Package ${packageName} missing scripts: ${missingForPackage.join(', ')}`);
            }
        } catch (error: any) {
            logger.debug(`Error reading package.json for ${packageName}: ${error.message}`);
            // If we can't read the package.json, assume all scripts are missing
            missingScripts.set(packageName, scripts);
        }
    }

    const valid = missingScripts.size === 0;

    if (valid) {
        logger.info(`✅ All packages have the required scripts: ${scripts.join(', ')}`);
    } else {
        logger.error(`❌ Script validation failed. Missing scripts:`);
        for (const [packageName, missing] of missingScripts) {
            logger.error(`  ${packageName}: ${missing.join(', ')}`);
        }
    }

    return { valid, missingScripts };
};

// Extract published version from git tags after successful publish
// After kodrdriv publish, the release version is captured in the git tag,
// while package.json contains the next dev version
const extractPublishedVersion = async (
    packageDir: string,
    packageLogger: any
): Promise<PublishedVersion | null> => {
    const storage = createStorage({ log: packageLogger.info });
    const packageJsonPath = path.join(packageDir, 'package.json');

    try {
        // Get package name from package.json
        const packageJsonContent = await storage.readFile(packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageJsonPath);

        // Get the most recently created tag (by creation date, not version number)
        // This ensures we get the tag that was just created by the publish, not an older tag with a higher version
        const { stdout: tagOutput } = await run('git tag --sort=-creatordate', { cwd: packageDir });
        const tags = tagOutput.trim().split('\n').filter(Boolean);

        if (tags.length === 0) {
            packageLogger.warn('No git tags found after publish');
            return null;
        }

        // Get the most recently created tag (first in the list)
        const latestTag = tags[0];

        // Extract version from tag, handling various formats:
        // - v1.2.3 -> 1.2.3
        // - working/v1.2.3 -> 1.2.3
        // - main/v1.2.3 -> 1.2.3
        let version = latestTag;

        // If tag contains a slash (branch prefix), extract everything after it
        if (version.includes('/')) {
            version = version.split('/').pop() || version;
        }

        // Remove 'v' prefix if present
        if (version.startsWith('v')) {
            version = version.substring(1);
        }

        packageLogger.verbose(`Extracted published version from tag: ${latestTag} -> ${version}`);

        return {
            packageName: packageJson.name,
            version: version,
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

    // Ensure encoding is set to 'utf8' to get string output instead of Buffer
    const execOptions = { encoding: 'utf8' as const, ...options };

    if (showOutput === 'full') {
        packageLogger.debug(`Executing command: ${command}`);
        // Use info level to show on console in debug mode
        packageLogger.info(`🔧 Running: ${command}`);
    } else if (showOutput === 'minimal') {
        packageLogger.verbose(`Running: ${command}`);
    }

    try {
        const result = await execPromise(command, execOptions);

        if (showOutput === 'full') {
            const stdout = String(result.stdout);
            const stderr = String(result.stderr);

            if (stdout.trim()) {
                packageLogger.debug('STDOUT:');
                packageLogger.debug(stdout);
                // Show on console using info level for immediate feedback
                packageLogger.info(`📤 STDOUT:`);
                stdout.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
            if (stderr.trim()) {
                packageLogger.debug('STDERR:');
                packageLogger.debug(stderr);
                // Show on console using info level for immediate feedback
                packageLogger.info(`⚠️  STDERR:`);
                stderr.split('\n').forEach((line: string) => {
                    if (line.trim()) packageLogger.info(`${line}`);
                });
            }
        }

        // Ensure result is properly typed as strings
        return {
            stdout: String(result.stdout),
            stderr: String(result.stderr)
        };
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
const formatSubprojectError = (packageName: string, error: any, _packageInfo?: PackageInfo, _position?: number, _total?: number): string => {
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
): Promise<{ success: boolean; error?: any; isTimeoutError?: boolean }> => {
    const packageLogger = createPackageLogger(packageName, index + 1, total, isDryRun);
    const packageDir = packageInfo.path;
    const logger = getLogger();

    // Determine output level based on flags
    // For publish commands, default to full output to show OpenAI progress and other details
    // For other commands, require --verbose or --debug for output
    const isPublishCommand = isBuiltInCommand && commandToRun.includes('publish');
    let showOutput: 'none' | 'minimal' | 'full' = isPublishCommand ? 'full' : 'none';
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
                        packageLogger.info('⏱️  This step may take a few minutes as it generates a commit message using AI...');

                        // Add timeout wrapper around commit execution
                        const commitTimeoutMs = 300000; // 5 minutes
                        const commitPromise = Commit.execute({...runConfig, dryRun: false});
                        const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => reject(new Error(`Commit operation timed out after ${commitTimeoutMs/1000} seconds`)), commitTimeoutMs);
                        });

                        // Add progress indicator
                        let progressInterval: NodeJS.Timeout | null = null;
                        try {
                            // Start progress indicator
                            progressInterval = setInterval(() => {
                                packageLogger.info('⏳ Still generating commit message... (this can take 1-3 minutes)');
                            }, 30000); // Every 30 seconds

                            await Promise.race([commitPromise, timeoutPromise]);
                            packageLogger.info('✅ Inter-project dependency updates committed successfully');
                        } catch (commitError: any) {
                            if (commitError.message.includes('timed out')) {
                                packageLogger.error(`❌ Commit operation timed out after ${commitTimeoutMs/1000} seconds`);
                                packageLogger.error('This usually indicates an issue with the AI service or very large changes');
                                packageLogger.error('You may need to manually commit the dependency updates');
                            } else {
                                packageLogger.warn(`Failed to commit inter-project dependency updates: ${commitError.message}`);
                            }
                            // Continue with publish anyway - the updates are still in place
                        } finally {
                            if (progressInterval) {
                                clearInterval(progressInterval);
                            }
                        }
                    } else {
                        packageLogger.info('No inter-project dependency updates needed');
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

                    // Add progress indication for publish commands
                    if (builtInCommandName === 'publish') {
                        packageLogger.info('🚀 Starting publish process...');
                        packageLogger.info('⏱️  This may take several minutes (AI processing, PR creation, etc.)');
                    }

                    // Ensure dry-run propagates to subprocess even during overall dry-run mode
                    const effectiveCommand = runConfig.dryRun && !commandToRun.includes('--dry-run')
                        ? `${commandToRun} --dry-run`
                        : commandToRun;

                    // Add timeout wrapper for publish commands
                    const commandTimeoutMs = 1800000; // 30 minutes for publish commands
                    if (builtInCommandName === 'publish') {
                        packageLogger.info(`⏰ Setting timeout of ${commandTimeoutMs/60000} minutes for publish command`);
                    }

                    const commandPromise = runWithLogging(effectiveCommand, packageLogger, {}, showOutput);
                    const commandTimeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error(`Command timed out after ${commandTimeoutMs/60000} minutes`)), commandTimeoutMs);
                    });

                    try {
                        const { stdout } = await Promise.race([commandPromise, commandTimeoutPromise]);
                        // Detect explicit skip marker from publish to avoid propagating versions
                        if (builtInCommandName === 'publish' && stdout && stdout.includes('KODRDRIV_PUBLISH_SKIPPED')) {
                            packageLogger.info('Publish skipped for this package; will not record or propagate a version.');
                            publishWasSkipped = true;
                        }
                    } catch (error: any) {
                        if (error.message.includes('timed out')) {
                            packageLogger.error(`❌ ${builtInCommandName} command timed out after ${commandTimeoutMs/60000} minutes`);
                            packageLogger.error('This usually indicates the command is stuck waiting for user input or an external service');
                            throw error;
                        }
                        throw error;
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

        // Show completion status
        if (runConfig.debug || runConfig.verbose) {
            packageLogger.info(`✅ Completed successfully`);
        } else if (isPublishCommand) {
            // For publish commands, always show completion even without verbose
            logger.info(`[${index + 1}/${total}] ${packageName}: ✅ Completed`);
        }

        return { success: true };
    } catch (error: any) {
        if (runConfig.debug || runConfig.verbose) {
            packageLogger.error(`❌ Execution failed: ${error.message}`);
        } else {
            logger.error(`[${index + 1}/${total}] ${packageName}: ❌ Failed - ${error.message}`);
        }

        // Check if this is a timeout error
        const errorMessage = error.message?.toLowerCase() || '';
        const isTimeoutError = errorMessage && (
            errorMessage.includes('timeout waiting for pr') ||
            errorMessage.includes('timeout waiting for release workflows') ||
            errorMessage.includes('timeout reached') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('timed out') ||
            errorMessage.includes('timed_out')
        );

        return { success: false, error, isTimeoutError };
    }
};

// Add a simple status check function
const checkTreePublishStatus = async (): Promise<void> => {
    const logger = getLogger();
    try {
        // Check for running kodrdriv processes
        const { stdout } = await runSecure('ps', ['aux'], {});
        const kodrdrivProcesses = stdout.split('\n').filter((line: string) =>
            line.includes('kodrdriv') &&
            !line.includes('grep') &&
            !line.includes('ps aux') &&
            !line.includes('tree --status') // Exclude the current status command
        );

        if (kodrdrivProcesses.length > 0) {
            logger.info('🔍 Found running kodrdriv processes:');
            kodrdrivProcesses.forEach((process: string) => {
                const parts = process.trim().split(/\s+/);
                const pid = parts[1];
                const command = parts.slice(10).join(' ');
                logger.info(`  PID ${pid}: ${command}`);
            });
        } else {
            logger.info('No kodrdriv processes currently running');
        }
    } catch (error) {
        logger.warn('Could not check process status:', error);
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;
    const isContinue = runConfig.tree?.continue || false;
    const promotePackage = runConfig.tree?.promote;

    // Debug logging
    logger.debug('Tree config:', JSON.stringify(runConfig.tree, null, 2));
    logger.debug('Status flag:', (runConfig.tree as any)?.status);
    logger.debug('Full runConfig:', JSON.stringify(runConfig, null, 2));

    // Handle status check
    if ((runConfig.tree as any)?.status) {
        logger.info('🔍 Checking for running kodrdriv processes...');
        await checkTreePublishStatus();
        return 'Status check completed';
    }

    // Handle promote mode
    if (promotePackage) {
        logger.info(`Promoting package '${promotePackage}' to completed status...`);
        await promotePackageToCompleted(promotePackage, runConfig.outputDirectory);
        logger.info(`✅ Package '${promotePackage}' has been marked as completed.`);
        logger.info('You can now run the tree command with --continue to resume from the next package.');
        return `Package '${promotePackage}' promoted to completed status.`;
    }

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
    const supportedBuiltInCommands = ['commit', 'publish', 'link', 'unlink', 'development', 'branches', 'run', 'checkout', 'updates'];

    if (builtInCommand && !supportedBuiltInCommands.includes(builtInCommand)) {
        throw new Error(`Unsupported built-in command: ${builtInCommand}. Supported commands: ${supportedBuiltInCommands.join(', ')}`);
    }

    // Handle run subcommand - convert space-separated scripts to npm run commands
    if (builtInCommand === 'run') {
        const packageArgument = runConfig.tree?.packageArgument;
        if (!packageArgument) {
            throw new Error('run subcommand requires script names. Usage: kodrdriv tree run "clean build test"');
        }

        // Split the package argument by spaces to get individual script names
        const scripts = packageArgument.trim().split(/\s+/).filter(script => script.length > 0);

        if (scripts.length === 0) {
            throw new Error('run subcommand requires at least one script name. Usage: kodrdriv tree run "clean build test"');
        }

        // Convert to npm run commands joined with &&
        const npmCommands = scripts.map(script => `npm run ${script}`).join(' && ');

        // Set this as the custom command to run
        runConfig.tree = {
            ...runConfig.tree,
            cmd: npmCommands
        };

        // Clear the built-in command since we're now using custom command mode
        runConfig.tree.builtInCommand = undefined;

        logger.info(`Converting run subcommand to: ${npmCommands}`);

        // Store scripts for later validation
        (runConfig as any).__scriptsToValidate = scripts;
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

            // Find the start package in the build order and start execution from there
            const startIndex = buildOrder.findIndex(pkgName => pkgName === startPackageName);
            if (startIndex === -1) {
                throw new Error(`Package '${startFrom}' not found in build order. This should not happen.`);
            }

            // Filter build order to start from the specified package
            const originalLength = buildOrder.length;
            buildOrder = buildOrder.slice(startIndex);

            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Starting execution from package '${startFrom}' (${buildOrder.length} of ${originalLength} packages remaining).`);
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

        // Handle special "checkout" command that switches all packages to specified branch
        if (builtInCommand === 'checkout') {
            const targetBranch = runConfig.tree?.packageArgument;
            if (!targetBranch) {
                throw new Error('checkout subcommand requires a branch name. Usage: kodrdriv tree checkout <branch-name>');
            }

            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Workspace Checkout to Branch: ${targetBranch}`);
            logger.info('');

            // Phase 1: Safety check - scan all packages for uncommitted changes
            logger.info('🔍 Phase 1: Checking for uncommitted changes across workspace...');
            const packagesWithChanges: Array<{
                name: string;
                path: string;
                status: string;
                hasUncommittedChanges: boolean;
                hasUnstagedFiles: boolean;
            }> = [];

            for (const packageName of buildOrder) {
                const packageInfo = dependencyGraph.packages.get(packageName)!;

                try {
                    const gitStatus = await getGitStatusSummary(packageInfo.path);
                    const hasProblems = gitStatus.hasUncommittedChanges || gitStatus.hasUnstagedFiles;

                    packagesWithChanges.push({
                        name: packageName,
                        path: packageInfo.path,
                        status: gitStatus.status,
                        hasUncommittedChanges: gitStatus.hasUncommittedChanges,
                        hasUnstagedFiles: gitStatus.hasUnstagedFiles
                    });

                    if (hasProblems) {
                        logger.warn(`⚠️  ${packageName}: ${gitStatus.status}`);
                    } else {
                        logger.verbose(`✅ ${packageName}: clean`);
                    }
                } catch (error: any) {
                    logger.warn(`❌ ${packageName}: error checking status - ${error.message}`);
                    packagesWithChanges.push({
                        name: packageName,
                        path: packageInfo.path,
                        status: 'error',
                        hasUncommittedChanges: false,
                        hasUnstagedFiles: false
                    });
                }
            }

            // Check if any packages have uncommitted changes
            const problemPackages = packagesWithChanges.filter(pkg =>
                pkg.hasUncommittedChanges || pkg.hasUnstagedFiles || pkg.status === 'error'
            );

            if (problemPackages.length > 0) {
                logger.error(`❌ Cannot proceed with checkout: ${problemPackages.length} packages have uncommitted changes or errors:`);
                logger.error('');

                for (const pkg of problemPackages) {
                    logger.error(`  📦 ${pkg.name} (${pkg.path}):`);
                    logger.error(`      Status: ${pkg.status}`);
                }

                logger.error('');
                logger.error('🔧 To resolve this issue:');
                logger.error('   1. Commit or stash changes in the packages listed above');
                logger.error('   2. Or use "kodrdriv tree commit" to commit changes across all packages');
                logger.error('   3. Then re-run the checkout command');
                logger.error('');

                throw new Error(`Workspace checkout blocked: ${problemPackages.length} packages have uncommitted changes`);
            }

            logger.info(`✅ Phase 1 complete: All ${packagesWithChanges.length} packages are clean`);
            logger.info('');

            // Phase 2: Perform the checkout
            logger.info(`🔄 Phase 2: Checking out all packages to branch '${targetBranch}'...`);

            let successCount = 0;
            const failedPackages: Array<{ name: string; error: string }> = [];

            for (let i = 0; i < buildOrder.length; i++) {
                const packageName = buildOrder[i];
                const packageInfo = dependencyGraph.packages.get(packageName)!;

                if (isDryRun) {
                    logger.info(`[${i + 1}/${buildOrder.length}] ${packageName}: Would checkout ${targetBranch}`);
                    successCount++;
                } else {
                    try {
                        const originalCwd = process.cwd();
                        process.chdir(packageInfo.path);

                        try {
                            // Check if target branch exists locally
                            let branchExists = false;
                            try {
                                await runSecure('git', ['rev-parse', '--verify', targetBranch]);
                                branchExists = true;
                            } catch {
                                // Branch doesn't exist locally
                                branchExists = false;
                            }

                            if (branchExists) {
                                await runSecure('git', ['checkout', targetBranch]);
                                logger.info(`[${i + 1}/${buildOrder.length}] ${packageName}: ✅ Checked out ${targetBranch}`);
                            } else {
                                // Try to check out branch from remote
                                try {
                                    await runSecure('git', ['checkout', '-b', targetBranch, `origin/${targetBranch}`]);
                                    logger.info(`[${i + 1}/${buildOrder.length}] ${packageName}: ✅ Checked out ${targetBranch} from origin`);
                                } catch {
                                    // If that fails, create a new branch
                                    await runSecure('git', ['checkout', '-b', targetBranch]);
                                    logger.info(`[${i + 1}/${buildOrder.length}] ${packageName}: ✅ Created new branch ${targetBranch}`);
                                }
                            }

                            successCount++;
                        } finally {
                            process.chdir(originalCwd);
                        }
                    } catch (error: any) {
                        logger.error(`[${i + 1}/${buildOrder.length}] ${packageName}: ❌ Failed - ${error.message}`);
                        failedPackages.push({ name: packageName, error: error.message });
                    }
                }
            }

            // Report results
            if (failedPackages.length > 0) {
                logger.error(`❌ Checkout completed with errors: ${successCount}/${buildOrder.length} packages successful`);
                logger.error('');
                logger.error('Failed packages:');
                for (const failed of failedPackages) {
                    logger.error(`  - ${failed.name}: ${failed.error}`);
                }
                throw new Error(`Checkout failed for ${failedPackages.length} packages`);
            } else {
                logger.info(`✅ Checkout complete: All ${buildOrder.length} packages successfully checked out to '${targetBranch}'`);
                return `Workspace checkout complete: ${successCount} packages checked out to '${targetBranch}'`;
            }
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

            // Add package argument for link/unlink/updates commands
            const packageArg = runConfig.tree?.packageArgument;
            const packageArgString = (packageArg && (builtInCommand === 'link' || builtInCommand === 'unlink' || builtInCommand === 'updates'))
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
            // Validate scripts for run command before execution
            const scriptsToValidate = (runConfig as any).__scriptsToValidate;
            if (scriptsToValidate && scriptsToValidate.length > 0) {
                logger.info(`🔍 Validating scripts before execution: ${scriptsToValidate.join(', ')}`);
                const validation = await validateScripts(dependencyGraph.packages, scriptsToValidate);

                if (!validation.valid) {
                    logger.error('');
                    logger.error('❌ Script validation failed. Cannot proceed with execution.');
                    logger.error('');
                    logger.error('💡 To fix this:');
                    logger.error('   1. Add the missing scripts to the package.json files');
                    logger.error('   2. Or exclude packages that don\'t need these scripts using --exclude');
                    logger.error('   3. Or run individual packages that have the required scripts');
                    logger.error('');
                    throw new Error('Script validation failed. See details above.');
                }
            }

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

                // Save initial context for commands that support continuation
                if (isBuiltInCommand && (builtInCommand === 'publish' || builtInCommand === 'run') && !isDryRun) {
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
                    if (executionContext && isBuiltInCommand && (builtInCommand === 'publish' || builtInCommand === 'run') && !isDryRun) {
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
                    const formattedError = formatSubprojectError(packageName, result.error, packageInfo, i + 1, buildOrder.length);

                    if (!isDryRun) {
                        packageLogger.error(`Execution failed`);
                        logger.error(formattedError);
                        logger.error(`Failed after ${successCount} successful packages.`);

                        // Special handling for timeout errors
                        if (result.isTimeoutError) {
                            logger.error('');
                            logger.error('⏰ TIMEOUT DETECTED: This appears to be a timeout error.');
                            logger.error('   This commonly happens when PR checks take longer than expected.');
                            logger.error('   The execution context has been saved for recovery.');
                            logger.error('');

                            // Save context even on timeout for recovery
                            if (executionContext && isBuiltInCommand && (builtInCommand === 'publish' || builtInCommand === 'run')) {
                                executionContext.completedPackages.push(packageName);
                                executionContext.publishedVersions = publishedVersions;
                                executionContext.lastUpdateTime = new Date();
                                await saveExecutionContext(executionContext, runConfig.outputDirectory);
                                logger.info('💾 Execution context saved for recovery.');
                            }

                            // For publish commands, provide specific guidance about CI/CD setup
                            if (builtInCommand === 'publish') {
                                logger.error('');
                                logger.error('💡 PUBLISH TIMEOUT TROUBLESHOOTING:');
                                logger.error('   This project may not have CI/CD workflows configured.');
                                logger.error('   Common solutions:');
                                logger.error('   1. Set up GitHub Actions workflows for this repository');
                                logger.error('   2. Use --sendit flag to skip user confirmation:');
                                logger.error(`      kodrdriv tree publish --sendit`);
                                logger.error('   3. Or manually promote this package:');
                                logger.error(`      kodrdriv tree publish --promote ${packageName}`);
                                logger.error('');
                            }
                        }

                        logger.error(`To resume from this point, run:`);
                        if (isBuiltInCommand) {
                            logger.error(`    kodrdriv tree ${builtInCommand} --continue`);
                        } else {
                            logger.error(`    kodrdriv tree --continue --cmd "${commandToRun}"`);
                        }

                        // For timeout errors, provide additional recovery instructions
                        if (result.isTimeoutError) {
                            logger.error('');
                            logger.error('🔧 RECOVERY OPTIONS:');
                            if (builtInCommand === 'publish') {
                                logger.error('   1. Wait for the PR checks to complete, then run:');
                                logger.error(`      cd ${packageInfo.path}`);
                                logger.error(`      kodrdriv publish`);
                                logger.error('   2. After the individual publish completes, run:');
                                logger.error(`      kodrdriv tree ${builtInCommand} --continue`);
                            } else {
                                logger.error('   1. Fix any issues in the package, then run:');
                                logger.error(`      cd ${packageInfo.path}`);
                                logger.error(`      ${commandToRun}`);
                                logger.error('   2. After the command completes successfully, run:');
                                logger.error(`      kodrdriv tree ${builtInCommand} --continue`);
                            }
                            logger.error('   3. Or promote this package to completed status:');
                            logger.error(`      kodrdriv tree ${builtInCommand} --promote ${packageName}`);
                            logger.error('   4. Or manually edit .kodrdriv-context to mark this package as completed');
                        }

                        // Add clear error summary at the very end
                        logger.error('');
                        logger.error('📋 ERROR SUMMARY:');
                        logger.error(`   Project that failed: ${packageName}`);
                        logger.error(`   Location: ${packageInfo.path}`);
                        logger.error(`   Position in tree: ${i + 1} of ${buildOrder.length} packages`);
                        logger.error(`   What failed: ${result.error?.message || 'Unknown error'}`);
                        logger.error('');

                        throw new Error(`Command failed in package ${packageName}`);
                    }
                    break;
                }
            }

            if (!failedPackage) {
                const summary = `${isDryRun ? 'DRY RUN: ' : ''}All ${buildOrder.length} packages completed successfully! 🎉`;
                logger.info(summary);

                // Clean up context on successful completion
                if (isBuiltInCommand && (builtInCommand === 'publish' || builtInCommand === 'run') && !isDryRun) {
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
