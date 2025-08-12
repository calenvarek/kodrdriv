#!/usr/bin/env node

/**
 * Countdown timer utility for audio recording sessions
 * Provides a visual countdown with beep warnings and color changes
 */

import { getLogger } from '../logging';

export interface CountdownOptions {
    /** Duration in seconds */
    durationSeconds: number;
    /** Show beep warning at 30 seconds remaining */
    beepAt30Seconds?: boolean;
    /** Change color to red at 30 seconds remaining */
    redAt30Seconds?: boolean;
    /** Callback function called every second with remaining time */
    onTick?: (remainingSeconds: number) => void;
    /** Callback function called when countdown reaches zero */
    onComplete?: () => void;
    /** Whether to clear the countdown line when finished */
    clearOnComplete?: boolean;
}

/**
 * ANSI escape codes for terminal control
 */
const ANSI = {
    // Cursor movement
    CURSOR_UP: '\x1b[1A',
    CURSOR_TO_START: '\x1b[0G',
    CLEAR_LINE: '\x1b[2K',

    // Colors
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',
    RESET: '\x1b[0m',

    // Text styles
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m'
} as const;

/**
 * Format seconds into MM:SS format
 */
function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Generate a beep sound using process.stdout.write with ASCII bell character
 */
function beep(): void {
    process.stdout.write('\x07'); // ASCII bell character
}

/**
 * Check if terminal supports colors and cursor movement
 */
function supportsAnsi(): boolean {
    return process.stdout.isTTY &&
           process.env.TERM !== 'dumb' &&
           !process.env.NO_COLOR;
}

/**
 * Display a live countdown timer that updates in place
 */
export class CountdownTimer {
    private options: Required<CountdownOptions>;
    private intervalId: NodeJS.Timeout | null = null;
    private currentSeconds: number;
    private hasBeepedAt30: boolean = false;
    private isFirstDisplay: boolean = true;
    private supportsAnsi: boolean;
    private logger = getLogger();
    private cleanupHandlers: Array<() => void> = [];
    private isDestroyed = false;

    constructor(options: CountdownOptions) {
        this.options = {
            beepAt30Seconds: true,
            redAt30Seconds: true,
            onTick: () => {},
            onComplete: () => {},
            clearOnComplete: false,
            ...options
        };
        this.currentSeconds = this.options.durationSeconds;
        this.supportsAnsi = supportsAnsi();

        // Set up cleanup handlers for process termination
        this.setupCleanupHandlers();
    }

    /**
     * Start the countdown timer
     */
    start(): Promise<void> {
        return new Promise((resolve) => {
            // Display initial countdown
            this.displayCountdown();

            this.intervalId = setInterval(() => {
                // Check if destroyed before processing
                if (this.isDestroyed) {
                    return;
                }

                this.currentSeconds--;

                // Check for beep warning
                if (this.options.beepAt30Seconds &&
                    this.currentSeconds === 30 &&
                    !this.hasBeepedAt30) {
                    beep();
                    this.hasBeepedAt30 = true;
                }

                // Call tick callback
                this.options.onTick(this.currentSeconds);

                if (this.currentSeconds <= 0) {
                    this.stop();
                    this.options.onComplete();
                    resolve();
                } else {
                    this.displayCountdown();
                }
            }, 1000);
        });
    }

    /**
     * Stop the countdown timer
     */
    stop(): void {
        if (this.isDestroyed) {
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.options.clearOnComplete && this.supportsAnsi) {
            // Clear the countdown line
            process.stdout.write(ANSI.CURSOR_TO_START + ANSI.CLEAR_LINE);
        } else if (!this.isFirstDisplay) {
            // Add a newline if we've been updating in place
            process.stdout.write('\n');
        }
    }

    /**
     * Get current remaining time
     */
    getRemainingSeconds(): number {
        return this.currentSeconds;
    }

    /**
     * Display the countdown timer
     */
    private displayCountdown(): void {
        const timeString = formatTime(this.currentSeconds);
        const isWarningTime = this.currentSeconds <= 30;

        let output: string;

        if (this.supportsAnsi) {
            // Use colors and in-place updating if supported
            if (!this.isFirstDisplay) {
                // Move cursor up and clear the line to overwrite previous countdown
                process.stdout.write(ANSI.CURSOR_UP + ANSI.CURSOR_TO_START + ANSI.CLEAR_LINE);
            }

            const color = isWarningTime && this.options.redAt30Seconds ? ANSI.RED : ANSI.CYAN;
            const style = isWarningTime ? ANSI.BOLD : '';

            output = `${color}${style}⏱️  Recording time remaining: ${timeString}${ANSI.RESET}`;
        } else {
            // Fallback for terminals that don't support ANSI
            const warning = isWarningTime ? ' ⚠️ ' : '';
            output = `⏱️  Recording time remaining: ${timeString}${warning}`;
        }

        process.stdout.write(output + '\n');
        this.isFirstDisplay = false;
    }

    /**
     * Set up cleanup handlers for process termination and uncaught exceptions
     */
    private setupCleanupHandlers(): void {
        // Skip setting up process listeners in test environments to avoid listener leaks
        if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
            return;
        }

        const cleanup = () => {
            this.destroy();
        };

        // Handle various exit scenarios
        const exitHandler = () => cleanup();
        const uncaughtExceptionHandler = (error: Error) => {
            cleanup();
            // Re-throw to maintain normal error handling
            throw error;
        };

        process.on('exit', exitHandler);
        process.on('SIGINT', exitHandler);
        process.on('SIGTERM', exitHandler);
        process.on('uncaughtException', uncaughtExceptionHandler);
        process.on('unhandledRejection', cleanup);

        // Store handlers for removal during destroy
        this.cleanupHandlers = [
            () => process.removeListener('exit', exitHandler),
            () => process.removeListener('SIGINT', exitHandler),
            () => process.removeListener('SIGTERM', exitHandler),
            () => process.removeListener('uncaughtException', uncaughtExceptionHandler),
            () => process.removeListener('unhandledRejection', cleanup)
        ];
    }

    /**
     * Destroy the timer and clean up all resources
     */
    destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.stop();

        // Remove all process event listeners
        this.cleanupHandlers.forEach(handler => {
            try {
                handler();
            } catch {
                // Ignore errors during cleanup
            }
        });
        this.cleanupHandlers = [];
    }

    /**
     * Check if the timer has been destroyed
     */
    isTimerDestroyed(): boolean {
        return this.isDestroyed;
    }
}

/**
 * Create and start a countdown timer (convenience function)
 */
export async function startCountdown(options: CountdownOptions): Promise<void> {
    const timer = new CountdownTimer(options);
    return timer.start();
}

/**
 * Create a countdown timer for audio recording with sensible defaults
 */
export function createAudioRecordingCountdown(durationSeconds: number): CountdownTimer {
    return new CountdownTimer({
        durationSeconds,
        beepAt30Seconds: true,
        redAt30Seconds: true,
        clearOnComplete: true
    });
}
