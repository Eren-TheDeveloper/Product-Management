import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
    DatabaseUnavailableError,
    runDatabaseQuery,
} from '../src/db/resilience.js';

test(
    'real Prisma connector times out on an unresponsive peer and retries a read only once',
    { timeout: 12_000 },
    async () => {
        // A local TCP listener accepts connections but never answers PostgreSQL's
        // handshake. This exercises the actual engine timeout without touching a DB.
        const sockets = new Set<Socket>();
        const peer = createServer((socket) => {
            sockets.add(socket);
            socket.on('error', () => {});
            socket.once('close', () => sockets.delete(socket));
        });
        peer.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => peer.once('listening', resolve));
        const port = (peer.address() as AddressInfo).port;
        const client = new PrismaClient({
            datasourceUrl: `postgresql://test:test@127.0.0.1:${port}/test?sslmode=disable&connection_limit=1&connect_timeout=1&pool_timeout=3&socket_timeout=1`,
        });
        let attempts = 0;
        client.$use((params, next) =>
            runDatabaseQuery(
                params,
                async () => {
                    attempts++;
                    return next(params);
                },
                { attempts: 2, delayMs: 1 },
            ),
        );
        try {
            await assert.rejects(
                client.products.findMany(),
                (error) => error instanceof DatabaseUnavailableError,
            );
            assert.equal(attempts, 2);
        } finally {
            for (const socket of sockets) socket.destroy();
            await client.$disconnect();
            await new Promise<void>((resolve, reject) =>
                peer.close((error) => (error ? reject(error) : resolve())),
            );
        }
    },
);
