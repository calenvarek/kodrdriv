import { describe, it, expect } from 'vitest';
import { PullRequestCheckError } from '@eldrforge/shared';

describe('PullRequestCheckError', () => {
    it('should generate recovery instructions for test failures', () => {
        const error = new PullRequestCheckError(
            'Checks failed',
            123,
            [{ name: 'unit tests', conclusion: 'failure' }],
            'http://github.com/pr/123'
        );
        const instructions = error.getRecoveryInstructions();
        expect(instructions).toContain('📋 Test Failures:');
        expect(instructions.join('\n')).toContain('npm test');
    });

    it('should generate recovery instructions for lint failures', () => {
        const error = new PullRequestCheckError(
            'Checks failed',
            123,
            [{ name: 'eslint', conclusion: 'failure' }],
            'http://github.com/pr/123'
        );
        const instructions = error.getRecoveryInstructions();
        expect(instructions).toContain('🎨 Linting/Style Failures:');
        expect(instructions.join('\n')).toContain('npm run lint');
    });

    it('should generate recovery instructions for build failures', () => {
        const error = new PullRequestCheckError(
            'Checks failed',
            123,
            [{ name: 'build', conclusion: 'failure' }],
            'http://github.com/pr/123'
        );
        const instructions = error.getRecoveryInstructions();
        expect(instructions).toContain('🏗️ Build Failures:');
        expect(instructions.join('\n')).toContain('npm run build');
    });

    it('should use current branch name in instructions', () => {
        const error = new PullRequestCheckError(
            'Checks failed',
            123,
            [],
            'http://github.com/pr/123',
            'feature-branch'
        );
        const instructions = error.getRecoveryInstructions();
        expect(instructions.join('\n')).toContain('Push to feature-branch');
    });
});

