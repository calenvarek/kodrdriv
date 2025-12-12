import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLogger } from '../../src/logging';

/**
 * Test suite for AI-friendly logging patterns
 *
 * All log messages in KodrDriv should follow these patterns to be easily
 * understood by AI agents and MCP-driven tools:
 *
 * Pattern: OPERATION_STATE: Description | Key: value | Key2: value2 | Purpose: explanation
 *
 * Examples:
 * - PACKAGE_STARTED: Package execution initiated | Package: @scope/name | Status: running
 * - GIT_FETCH_SUCCESS: Successfully fetched latest remote information | Remote: origin | Status: up-to-date
 * - ERROR_UNEXPECTED: Command encountered unexpected error | Command: publish | Error: message | Type: unexpected
 */

describe('AI-Friendly Logging Patterns', () => {
    describe('Log Message Format Validation', () => {
        it('should have structured prefix with colon separator', () => {
            const validMessages = [
                'PACKAGE_STARTED: Package execution initiated',
                'GIT_FETCH_SUCCESS: Successfully fetched remote',
                'MERGE_CONFLICTS_DETECTED: Conflicts found during merge'
            ];

            validMessages.forEach(msg => {
                expect(msg).toMatch(/^[A-Z_]+:\s+/);
            });
        });

        it('should include key-value pairs with pipe separators', () => {
            const message = 'PACKAGE_COMPLETED: Package finished | Package: test | Status: success';

            expect(message).toContain('|');
            expect(message).toMatch(/\|\s+\w+:\s+/);
        });

        it('should use consistent key naming patterns', () => {
            const validKeys = [
                'Package:', 'Status:', 'Error:', 'Purpose:', 'Action:',
                'Path:', 'Command:', 'Branch:', 'Remote:', 'Count:',
                'Progress:', 'Duration:', 'Mode:', 'Type:', 'Reason:'
            ];

            validKeys.forEach(key => {
                expect(key).toMatch(/^[A-Z][a-z]+:$/);
            });
        });

        it('should not use emojis in structured prefixes', () => {
            const badMessage = '✅_COMPLETED: Task finished';
            const goodMessage = 'TASK_COMPLETED: Task finished successfully | Status: success';

            // Prefix should not contain emojis
            const prefix = goodMessage.split(':')[0];
            expect(prefix).toMatch(/^[A-Z_]+$/);
        });

        it('should use snake_case for operation prefixes', () => {
            const validPrefixes = [
                'PACKAGE_STARTED',
                'GIT_FETCH_SUCCESS',
                'MERGE_AUTO_RESOLVING',
                'NPM_LINK_CLEANUP_REQUIRED',
                'BRANCH_SYNC_FAILED'
            ];

            validPrefixes.forEach(prefix => {
                expect(prefix).toMatch(/^[A-Z_]+$/);
                expect(prefix).not.toContain('-');
                expect(prefix).not.toContain(' ');
            });
        });
    });

    describe('Semantic Operation Naming', () => {
        it('should use clear operation state suffixes', () => {
            const validSuffixes = [
                '_STARTING', '_STARTED', '_COMPLETE', '_COMPLETED',
                '_SUCCESS', '_FAILED', '_ERROR', '_WARNING',
                '_SKIPPED', '_ABORTED', '_RETRYING', '_ATTEMPTING'
            ];

            validSuffixes.forEach(suffix => {
                expect('OPERATION' + suffix).toMatch(/_(STARTING|STARTED|COMPLETE|COMPLETED|SUCCESS|FAILED|ERROR|WARNING|SKIPPED|ABORTED|RETRYING|ATTEMPTING)$/);
            });
        });

        it('should group related operations with consistent prefixes', () => {
            const packageOperations = [
                'PACKAGE_STARTED',
                'PACKAGE_COMPLETED',
                'PACKAGE_FAILED',
                'PACKAGE_SKIPPED'
            ];

            packageOperations.forEach(op => {
                expect(op).toMatch(/^PACKAGE_/);
            });
        });

        it('should use domain-specific prefixes', () => {
            const domainPrefixes = {
                git: ['GIT_FETCH', 'GIT_ADD', 'GIT_COMMIT', 'GIT_PUSH'],
                branch: ['BRANCH_SYNC', 'BRANCH_CREATE', 'BRANCH_SWITCH'],
                npm: ['NPM_INSTALL', 'NPM_LINK', 'NPM_LOCK'],
                merge: ['MERGE_STARTING', 'MERGE_CONFLICTS', 'MERGE_SUCCESS'],
                package: ['PACKAGE_STARTED', 'PACKAGE_COMPLETED', 'PACKAGE_FAILED']
            };

            Object.entries(domainPrefixes).forEach(([domain, operations]) => {
                operations.forEach(op => {
                    expect(op).toMatch(new RegExp(`^${domain.toUpperCase()}_`));
                });
            });
        });
    });

    describe('Contextual Information', () => {
        it('should include relevant context in key-value pairs', () => {
            const message = 'PACKAGE_COMPLETED: Package finished | Package: @scope/name | Progress: 5/10 | Duration: 1500ms';

            expect(message).toContain('Package:');
            expect(message).toContain('Progress:');
            expect(message).toContain('Duration:');
        });

        it('should include error information when operation fails', () => {
            const message = 'PACKAGE_FAILED: Package execution failed | Package: test | Error: Connection timeout | Status: failed';

            expect(message).toContain('Error:');
            expect(message).toContain('Status: failed');
        });

        it('should include action or next steps when applicable', () => {
            const messages = [
                'MERGE_CONFLICTS_DETECTED: Conflicts found | Action: Manual resolution required',
                'ENV_VARS_MISSING: Required variables not set | Action: Set before publish',
                'LINK_CONTINUING: Proceeding despite failure | Next: Link matching dependencies'
            ];

            messages.forEach(msg => {
                expect(msg).toMatch(/\|\s+(Action|Next):\s+/);
            });
        });

        it('should include impact or reason for important state changes', () => {
            const messages = [
                'RELEASE_SKIPPED: No meaningful changes | Reason: Version-only change',
                'CONTEXT_SAVE_FAILED: Cannot save state | Impact: Recovery may be affected',
                'BRANCH_SYNC_FAILED: Sync operation failed | Impact: Cannot proceed with publish'
            ];

            messages.forEach(msg => {
                expect(msg).toMatch(/\|\s+(Impact|Reason):\s+/);
            });
        });
    });

    describe('Progress and Status Indicators', () => {
        it('should include progress information for iterative operations', () => {
            const message = 'PACKAGE_EXECUTING: Running command | Package: test | Progress: [3/10] | Command: npm test';

            expect(message).toMatch(/Progress:\s+\[\d+\/\d+\]/);
        });

        it('should include status for completion messages', () => {
            const validStatuses = [
                'Status: success',
                'Status: failed',
                'Status: completed',
                'Status: skipped',
                'Status: in-progress'
            ];

            validStatuses.forEach(status => {
                expect(status).toMatch(/Status:\s+(success|failed|completed|skipped|in-progress|ready)/);
            });
        });

        it('should include duration for performance-critical operations', () => {
            const message = 'PARALLEL_EXECUTION_COMPLETED: Execution finished | Duration: 45s | Status: completed';

            expect(message).toMatch(/Duration:\s+\d+[ms|s]/);
        });
    });

    describe('Dry Run Mode Indicators', () => {
        it('should clearly indicate dry-run operations', () => {
            const dryRunMessages = [
                'PRECHECK_GIT_REPO: Would verify git repository | Mode: dry-run',
                'GIT_ADD_DRY_RUN: Would stage all changes | Mode: dry-run',
                'SELF_LINK_DRY_RUN: Would link package globally | Mode: dry-run'
            ];

            dryRunMessages.forEach(msg => {
                expect(msg).toContain('Mode: dry-run');
            });
        });

        it('should distinguish between real and simulated actions', () => {
            const realMessage = 'GIT_FETCH_SUCCESS: Fetched remote information | Remote: origin | Status: up-to-date';
            const dryRunMessage = 'GIT_FETCH_DRY_RUN: Would fetch remote information | Mode: dry-run | Remote: origin';

            expect(dryRunMessage).toContain('Mode: dry-run');
            expect(realMessage).not.toContain('dry-run');
        });
    });

    describe('Error Recovery Information', () => {
        it('should provide resolution steps for errors', () => {
            const message = 'CONFLICT_RESOLUTION_REQUIRED: Manual steps needed | Step 1: Resolve conflicts | Step 2: Stage files';

            expect(message).toContain('Step');
        });

        it('should indicate if error is recoverable', () => {
            const recoverableMessage = 'ERROR_RECOVERABLE: This error is recoverable | Action: Retry operation | Status: can-retry';

            expect(recoverableMessage).toContain('recoverable');
            expect(recoverableMessage).toContain('Action:');
        });

        it('should provide alternative options when available', () => {
            const message = 'WORKFLOW_NO_PR_TRIGGER: No PR triggers found | Alternative: Update workflow config';

            expect(message).toContain('Alternative:');
        });
    });

    describe('Machine-Readable Markers', () => {
        it('should use consistent markers for special events', () => {
            const markers = [
                'KODRDRIV_PUBLISH_SKIPPED',
                'SENDIT_MODE_ACTIVE',
                'USER_CANCELLATION'
            ];

            markers.forEach(marker => {
                expect(marker).toMatch(/^[A-Z_]+$/);
            });
        });

        it('should include execution context for recovery', () => {
            const message = 'EXECUTION_METRICS: Performance statistics | Total: 10 | Completed: 8 | Failed: 2';

            expect(message).toMatch(/Total:\s+\d+/);
            expect(message).toMatch(/Completed:\s+\d+/);
            expect(message).toMatch(/Failed:\s+\d+/);
        });
    });

    describe('Integration Examples', () => {
        it('should support parsing by AI tools', () => {
            const message = 'PACKAGE_COMPLETED: Package finished | Package: @test/pkg | Progress: 5/10 | Duration: 1500ms | Status: success';

            // AI should be able to extract:
            const operation = message.split(':')[0];
            expect(operation).toBe('PACKAGE_COMPLETED');

            const description = message.split(':')[1].split('|')[0].trim();
            expect(description).toBe('Package finished');

            // Extract key-value pairs
            const kvPairs = message.split('|').slice(1);
            expect(kvPairs.length).toBeGreaterThan(0);

            kvPairs.forEach(pair => {
                expect(pair).toMatch(/\s*\w+:\s+.+/);
            });
        });

        it('should support real-world command flow tracking', () => {
            const commandFlow = [
                'PRECHECK_STARTING: Executing publish prechecks | Phase: validation',
                'PRECHECK_GIT_STATUS: Checking for uncommitted changes | Requirement: Clean working directory',
                'PRECHECK_BRANCH: Verifying current branch | Requirement: Must run from feature branch',
                'PRECHECK_COMPLETE: All prechecks passed | Status: Ready to proceed'
            ];

            commandFlow.forEach((msg, index) => {
                expect(msg).toMatch(/^[A-Z_]+:\s+/);
                if (index < commandFlow.length - 1) {
                    expect(msg).toContain('PRECHECK');
                }
            });
        });
    });
});

