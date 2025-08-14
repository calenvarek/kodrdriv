#!/bin/bash

echo "Testing the new two-phase review flow..."
echo "This will test the file selection phase and then the analysis phase"

# Test with a single file in the test-project directory
echo "Test review note content" > test-project/test-review.md

echo "Running review command in test-project directory..."
echo "You should see:"
echo "1. File selection phase with c/s/a options"
echo "2. Analysis phase after files are selected"

cd test-project
../dist/main.js review --directory .
