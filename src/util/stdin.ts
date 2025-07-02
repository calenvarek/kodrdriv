// Function to read from STDIN if available
export async function readStdin(): Promise<string | null> {
    // In test environment, allow mocking to work by skipping TTY check
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
        return new Promise((resolve) => {
            let input = '';
            let hasData = false;

            const timeout = setTimeout(() => {
                if (!hasData) {
                    resolve(null);
                }
            }, 10); // Very short timeout for tests

            process.stdin.setEncoding('utf8');

            process.stdin.on('data', (chunk) => {
                hasData = true;
                clearTimeout(timeout);
                input += chunk;
            });

            process.stdin.on('end', () => {
                resolve(input.trim() || null);
            });

            process.stdin.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });

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

        const timeout = setTimeout(() => {
            if (!hasData) {
                resolve(null);
            }
        }, 100); // Short timeout to detect if data is available

        process.stdin.setEncoding('utf8');

        process.stdin.on('data', (chunk) => {
            hasData = true;
            clearTimeout(timeout);
            input += chunk;
        });

        process.stdin.on('end', () => {
            resolve(input.trim() || null);
        });

        process.stdin.on('error', () => {
            clearTimeout(timeout);
            resolve(null);
        });

        // If no data comes in quickly, assume no stdin
        process.stdin.resume();
    });
} 