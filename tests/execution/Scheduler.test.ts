import { describe, it, expect } from 'vitest';
import { Scheduler } from '../../src/execution/Scheduler';
import { DependencyChecker } from '../../src/execution/DependencyChecker';
import { createMockGraph, createMockExecutionState, MockGraphPatterns } from '../helpers/parallelMocks';

describe('Scheduler', () => {
    describe('getNext', () => {
        it('should return empty array when no slots available', () => {
            const graph = MockGraphPatterns.independent(3);
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState({
                ready: ['package-0', 'package-1', 'package-2']
            });

            const next = scheduler.getNext(0, state);

            expect(next).toHaveLength(0);
        });

        it('should return empty array when no packages ready', () => {
            const graph = MockGraphPatterns.independent(3);
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState();

            const next = scheduler.getNext(5, state);

            expect(next).toHaveLength(0);
        });

        it('should return packages up to available slots', () => {
            const graph = MockGraphPatterns.independent(5);
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState({
                ready: ['package-0', 'package-1', 'package-2', 'package-3', 'package-4']
            });

            const next = scheduler.getNext(3, state);

            expect(next).toHaveLength(3);
        });

        it('should prioritize packages with more dependents', () => {
            const graph = createMockGraph({
                'a': [],
                'b': [],
                'c': ['a'],
                'd': ['a'],
                'e': ['a']
            });
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState({
                ready: ['a', 'b']
            });

            const next = scheduler.getNext(1, state);

            // 'a' has 3 dependents, 'b' has 0, so 'a' should be prioritized
            expect(next[0]).toBe('a');
        });

        it('should penalize packages with failures', () => {
            const graph = createMockGraph({
                'a': [],
                'b': []
            });
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState({
                ready: ['a', 'b'],
                failed: [{
                    name: 'a',
                    error: 'Previous failure',
                    isRetriable: true,
                    attemptNumber: 1,
                    failedAt: new Date().toISOString(),
                    dependencies: [],
                    dependents: []
                }]
            });

            const next = scheduler.getNext(1, state);

            // 'b' has no failures, should be prioritized over 'a'
            expect(next[0]).toBe('b');
        });
    });

    describe('calculatePriority', () => {
        it('should give higher priority to packages with more dependents', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['a'],
                'd': ['a']
            });
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState();

            const priorityA = scheduler.calculatePriority('a', state);
            const priorityB = scheduler.calculatePriority('b', state);

            expect(priorityA).toBeGreaterThan(priorityB);
        });

        it('should penalize deeper packages', () => {
            const graph = MockGraphPatterns.linear();
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState();

            const priorityA = scheduler.calculatePriority('package-a', state);
            const priorityD = scheduler.calculatePriority('package-d', state);

            expect(priorityA).toBeGreaterThan(priorityD);
        });

        it('should give bonus to leaf nodes', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a']
            });
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState();

            const priorityA = scheduler.calculatePriority('a', state);
            const priorityB = scheduler.calculatePriority('b', state);

            // a has 1 dependent (b), so: 1*100 = 100, depth 0 = 0, no leaf bonus (has dependents) = 100
            // b is a leaf node (no dependents): 0*100 = 0, depth 1 = -10, leaf bonus +5 = -5
            // Both calculations include the leaf bonus logic
            expect(priorityA).toBe(100); // Has dependent, so higher priority
            expect(priorityB).toBe(-5); // Leaf node with depth 1
        });
    });

    describe('predictNextReady', () => {
        it('should predict packages that will become ready', () => {
            const graph = createMockGraph({
                'a': [],
                'b': ['a'],
                'c': ['a', 'b']
            });
            const checker = new DependencyChecker(graph);
            const scheduler = new Scheduler(graph, checker);
            const state = createMockExecutionState({
                pending: ['b', 'c'],
                running: [{
                    name: 'a',
                    startTime: new Date().toISOString(),
                    elapsedTime: 0
                }],
                completed: []
            });

            const predictions = scheduler.predictNextReady(state);

            // 'b' will be ready when 'a' completes
            expect(predictions).toContain('b');
            // 'c' won't be ready yet (still needs 'b')
            expect(predictions).not.toContain('c');
        });
    });
});
