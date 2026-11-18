import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { databaseSettings } from './settings.js';
import {
    createDatabaseLifecycle,
    databaseErrorCode,
    runDatabaseQuery,
} from './resilience.js';

export const databaseConfig = databaseSettings(process.env);

type Resources = {
    client: PrismaClient;
    lifecycle: ReturnType<typeof createDatabaseLifecycle>;
};

function createResources(): Resources {
    const client = new PrismaClient({
        ...(databaseConfig.datasourceUrl
            ? { datasourceUrl: databaseConfig.datasourceUrl }
            : {}),
        errorFormat: 'minimal',
        transactionOptions: {
            maxWait: databaseConfig.transactionMaxWaitMs,
            timeout: databaseConfig.transactionTimeoutMs,
        },
    });
    // This project pins Prisma 6.12, whose middleware exposes transaction context.
    client.$use((params, next) =>
        runDatabaseQuery(params, () => next(params), {
            attempts: databaseConfig.readAttempts,
            delayMs: databaseConfig.readRetryDelayMs,
        }),
    );
    const lifecycle = createDatabaseLifecycle(
        client,
        async () => {
            await client.$queryRaw`SELECT 1`;
        },
        {
            attempts: databaseConfig.connectAttempts,
            delayMs: databaseConfig.retryDelayMs,
            maxDelayMs: databaseConfig.retryMaxDelayMs,
            onRetry(error, attempt, delayMs) {
                console.warn('[database] Connection retry', {
                    code: databaseErrorCode(error),
                    attempt,
                    maxAttempts: databaseConfig.connectAttempts,
                    delayMs,
                });
            },
        },
    );
    return { client, lifecycle };
}

const cache = globalThis as typeof globalThis & {
    productManagerDatabase?: Resources;
};
const resources = cache.productManagerDatabase || createResources();
if (process.env.NODE_ENV !== 'production')
    cache.productManagerDatabase = resources;

export const prisma = resources.client;
export const connectDB = resources.lifecycle.connect;
export const checkDatabaseConnection = resources.lifecycle.check;
export const disconnectDB = resources.lifecycle.disconnect;
