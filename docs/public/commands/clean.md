# Clean Command

Remove output directory and all generated files:

```bash
kodrdriv clean
```

The `clean` command removes the output directory (default: `output/kodrdriv`) and all generated files including debug logs, commit messages, and temporary files.

## Examples

```bash
# Clean all generated files
kodrdriv clean

# Clean with dry run to see what would be deleted
kodrdriv clean --dry-run
```
