type Environment = Record<string, string | undefined>;

function integer(
    env: Environment,
    key: string,
    fallback: number,
    max = 3_600_000,
): number {
    const raw = env[key];
    if (raw === undefined || raw === '') return fallback;
    if (
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw)) ||
        Number(raw) < 1 ||
        Number(raw) > max
    ) {
        throw new Error(`${key} must be an integer between 1 and ${max}`);
    }
    return Number(raw);
}

export function databaseSettings(env: Environment) {
    // Let Prisma report missing credentials at connection time; importing modules
    // and running isolated tests must not require a live database.
    let datasourceUrl: string | undefined;
    if (env.DATABASE_URL) {
        let url: URL;
        try {
            url = new URL(env.DATABASE_URL);
        } catch {
            throw new Error('DATABASE_URL is invalid (value hidden)');
        }
        if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
            throw new Error(
                'DATABASE_URL must use postgres:// or postgresql:// (value hidden)',
            );
        }
        const parameters = [
            ['connection_limit', 'DB_CONNECTION_LIMIT', 5, 1000],
            ['connect_timeout', 'DB_CONNECT_TIMEOUT_SECONDS', 10, 3600],
            ['pool_timeout', 'DB_POOL_TIMEOUT_SECONDS', 5, 3600],
            ['socket_timeout', 'DB_SOCKET_TIMEOUT_SECONDS', 10, 3600],
        ] as const;
        for (const [parameter, key, fallback, max] of parameters) {
            const value = integer(env, key, fallback, max);
            // Explicit URL parameters (including SSL/pooler settings) survive.
            // A DB_* environment variable is an intentional override.
            if (env[key] || !url.searchParams.has(parameter))
                url.searchParams.set(parameter, String(value));
        }
        datasourceUrl = url.toString();
    }
    return {
        datasourceUrl,
        connectAttempts: integer(env, 'DB_CONNECT_ATTEMPTS', 5, 10),
        retryDelayMs: integer(env, 'DB_RETRY_DELAY_MS', 500, 30_000),
        retryMaxDelayMs: integer(env, 'DB_RETRY_MAX_DELAY_MS', 5000, 60_000),
        readAttempts: integer(env, 'DB_READ_ATTEMPTS', 2, 3),
        readRetryDelayMs: integer(env, 'DB_READ_RETRY_DELAY_MS', 150, 1000),
        transactionMaxWaitMs: integer(env, 'DB_TRANSACTION_MAX_WAIT_MS', 5000),
        transactionTimeoutMs: integer(env, 'DB_TRANSACTION_TIMEOUT_MS', 10_000),
        shutdownTimeoutMs: integer(env, 'SHUTDOWN_TIMEOUT_MS', 20_000, 120_000),
    };
}
