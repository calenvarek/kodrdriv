#!/bin/bash

# KodrDriv Pre-commit Hook
# Prevents committing package.json files that contain file: dependencies
#
# To install this hook:
# 1. Copy this file to .git/hooks/pre-commit
# 2. Make it executable: chmod +x .git/hooks/pre-commit
#
# Or run: npm run install-hooks (if you add this script to package.json)

echo "🔍 Checking for file: dependencies in staged package.json files..."

# Find all staged package.json files
staged_package_files=$(git diff --cached --name-only | grep "package\.json$")

if [ -z "$staged_package_files" ]; then
    echo "✅ No package.json files staged for commit"
    exit 0
fi

found_file_deps=false

# Check each staged package.json file for file: dependencies
for file in $staged_package_files; do
    if [ -f "$file" ]; then
        # Look for "file:" dependencies in the staged version
        if git show :$file | grep -q '"file:'; then
            echo "❌ Found file: dependencies in $file:"
            git show :$file | grep '"file:' | sed 's/^/    /'
            found_file_deps=true
        fi
    fi
done

if $found_file_deps; then
    echo ""
    echo "🚫 COMMIT BLOCKED: Cannot commit package.json files with file: dependencies"
    echo ""
    echo "💡 To fix this:"
    echo "   1. Run 'kodrdriv unlink' to restore registry versions"
    echo "   2. Commit your changes"
    echo "   3. Run 'kodrdriv link' again for local development"
    echo ""
    echo "   Or to commit anyway (not recommended):"
    echo "   git commit --no-verify"
    echo ""
    exit 1
fi

echo "✅ No file: dependencies found in staged package.json files"
exit 0
