# Git Submodule Lock File Fix

## Problem

The file-based lock mechanism used to prevent concurrent git operations was failing when used with git submodules. The issue occurred because:

1. In regular git repositories, `.git` is a directory
2. In git submodules, `.git` is a file containing a `gitdir:` reference pointing to the actual git directory
3. The code assumed `.git` was always a directory and tried to create lock files in `.git/kodrdriv.lock`
4. This caused `ENOTDIR` errors when operating on submodules

## Example Submodule Structure

```
my-submodule/
├── .git              # FILE (not directory) containing: "gitdir: ../.git/modules/my-submodule"
├── src/
└── package.json

parent-repo/
└── .git/
    └── modules/
        └── my-submodule/  # Actual git directory for the submodule
            ├── HEAD
            ├── refs/
            └── objects/
```

## Solution

Modified `src/util/fileLock.ts` to handle both regular repositories and submodules:

### Key Changes

1. **Added `resolveGitDirectory()` method** that:
   - Checks if `.git` is a directory (regular repo) or file (submodule)
   - If it's a file, reads and parses the `gitdir:` reference
   - Resolves the gitdir path (handles both relative and absolute paths)
   - Returns the actual git directory path where locks can be created

2. **Updated `getRepositoryLock()` method** to:
   - Use `resolveGitDirectory()` instead of assuming `.git` is a directory
   - Create lock files in the resolved git directory
   - Log the actual lock path for debugging

### Code Implementation

```typescript
private resolveGitDirectory(repoPath: string): string {
    const gitPath = path.join(repoPath, '.git');

    try {
        const stat = fs.statSync(gitPath);

        if (stat.isDirectory()) {
            // Regular git repository
            return gitPath;
        } else if (stat.isFile()) {
            // Git submodule - .git is a file with format: gitdir: <path>
            const gitFileContent = fs.readFileSync(gitPath, 'utf-8').trim();
            const match = gitFileContent.match(/^gitdir:\s*(.+)$/);

            if (match && match[1]) {
                // Resolve the gitdir path (it's relative to the repo path)
                const gitDirPath = path.resolve(repoPath, match[1]);
                this.logger.debug(`Resolved submodule gitdir: ${gitDirPath}`);

                // Ensure the git directory exists
                if (!fs.existsSync(gitDirPath)) {
                    throw new Error(`Submodule git directory does not exist: ${gitDirPath}`);
                }

                return gitDirPath;
            }

            throw new Error(`Invalid .git file format in ${gitPath}: ${gitFileContent}`);
        }
    } catch (error: any) {
        // Check if error is from statSync (file doesn't exist)
        if (error.code === 'ENOENT') {
            throw new Error(`No .git directory or file found in ${repoPath}`);
        }
        throw new Error(`Failed to resolve git directory for ${repoPath}: ${error.message}`);
    }

    throw new Error(`No .git directory or file found in ${repoPath}`);
}
```

## Testing

Comprehensive test suite added in `tests/fileLock.test.ts` covering:

1. **Basic lock operations**
   - Acquire and release locks
   - Block concurrent lock acquisition
   - Handle stale locks

2. **Regular repository support**
   - Create locks in `.git` directory

3. **Submodule support** (NEW)
   - Handle `.git` file with `gitdir:` reference
   - Resolve relative gitdir paths
   - Create locks in the actual git directory
   - Proper error handling for missing submodule directories
   - Proper error handling for invalid `.git` file format

4. **Lock manager functionality**
   - Execute operations under lock
   - Release locks on operation failure
   - Serialize multiple operations on same repo

All 12 tests pass successfully with 86%+ coverage on the fileLock module.

## Impact

This fix enables kodrdriv to work correctly in monorepo setups where packages are organized as git submodules, such as:

- Multi-repository projects using git submodules for shared libraries
- Projects with external dependencies included as submodules
- Monorepos with complex submodule hierarchies

The fix maintains backward compatibility with regular git repositories while adding robust support for submodules.

## Related Files

- `src/util/fileLock.ts` - Core fix implementation
- `tests/fileLock.test.ts` - Comprehensive test suite
- `src/util/gitMutex.ts` - Uses RepositoryFileLockManager
- `src/commands/publish.ts` - Uses git locks during publish operations

