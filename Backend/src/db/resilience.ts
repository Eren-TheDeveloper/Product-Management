import { setTimeout as sleep } from 'node:timers/promises';

const connectionCodes = new Set([
    'P1001',
    'P1002',
    'P1008',
    'P1017',
    'P2024',
    'P2037',
]);
// Saturated pools and query timeouts should fail promptly rather than add load.
const readRetryCodes = new Set(['P1001', 'P1002', 'P1017']);
const reads = new Set([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
]);

export function databaseErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return;
    const value = error as {
        code?: unknown;
        errorCode?: unknown;
        databaseCode?: unknown;
        name?: unknown;
        message?: unknown;
    };
    if (typeof value.databaseCode === 'string') return value.databaseCode;
    if (typeof value.code === 'string') return value.code;
    if (typeof value.errorCode === 'string') return value.errorCode;
    // Prisma 6.12 can omit errorCode when a lazy query fails to initialize the
    // engine (unlike an explicit $connect). Match only its documented messages
    // on this specific error type; never classify arbitrary application errors.
    if (
        value.name === 'PrismaClientInitializationError' &&
        typeof value.message === 'string'
    ) {
        if (
            value.message.includes(
                'Timed out fetching a new connection from the connection pool',
            )
        )
            return 'P2024';
        if (value.message.includes("Can't reach database server at"))
            return 'P1001';
        if (
            /database server[\s\S]*was reached but timed out/i.test(
                value.message,
            )
        )
            return 'P1002';
        if (value.message.includes('Server has closed the connection'))
            return 'P1017';
    }
}

export const isDatabaseUnavailable = (error: unknown) =>
    connectionCodes.has(databaseErrorCode(error) || '');

export class DatabaseUnavailableError extends Error {
    readonly databaseCode: string;
    constructor(error: unknown) {
        super('Database temporarily unavailable');
        this.name = 'DatabaseUnavailableError';
        this.databaseCode = databaseErrorCode(error) || 'UNKNOWN';
    }
}

interface RetryOptions {
    attempts: number;
    delayMs: number;
    maxDelayMs: number;
    shouldRetry: (error: unknown) => boolean;
    signal?: AbortSignal;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
    random?: () => number;
    wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export async function retryDatabaseOperation<T>(
    action: () => Promise<T>,
    options: RetryOptions,
): Promise<T> {
    const wait =
        options.wait ||
        ((delayMs, signal) => sleep(delayMs, undefined, { signal }));
    for (let attempt = 1; ; attempt++) {
        options.signal?.throwIfAborted();
        try {
            return await action();
        } catch (error) {
            options.signal?.throwIfAborted();
            if (attempt >= options.attempts || !options.shouldRetry(error))
                throw error;
            const baseDelay = Math.min(
                options.delayMs * 2 ** (attempt - 1),
                options.maxDelayMs,
            );
            const delayMs = Math.min(
                options.maxDelayMs,
                Math.round(
                    baseDelay * (1 + (options.random || Math.random)() * 0.25),
                ),
            );
            options.onRetry?.(error, attempt, delayMs);
            await wait(delayMs, options.signal);
        }
    }
}

export async function runDatabaseQuery<T>(
    params: { action: string; runInTransaction: boolean },
    action: () => Promise<T>,
    options: { attempts: number; delayMs: number; wait?: RetryOptions['wait'] },
): Promise<T> {
    try {
        // Never replay writes, raw SQL or queries inside an interactive transaction.
        // A connection loss may occur after the server committed a write.
        return await retryDatabaseOperation(action, {
            attempts:
                !params.runInTransaction && reads.has(params.action)
                    ? options.attempts
                    : 1,
            delayMs: options.delayMs,
            maxDelayMs: options.delayMs * 2,
            shouldRetry: (error) =>
                readRetryCodes.has(databaseErrorCode(error) || ''),
            wait: options.wait,
        });
    } catch (error) {
        if (isDatabaseUnavailable(error))
            throw new DatabaseUnavailableError(error);
        throw error;
    }
}

interface DatabaseClient {
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
}

export function createDatabaseLifecycle(
    client: DatabaseClient,
    probe: () => Promise<unknown>,
    options: Omit<RetryOptions, 'shouldRetry' | 'signal'>,
) {
    const abort = new AbortController();
    let connection: Promise<void> | undefined;
    let disconnection: Promise<void> | undefined;
    let healthCheck: Promise<void> | undefined;
    let closing = false;

    const connect = (): Promise<void> => {
        if (closing)
            return Promise.reject(new Error('Database is shutting down'));
        if (!connection) {
            connection = retryDatabaseOperation(
                async () => {
                    await client.$connect();
                    abort.signal.throwIfAborted();
                    await probe();
                },
                {
                    ...options,
                    shouldRetry: isDatabaseUnavailable,
                    signal: abort.signal,
                },
            ).catch((error) => {
                connection = undefined;
                throw error;
            });
        }
        return connection;
    };

    const check = (): Promise<void> => {
        if (closing)
            return Promise.reject(new Error('Database is shutting down'));
        // Concurrent readiness requests share one real SELECT 1, not N queries.
        if (!healthCheck)
            healthCheck = probe()
                .then(() => undefined)
                .finally(() => {
                    healthCheck = undefined;
                });
        return healthCheck;
    };

    const disconnect = (): Promise<void> => {
        if (!disconnection) {
            closing = true;
            abort.abort();
            disconnection = (async () => {
                await Promise.allSettled([connection, healthCheck]);
                await client.$disconnect();
            })();
        }
        return disconnection;
    };

    return { connect, check, disconnect };
}
