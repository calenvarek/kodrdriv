# Link Command

Manage npm workspace links for local development with sibling projects:

```bash
kodrdriv link
```

The `link` command automates the creation and management of npm workspace configurations for local development. It scans your project's dependencies and automatically discovers matching sibling packages in configured scope directories, then creates file: dependencies in your package.json to link them for local development.

This is particularly useful when working with monorepos or related packages where you want to use local versions of dependencies instead of published registry versions during development.

## Command Options

- `--scope-roots <scopeRoots>`: JSON mapping of scopes to root directories for package discovery (required)
  - **Format**: `'{"@scope": "path", "@another": "path"}'`
  - **Example**: `'{"@company": "../", "@myorg": "../../packages/"}'`

## Examples

```bash
# Link packages from sibling directories
kodrdriv link --scope-roots '{"@mycompany": "../", "@utils": "../../shared/"}'

# Link with custom workspace file
kodrdriv link --scope-roots '{"@myorg": "../"}'

# Link packages from multiple scope directories
kodrdriv link --scope-roots '{"@frontend": "../ui/", "@backend": "../api/", "@shared": "../common/"}'
```
