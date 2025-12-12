import { describe, it, expect } from 'vitest';
import { DependencyChecker } from '../../src/execution/DependencyChecker';
import { createMockGraph, createMockExecutionState, MockGraphPatterns } from '../helpers/parallelMocks';

describe('DependencyChecker', () => {
    describe('isReady', () => {
        it('should return true for packages with no dependencies', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);
            const state = createMockExecutionState();

            expect(checker.isReady('a', state)).toBe(true);
        });

        it('should return true when all dependencies are completed', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);
            const state = createMockExecutionState({
                completed: ['a']
            });

            expect(checker.isReady('b', state)).toBe(true);
        });

        it('should return false when dependencies are not completed', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);
            const state = createMockExecutionState();

            expect(checker.isReady('b', state)).toBe(false);
        });

        it('should return false when a dependency has failed', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);
            const state = createMockExecutionState({
                failed: [{
                    name: 'a',
                    error: 'Failed',
                    isRetriable: false,
                    attemptNumber: 1,
                    failedAt: new Date().toISOString(),
                    dependencies: [],
                    dependents: ['b']
                }]
            });

            expect(checker.isReady('b', state)).toBe(false);
        });
    });

    describe('getDependentCount', () => {
        it('should return correct count of dependents', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['a']
            });
            const checker = new DependencyChecker(graph);

            expect(checker.getDependentCount('a')).toBe(2);
            expect(checker.getDependentCount('b')).toBe(0);
        });
    });

    describe('getDepth', () => {
        it('should return 0 for root packages', () => {
            const graph = MockGraphPatterns.linear();
            const checker = new DependencyChecker(graph);

            expect(checker.getDepth('package-a')).toBe(0);
        });

        it('should return correct depth for dependent packages', () => {
            const graph = MockGraphPatterns.linear();
            const checker = new DependencyChecker(graph);

            expect(checker.getDepth('package-b')).toBe(1);
            expect(checker.getDepth('package-c')).toBe(2);
            expect(checker.getDepth('package-d')).toBe(3);
        });

        it('should handle diamond dependencies', () => {
            const graph = MockGraphPatterns.diamond();
            const checker = new DependencyChecker(graph);

            expect(checker.getDepth('package-a')).toBe(0);
            expect(checker.getDepth('package-b')).toBe(1);
            expect(checker.getDepth('package-c')).toBe(1);
            expect(checker.getDepth('package-d')).toBe(2);
        });
    });

    describe('hasDependencies', () => {
        it('should detect packages with dependencies', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);

            expect(checker.hasDependencies('a')).toBe(false);
            expect(checker.hasDependencies('b')).toBe(true);
        });
    });

    describe('hasDependents', () => {
        it('should detect packages with dependents', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);

            expect(checker.hasDependents('a')).toBe(true);
            expect(checker.hasDependents('b')).toBe(false);
        });
    });

    describe('getBlockedPackages', () => {
        it('should find packages directly blocked by failure', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['b']
            });
            const checker = new DependencyChecker(graph);
            const state = createMockExecutionState({
                pending: ['b', 'c']
            });

            const blocked = checker.getBlockedPackages('a', state);

            expect(blocked.has('b')).toBe(true);
            expect(blocked.has('c')).toBe(false); // c is not directly blocked by a
        });
    });
});
