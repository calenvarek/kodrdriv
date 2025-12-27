import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        env: {
            TZ: 'America/New_York'
        },
        // Add pool configuration to prevent memory issues
        pool: 'forks',
        poolOptions: {
            forks: {
                maxForks: 2,
                minForks: 1
            }
        },
        // Add test timeout and memory limits
        testTimeout: 30000,
        hookTimeout: 10000,
        teardownTimeout: 10000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            all: true,
            include: ['src/**/*.ts'],
            exclude: ['src/main.ts', 'src/types/**/*.ts'],
            thresholds: {
                // Lowered after tree-toolkit extraction (removed 4,850 lines of well-tested code)
                // Coverage remains good - removed code is now tested in tree-core (94%) and tree-execution (78%)
                statements: 55,
                branches: 50, // Lower due to removed execution framework branches
                functions: 55,
                lines: 55,
            }
        },
    },
});
