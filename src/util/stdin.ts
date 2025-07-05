// Function to read from STDIN if available
export async function readStdin(): Promise<string | null> {
    // In test environment, allow mocking to work by skipping TTY check
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
        return new Promise((resolve) => {
            let input = '';
            let hasData = false;
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!hasData && !resolved) {
                    resolved = true;
                    cleanup();
                    resolve(null);
                }
            }, 10); // Very short timeout for tests

            const onData = (chunk: string) => {
                hasData = true;
                clearTimeout(timeout);
                input += chunk;
            };

            const onEnd = () => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(input.trim() || null);
                }
            };

            const onError = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    cleanup();
                    resolve(null);
                }
            };

            const cleanup = () => {
                process.stdin.removeListener('data', onData);
                process.stdin.removeListener('end', onEnd);
                process.stdin.removeListener('error', onError);
                process.stdin.pause();
            };

            process.stdin.setEncoding('utf8');
            process.stdin.on('data', onData);
            process.stdin.on('end', onEnd);
            process.stdin.on('error', onError);
            process.stdin.resume();
        });
    }

    return new Promise((resolve) => {
        // Check if stdin is TTY (interactive terminal)
        if (process.stdin.isTTY) {
            resolve(null);
            return;
        }

        let input = '';
        let hasData = false;
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!hasData && !resolved) {
                resolved = true;
                cleanup();
                resolve(null);
            }
        }, 100); // Short timeout to detect if data is available

        const onData = (chunk: string) => {
            hasData = true;
            clearTimeout(timeout);
            input += chunk;
        };

        const onEnd = () => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(input.trim() || null);
            }
        };

        const onError = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                cleanup();
                resolve(null);
            }
        };

        const cleanup = () => {
            process.stdin.removeListener('data', onData);
            process.stdin.removeListener('end', onEnd);
            process.stdin.removeListener('error', onError);
            process.stdin.pause();
        };

        process.stdin.setEncoding('utf8');
        process.stdin.on('data', onData);
        process.stdin.on('end', onEnd);
        process.stdin.on('error', onError);

        // If no data comes in quickly, assume no stdin
        process.stdin.resume();
    });
} 