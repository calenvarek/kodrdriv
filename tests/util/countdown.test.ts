import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownTimer, startCountdown, createAudioRecordingCountdown } from '../../src/util/countdown';

describe('countdown', () => {
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
        // Mock stdout.write to capture output
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as any;

        // Store original isTTY value and mock it
        originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true
        });

        // Mock timers
        vi.useFakeTimers();
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();

        // Restore original isTTY value
        if (originalIsTTY !== undefined) {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: originalIsTTY,
                configurable: true
            });
        } else {
            delete (process.stdout as any).isTTY;
        }

        vi.useRealTimers();
    });

    describe('CountdownTimer', () => {
        it('should create a countdown timer with default options', () => {
            const timer = new CountdownTimer({ durationSeconds: 60 });
            expect(timer.getRemainingSeconds()).toBe(60);
        });

        it('should display initial countdown', () => {
            const timer = new CountdownTimer({ durationSeconds: 60 });
            timer.start();

            // Should display initial countdown
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('⏱️  Recording time remaining: 01:00')
            );
        });

        it('should countdown and call onTick callback', async () => {
            const onTick = vi.fn();
            const timer = new CountdownTimer({
                durationSeconds: 3,
                onTick
            });

            const timerPromise = timer.start();

            // Advance time by 1 second
            vi.advanceTimersByTime(1000);
            expect(onTick).toHaveBeenCalledWith(2);

            // Advance time by another second
            vi.advanceTimersByTime(1000);
            expect(onTick).toHaveBeenCalledWith(1);

            // Complete the countdown
            vi.advanceTimersByTime(1000);
            await timerPromise;

            expect(onTick).toHaveBeenCalledWith(0);
            expect(onTick).toHaveBeenCalledTimes(3);
        });

        it('should call onComplete callback when countdown finishes', async () => {
            const onComplete = vi.fn();
            const timer = new CountdownTimer({
                durationSeconds: 1,
                onComplete
            });

            const timerPromise = timer.start();
            vi.advanceTimersByTime(1000);
            await timerPromise;

            expect(onComplete).toHaveBeenCalledTimes(1);
        });

        it('should beep at 30 seconds when beepAt30Seconds is enabled', async () => {
            const timer = new CountdownTimer({
                durationSeconds: 31,
                beepAt30Seconds: true
            });

            timer.start();

            // Advance to 30 seconds remaining
            vi.advanceTimersByTime(1000);

            // Should have written the beep character
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should not beep when beepAt30Seconds is disabled', async () => {
            const timer = new CountdownTimer({
                durationSeconds: 31,
                beepAt30Seconds: false
            });

            timer.start();

            // Advance to 30 seconds remaining
            vi.advanceTimersByTime(1000);

            // Should not have written the beep character
            expect(stdoutWriteSpy).not.toHaveBeenCalledWith('\x07');
        });

        it('should change to red color at 30 seconds when redAt30Seconds is enabled', async () => {
            const timer = new CountdownTimer({
                durationSeconds: 31,
                redAt30Seconds: true
            });

            timer.start();

            // Advance to 30 seconds remaining
            vi.advanceTimersByTime(1000);

            // Should display red text for warning time
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('\x1b[31m') // Red ANSI code
            );
        });

        it('should update display in place when ANSI is supported', () => {
            const timer = new CountdownTimer({ durationSeconds: 60 });
            timer.start();

            // Advance timer
            vi.advanceTimersByTime(1000);

            // Should use cursor movement to update in place
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('\x1b[1A') // Cursor up
            );
        });

        it('should fallback to simple display when ANSI is not supported', () => {
            // Mock TTY as false to simulate non-ANSI terminal
            Object.defineProperty(process.stdout, 'isTTY', {
                value: false,
                configurable: true
            });

            const timer = new CountdownTimer({ durationSeconds: 60 });
            timer.start();

            // Should display without ANSI codes
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringMatching(/⏱️\s+Recording time remaining: 01:00\n/)
            );
        });

        it('should stop countdown timer', async () => {
            const timer = new CountdownTimer({ durationSeconds: 60 });
            timer.start();

            // Stop the timer early
            timer.stop();

            // Advance time - should not continue counting
            vi.advanceTimersByTime(5000);

            // Should still be at original time since it was stopped
            expect(timer.getRemainingSeconds()).toBe(60);
        });

        it('should clear line when clearOnComplete is enabled', async () => {
            const timer = new CountdownTimer({
                durationSeconds: 1,
                clearOnComplete: true
            });

            const timerPromise = timer.start();
            vi.advanceTimersByTime(1000);
            await timerPromise;

            // Should clear the line
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[0G\x1b[2K');
        });

        it('should format time correctly', () => {
            // Test various time formats
            const timer1 = new CountdownTimer({ durationSeconds: 65 }); // 1:05
            timer1.start();
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('01:05')
            );

            stdoutWriteSpy.mockClear();

            const timer2 = new CountdownTimer({ durationSeconds: 3661 }); // 61:01
            timer2.start();
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('61:01')
            );
        });

        it('should handle edge case of exactly 30 seconds', async () => {
            const onTick = vi.fn();
            const timer = new CountdownTimer({
                durationSeconds: 30,
                beepAt30Seconds: true,
                onTick
            });

            timer.start();
            // No beep should occur initially at 30 seconds
            expect(stdoutWriteSpy).not.toHaveBeenCalledWith('\x07');

            // The beep should occur when we countdown TO 30 seconds
            const timer2 = new CountdownTimer({
                durationSeconds: 31,
                beepAt30Seconds: true
            });

            timer2.start();
            vi.advanceTimersByTime(1000); // Now at 30 seconds
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });
    });

    describe('startCountdown convenience function', () => {
        it('should create and start countdown timer', async () => {
            const onComplete = vi.fn();

            const timerPromise = startCountdown({
                durationSeconds: 2,
                onComplete
            });

            vi.advanceTimersByTime(2000);
            await timerPromise;

            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });

    describe('createAudioRecordingCountdown factory function', () => {
        it('should create countdown timer with audio recording defaults', () => {
            const timer = createAudioRecordingCountdown(120);

            expect(timer.getRemainingSeconds()).toBe(120);
            // Test that it was created with sensible defaults by starting it
            timer.start();

            // Should display initial countdown
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('⏱️  Recording time remaining: 02:00')
            );
        });

        it('should have beep and red color enabled by default', async () => {
            const timer = createAudioRecordingCountdown(31);
            timer.start();

            // Advance to 30 seconds
            vi.advanceTimersByTime(1000);

            // Should beep and show red
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining('\x1b[31m')
            );
        });
    });

    describe('Environment handling', () => {
        it('should handle NO_COLOR environment variable', () => {
            const originalNoColor = process.env.NO_COLOR;

            try {
                process.env.NO_COLOR = '1';
                const timer = new CountdownTimer({ durationSeconds: 30 });
                timer.start();

                // Should not use ANSI colors when NO_COLOR is set
                expect(stdoutWriteSpy).toHaveBeenCalledWith(
                    expect.stringMatching(/⏱️\s+Recording time remaining: 00:30/)
                );
            } finally {
                if (originalNoColor !== undefined) {
                    process.env.NO_COLOR = originalNoColor;
                } else {
                    delete process.env.NO_COLOR;
                }
            }
        });

        it('should handle dumb terminal', () => {
            const originalTerm = process.env.TERM;

            try {
                process.env.TERM = 'dumb';
                const timer = new CountdownTimer({ durationSeconds: 30 });
                timer.start();

                // Should use fallback display for dumb terminal (includes warning emoji since it's exactly 30 seconds)
                expect(stdoutWriteSpy).toHaveBeenCalledWith(
                    expect.stringMatching(/⏱️\s+Recording time remaining: 00:30 ⚠️/)
                );
            } finally {
                if (originalTerm !== undefined) {
                    process.env.TERM = originalTerm;
                } else {
                    delete process.env.TERM;
                }
            }
        });
    });

    describe('Memory Leak Prevention', () => {
                it('should properly clean up event listeners on destroy', () => {
            // Temporarily override NODE_ENV to ensure process listeners are set up
            const originalNodeEnv = process.env.NODE_ENV;
            const originalVitest = process.env.VITEST;
            delete process.env.NODE_ENV;
            delete process.env.VITEST;

            try {
                const timer = new CountdownTimer({ durationSeconds: 5 });

                // Mock process event listeners to track them
                const addListenerSpy = vi.spyOn(process, 'on');
                const removeListenerSpy = vi.spyOn(process, 'removeListener');

                // Creating timer should set up cleanup handlers
                timer.start();

                // Destroy the timer
                timer.destroy();

                // Verify cleanup handlers were called
                expect(removeListenerSpy).toHaveBeenCalledWith('exit', expect.any(Function));
                expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
                expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
                expect(removeListenerSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
                expect(removeListenerSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

                addListenerSpy.mockRestore();
                removeListenerSpy.mockRestore();
            } finally {
                // Restore original environment
                if (originalNodeEnv !== undefined) {
                    process.env.NODE_ENV = originalNodeEnv;
                }
                if (originalVitest !== undefined) {
                    process.env.VITEST = originalVitest;
                }
            }
        });

        it('should not crash when destroyed multiple times', () => {
            const timer = new CountdownTimer({ durationSeconds: 5 });

            timer.start();
            timer.destroy();

            // Should not throw when destroyed again
            expect(() => timer.destroy()).not.toThrow();
            expect(timer.isTimerDestroyed()).toBe(true);
        });

        it('should not allow operations after destruction', () => {
            const timer = new CountdownTimer({ durationSeconds: 5 });

            timer.destroy();

            // Operations should be no-ops after destruction
            expect(() => timer.stop()).not.toThrow();
            expect(timer.isTimerDestroyed()).toBe(true);
        });

                                                                                it('should clear interval timer on destruction', () => {
            const onTick = vi.fn();
            const timer = new CountdownTimer({
                durationSeconds: 5,
                onTick: onTick
            });

            // Start the timer to create an interval
            timer.start();

            // Advance time to ensure the timer is running
            vi.advanceTimersByTime(1000);
            expect(onTick).toHaveBeenCalledWith(4); // Should have ticked once

            // Clear the mock call count for easier tracking
            onTick.mockClear();

            // Destroy the timer while it's running
            timer.destroy();

            // Advance time more - the timer should no longer tick
            vi.advanceTimersByTime(2000);

            // onTick should not have been called again after destruction
            expect(onTick).not.toHaveBeenCalled();
            expect(timer.isTimerDestroyed()).toBe(true);
        });
    });
});