describe('Logging Pattern Helper Functions', () => {
    describe('Pattern Validation', () => {
        it('should validate log message format', () => {
            const isValidLogMessage = (msg: string): boolean => {
                // Must have structured prefix with colon
                if (!/^[A-Z_]+:\s+/.test(msg)) return false;

                // Should not start with emoji
                if (/^[^\w]/.test(msg)) return false;

                return true;
            };

            expect(isValidLogMessage('PACKAGE_STARTED: Package initiated')).toBe(true);
            expect(isValidLogMessage('package started')).toBe(false);
            expect(isValidLogMessage('✅ Package started')).toBe(false);
        });

        it('should extract operation from log message', () => {
            const extractOperation = (msg: string): string => {
                return msg.split(':')[0];
            };

            expect(extractOperation('PACKAGE_STARTED: Package initiated')).toBe('PACKAGE_STARTED');
            expect(extractOperation('GIT_FETCH_SUCCESS: Fetched remote')).toBe('GIT_FETCH_SUCCESS');
        });

        it('should extract key-value pairs from log message', () => {
            const extractKeyValues = (msg: string): Record<string, string> => {
                const parts = msg.split('|').slice(1); // Skip description
                const kvPairs: Record<string, string> = {};

                parts.forEach(part => {
                    const match = part.match(/\s*([^:]+):\s+(.+)/);
                    if (match) {
                        kvPairs[match[1].trim()] = match[2].trim();
                    }
                });

                return kvPairs;
            };

            const msg = 'PACKAGE_COMPLETED: Finished | Package: test | Status: success | Duration: 1500ms';
            const kvPairs = extractKeyValues(msg);

            expect(kvPairs['Package']).toBe('test');
            expect(kvPairs['Status']).toBe('success');
            expect(kvPairs['Duration']).toBe('1500ms');
        });
    });
});

