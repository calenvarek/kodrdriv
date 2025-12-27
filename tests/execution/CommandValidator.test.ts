import { describe, it, expect } from 'vitest';
import { CommandValidator } from '@eldrforge/tree-execution';

describe('CommandValidator', () => {
    describe('validateForParallel', () => {
        describe('unsafe commands', () => {
            it('should reject git checkout', () => {
                const result = CommandValidator.validateForParallel('git checkout main');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Branch switching'))).toBe(true);
            });

            it('should reject git switch', () => {
                const result = CommandValidator.validateForParallel('git switch feature');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Branch switching'))).toBe(true);
            });

            it('should reject git rebase', () => {
                const result = CommandValidator.validateForParallel('git rebase main');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Rebase'))).toBe(true);
            });

            it('should reject git merge', () => {
                const result = CommandValidator.validateForParallel('git merge feature');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Merge'))).toBe(true);
            });

            it('should reject dangerous rm commands', () => {
                const result = CommandValidator.validateForParallel('rm -rf /');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Dangerous deletion'))).toBe(true);
            });

            it('should reject sudo commands', () => {
                const result = CommandValidator.validateForParallel('sudo npm install');

                expect(result.valid).toBe(false);
                expect(result.issues.some(i => i.includes('Sudo'))).toBe(true);
            });
        });

        describe('warning commands', () => {
            it('should warn about npm link', () => {
                const result = CommandValidator.validateForParallel('npm link');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('npm link'))).toBe(true);
            });

            it('should warn about npm install', () => {
                const result = CommandValidator.validateForParallel('npm install');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('npm install'))).toBe(true);
            });

            it('should warn about output redirection', () => {
                const result = CommandValidator.validateForParallel('echo "test" > output.txt');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('Output redirection'))).toBe(true);
            });
        });

        describe('safe commands', () => {
            it('should accept npm test', () => {
                const result = CommandValidator.validateForParallel('npm test');

                expect(result.valid).toBe(true);
                expect(result.issues).toHaveLength(0);
            });

            it('should accept npm run commands', () => {
                const result = CommandValidator.validateForParallel('npm run build && npm run test');

                expect(result.valid).toBe(true);
                expect(result.issues).toHaveLength(0);
            });

            it('should accept echo commands', () => {
                const result = CommandValidator.validateForParallel('echo "hello"');

                expect(result.valid).toBe(true);
                expect(result.issues).toHaveLength(0);
            });
        });

        describe('built-in command warnings', () => {
            it('should warn about parallel commit', () => {
                const result = CommandValidator.validateForParallel('kodrdriv commit', 'commit');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('commit'))).toBe(true);
                expect(result.recommendations.some(r => r.includes('max-concurrency 2'))).toBe(true);
            });

            it('should warn about parallel publish', () => {
                const result = CommandValidator.validateForParallel('kodrdriv publish', 'publish');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('publish'))).toBe(true);
                expect(result.warnings.some(w => w.includes('PR checks'))).toBe(true);
            });

            it('should warn about link operations', () => {
                const result = CommandValidator.validateForParallel('kodrdriv link', 'link');

                expect(result.valid).toBe(true);
                expect(result.warnings.some(w => w.includes('Link operations'))).toBe(true);
            });
        });
    });

    describe('getRecommendedConcurrency', () => {
        it('should recommend 2 for commit', () => {
            const concurrency = CommandValidator.getRecommendedConcurrency('commit', 8);

            expect(concurrency).toBe(2);
        });

        it('should recommend half CPU count for publish', () => {
            const concurrency = CommandValidator.getRecommendedConcurrency('publish', 8);

            expect(concurrency).toBe(4);
        });

        it('should recommend 1 (sequential) for link', () => {
            const concurrency = CommandValidator.getRecommendedConcurrency('link', 8);

            expect(concurrency).toBe(1);
        });

        it('should recommend full CPU count for general commands', () => {
            const concurrency = CommandValidator.getRecommendedConcurrency(undefined, 8);

            expect(concurrency).toBe(8);
        });

        it('should handle minimum of 2 for publish', () => {
            const concurrency = CommandValidator.getRecommendedConcurrency('publish', 2);

            expect(concurrency).toBe(2);
        });
    });
});
