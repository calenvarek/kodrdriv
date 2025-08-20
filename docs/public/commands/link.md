# Link Command

Manage npm workspace links for local development with sibling projects:

```bash
kodrdriv link
```

The `link` command automates the creation and management of npm workspace configurations for local development. It scans your project's dependencies and automatically discovers matching sibling packages in configured scope directories, then creates file: dependencies in your package.json to link them for local development.

This is particularly useful when working with monorepos or related packages where you want to use local versions of dependencies instead of published registry versions during development.

## Tree Mode Execution

The link command can be executed across multiple packages using the tree command:

```bash
# Execute link across all packages in workspace
kodrdriv tree link



# Link specific directories only
kodrdriv tree link --directories ./apps ./packages

# Exclude certain packages from linking
kodrdriv tree link --exclude "build-*" "test-*"
```

### Tree Mode Benefits

- **Configuration Isolation**: Each package uses its own scope roots and linking configuration
- **Workspace-wide Linking**: Automatically discovers and links all workspace dependencies
- **Consistent Development Environment**: Ensures all packages are linked uniformly

- **Selective Linking**: Can target specific directories or exclude certain packages

### Tree Mode vs Single Package

| Aspect | Single Package | Tree Mode |
|--------|---------------|-----------|
| **Scope** | Current package only | All packages in workspace |
| **Configuration** | Single scope configuration | Per-package scope configuration |
| **Discovery** | Limited to current package deps | Workspace-wide dependency discovery |
| **Execution** | Single linking operation | Coordinated multi-package linking |
| **Consistency** | Manual coordination required | Automatic consistency across workspace |

### Tree Mode Configuration

Each package can have its own linking scope configuration:

```json
// .kodrdriv/config.json in each package
{
  "link": {
    "scopeRoots": {
      "@company": "../packages/",
      "@utils": "../../shared/",
      "@app-specific": "./local-deps/"
    }
  }
}
```

### Tree Mode Workflow

When using `kodrdriv tree link`, the following happens for each package:

1. **Package Discovery**: Scans all packages in the workspace
2. **Dependency Analysis**: Identifies local workspace dependencies
3. **Individual Linking**: Each package runs its own `kodrdriv link` process
4. **Configuration Isolation**: Each package uses its own scope roots and preferences
5. **Coordinated Results**: All packages end up with consistent workspace linking

For detailed tree mode documentation, see [Tree Built-in Commands](tree-built-in-commands.md#kodrdriv-tree-link).

## Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories for package discovery
  - **Format**: `'{"@scope": "path", "@another": "path"}'`
  - **Example**: `'{"@company": "../", "@myorg": "../../packages/"}'`

- `--externals [externals...]`: Patterns to match external dependencies for linking
  - **Format**: Array of package name patterns
  - **Example**: `--externals "@somelib" "lodash" "@external/*"`
  - **Behavior**: Links dependencies that match these patterns if they're globally linked

## Configuration File

You can also configure these options in your `.kodrdriv/config.yaml` file:

```yaml
link:
  scopeRoots:
    "@company": "../"
    "@myorg": "../../packages/"
  externalLinkPatterns:
    - "@somelib"
    - "lodash"
    - "@external/*"
```

Configuration file options can be overridden by command-line arguments.

## Examples

```bash
# Link packages from sibling directories
kodrdriv link --scope-roots '{"@mycompany": "../", "@utils": "../../shared/"}'

# Link external dependencies that match patterns
kodrdriv link --externals "@somelib" "lodash"

# Link both same-scope and external dependencies
kodrdriv link --scope-roots '{"@myorg": "../"}' --externals "@external/lib"

# Link packages from multiple scope directories
kodrdriv link --scope-roots '{"@frontend": "../ui/", "@backend": "../api/", "@shared": "../common/"}'
```
