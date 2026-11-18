import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import config from './config/index.js';
import { connectDB, databaseConfig, disconnectDB } from './db/db.js';
import { databaseErrorCode } from './db/resilience.js';

let server: Server | undefined;
let shutdownPromise: Promise<void> | undefined;

function shutdown(exitCode = 0): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    process.exitCode = exitCode;
    shutdownPromise = (async () => {
        const deadline = setTimeout(() => {
            console.error('[server] Graceful shutdown deadline exceeded');
            server?.closeAllConnections();
            process.exit(1);
        }, databaseConfig.shutdownTimeoutMs);
        deadline.unref();
        try {
            // Stop accepting new requests and drain existing requests before
            // releasing their database pool. Repeated signals share this work.
            try {
                if (server?.listening) {
                    await new Promise<void>((resolve, reject) => {
                        server!.close((error) =>
                            error ? reject(error) : resolve(),
                        );
                        server!.closeIdleConnections();
                    });
                }
            } finally {
                await disconnectDB();
            }
            console.info('[server] Shutdown complete');
        } catch {
            process.exitCode = 1;
            console.error('[server] Shutdown failed');
        } finally {
            clearTimeout(deadline);
        }
    })();
    return shutdownPromise;
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

async function start() {
    try {
        await connectDB();
        if (shutdownPromise) return;
        console.info('[database] Connected and verified');
        server = createServer(createApp());
        server.on('error', () => {
            console.error(
                '[server] HTTP server failed; check PORT and available resources',
            );
            void shutdown(1);
        });
        server.listen(config.PORT, () =>
            console.info(`Server is running on ${config.PORT} port`),
        );
    } catch (error) {
        if (shutdownPromise) return;
        console.error('[database] Startup failed', {
            code: databaseErrorCode(error) || 'CONFIGURATION_OR_ENGINE_ERROR',
        });
        await shutdown(1);
    }
}

void start();
