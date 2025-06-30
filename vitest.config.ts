import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            all: true,
            include: ['src/**/*.ts'],
            thresholds: {
                statements: 93,
                branches: 98,
                functions: 100,
                lines: 93,
            }
        },
    },
});
