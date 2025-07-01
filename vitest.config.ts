import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        env: {
            TZ: 'America/New_York'
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            all: true,
            include: ['src/**/*.ts'],
            thresholds: {
                statements: 90,
                branches: 88,
                functions: 98,
                lines: 90,
            }
        },
    },
});
