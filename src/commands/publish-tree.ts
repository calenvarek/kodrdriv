#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { run } from '../util/child';
import * as Publish from './publish';

// Helper function to format subproject error output
const formatSubprojectError = (packageName: string, error: any): string => {
    const lines: string[] = [];

    lines.push(`❌ Script failed in package ${packageName}:`);

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
        const packageJson = JSON.parse(content);

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

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Determine the target directory - either specified or current working directory
    const targetDirectory = runConfig.publishTree?.directory || process.cwd();

    logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Analyzing workspace at: ${targetDirectory}`);

    try {
        // Get exclusion patterns from config, fallback to empty array
        const excludedPatterns = runConfig.publishTree?.excludedPatterns || [];

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
        const startFrom = runConfig.publishTree?.startFrom;
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
        logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Build order determined:`);

        let output = `\nBuild Order for ${buildOrder.length} packages${startFrom ? ` (starting from ${startFrom})` : ''}:\n`;
        output += '==========================================\n\n';

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

        // Execute script, cmd, or publish if provided
        const script = runConfig.publishTree?.script;
        const cmd = runConfig.publishTree?.cmd;
        const shouldPublish = runConfig.publishTree?.publish;

        // Handle conflicts between --script, --cmd, and --publish
        // Priority order: --publish > --cmd > --script
        let commandToRun: string | undefined;
        let actionName: string = 'script'; // Default value

        if (shouldPublish) {
            if (script || cmd) {
                const conflicting = [script && '--script', cmd && '--cmd'].filter(Boolean).join(' and ');
                logger.warn(`Multiple execution options provided (${conflicting} and --publish). Using --publish (ignoring others).`);
            }
            // Will use direct function call instead of npx command
            actionName = 'publish';
        } else if (cmd) {
            if (script) {
                logger.warn('Both --script and --cmd provided. Using --cmd (ignoring --script).');
            }
            commandToRun = cmd;
            actionName = 'command';
        } else if (script) {
            commandToRun = script;
            actionName = 'script';
        }

        if (commandToRun || shouldPublish) {
            const executionDescription = shouldPublish ? 'publish command' : `"${commandToRun}"`;
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Executing ${actionName} ${executionDescription} in ${buildOrder.length} packages...`);

            let successCount = 0;
            let failedPackage: string | null = null;

            for (let i = 0; i < buildOrder.length; i++) {
                const packageName = buildOrder[i];
                const packageInfo = dependencyGraph.packages.get(packageName)!;
                const packageDir = packageInfo.path;

                logger.info(`${isDryRun ? 'DRY RUN: ' : ''}[${i + 1}/${buildOrder.length}] Running "${commandToRun}" in ${packageName}...`);
                logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Working directory: ${packageDir}`);

                try {
                    if (isDryRun) {
                        if (shouldPublish) {
                            logger.info(`DRY RUN: Would execute publish command directly`);
                        } else {
                            logger.info(`DRY RUN: Would execute: ${commandToRun}`);
                        }
                        logger.info(`DRY RUN: In directory: ${packageDir}`);
                    } else {
                        // Change to the package directory and run the command
                        const originalCwd = process.cwd();
                        try {
                            process.chdir(packageDir);

                            if (shouldPublish) {
                                // Call publish command directly instead of shelling out to npx
                                await Publish.execute(runConfig);
                            } else {
                                await run(commandToRun!); // Non-null assertion since we're inside if (commandToRun)
                            }

                            successCount++;
                            logger.info(`✅ [${i + 1}/${buildOrder.length}] ${packageName} completed successfully`);
                        } finally {
                            process.chdir(originalCwd);
                        }
                    }
                } catch (error: any) {
                    failedPackage = packageName;

                    // Format the subproject error with proper indentation
                    const formattedError = formatSubprojectError(packageName, error);

                    if (!isDryRun) {
                        // Log the formatted subproject error first
                        logger.error(formattedError);
                        logger.error(`Failed after ${successCount} successful packages.`);

                        // Show recovery command last (most important info)
                        const packageDirName = path.basename(packageDir);
                        logger.error(`To resume from this package, run:`);
                        logger.error(`    kodrdriv publish-tree --start-from ${packageDirName}`);

                        // Create a concise error for the throw
                        throw new Error(`Script failed in package ${packageName}`);
                    }
                    break;
                }
            }

            if (!failedPackage) {
                const summary = `${isDryRun ? 'DRY RUN: ' : ''}All ${buildOrder.length} packages completed successfully! 🎉`;
                logger.info(summary);
                return output + `\n${summary}\n`;
            }
        }

        return output;

    } catch (error: any) {
        const errorMessage = `Failed to analyze workspace: ${error.message}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
};
