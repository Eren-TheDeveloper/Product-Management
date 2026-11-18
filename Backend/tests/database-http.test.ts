import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

process.env.JWT_ACCESS_SECRET = 'database-http-tests-only-secret';
const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db/db.js');
const { default: config } = await import('../src/config/index.js');
let probeCalls = 0;
let probeError: unknown;
const app = createApp({
    checkDatabase: async () => {
        probeCalls++;
        if (probeError) throw probeError;
    },
});
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const restorers: Array<() => void> = [];
function stub(target: object, method: string, value: (...args: any[]) => any) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = value;
    restorers.push(() => {
        delegate[method] = original;
    });
}

before(async () => {
    mock.method(console, 'warn', () => {});
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => {
    for (const restore of restorers.splice(0).reverse()) restore();
    probeCalls = 0;
    probeError = undefined;
});
after(async () => {
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.$disconnect();
    mock.restoreAll();
});

const authorization = () =>
    `Bearer ${jwt.sign({ id: 'user-test' }, process.env.JWT_ACCESS_SECRET!, { algorithm: 'HS256', subject: 'accessApi', expiresIn: '1m' })}`;

test('liveness does not depend on the database', async () => {
    probeError = new Error('database down');
    const response = await fetch(`${baseUrl}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(probeCalls, 0);
});

test('readiness probes the database and prevents cached success', async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
        status: 'ready',
        database: 'up',
    });
    assert.equal(probeCalls, 1);
});

test('readiness returns safe 503 on an outage and recovers on the next probe', async () => {
    probeError = Object.assign(
        new Error('postgres://user:secret@private-host/db'),
        { code: 'P1001' },
    );
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');
    assert.deepEqual(await response.json(), {
        status: 'not_ready',
        database: 'down',
    });
    probeError = undefined;
    assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 200);
});

test('login database timeouts return 503 instead of invalid-credentials or generic 500', async () => {
    stub(prisma.user, 'findUnique', async () => {
        throw { errorCode: 'P1002', message: 'private connection details' };
    });
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'test@example.com',
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');
    const body = await response.json();
    assert.equal(body.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(body).includes('private'));
});

test('auth middleware pool timeouts are handled as database errors', async () => {
    stub(prisma.user, 'findUnique', async () => {
        throw { code: 'P2024' };
    });
    const response = await fetch(`${baseUrl}/api/products`, {
        headers: { Authorization: authorization() },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('vary') || '', /Authorization/);
    assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
});

test('cart database errors preserve the unavailable response contract', async () => {
    stub(prisma.user, 'findUnique', async () => ({
        id: 'user-test',
        role: 'user',
    }));
    stub(prisma.cartItem, 'findMany', async () => {
        throw { code: 'P1017' };
    });
    const response = await fetch(`${baseUrl}/api/cart`, {
        headers: { Authorization: authorization() },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
});

test('failed product writes are not presented as invalid user input', async () => {
    stub(prisma.user, 'findUnique', async () => ({
        id: 'user-test',
        role: 'admin',
    }));
    stub(prisma.products, 'findUnique', async () => ({
        id: 1,
        name: 'Test Product',
    }));
    let writes = 0;
    stub(prisma.products, 'update', async () => {
        writes++;
        throw { code: 'P1017' };
    });
    const response = await fetch(`${baseUrl}/api/products/update/stock`, {
        method: 'PATCH',
        headers: {
            Authorization: authorization(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test Product', stock: 4 }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
    assert.equal(writes, 1);
});

test('the legacy sale route is mounted and requires authentication with no-store responses', async () => {
    const response = await fetch(`${baseUrl}/sale/addcart`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, quantity: 1 }),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('production CORS accepts exact origins and rejects substrings, suffixes and other ports', async () => {
    const originalEnv = config.NODE_ENV;
    const originalOrigins = config.WHITELIST_ORIGINS;
    let corsServer: ReturnType<typeof app.listen> | undefined;
    try {
        config.NODE_ENV = 'production';
        config.WHITELIST_ORIGINS = ' https://shop.example.com, https://admin.example.com:8443 ';
        corsServer = createApp().listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => corsServer!.once('listening', resolve));
        const url = `http://127.0.0.1:${(corsServer.address() as AddressInfo).port}/health/live`;
        for (const origin of ['https://shop.example.com', 'https://admin.example.com:8443']) {
            const response = await fetch(url, { headers: { Origin: origin } });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('access-control-allow-origin'), origin);
        }
        for (const origin of ['https://example.com', 'https://shop.example.com.evil.test', 'https://admin.example.com', 'null']) {
            const response = await fetch(url, { headers: { Origin: origin } });
            assert.equal(response.status, 403);
            assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
        assert.equal((await fetch(url)).status, 200);
        const preflight = await fetch(url, {
            method: 'OPTIONS', headers: { Origin: 'https://shop.example.com', 'Access-Control-Request-Method': 'PATCH' },
        });
        assert.equal(preflight.status, 204);
    } finally {
        config.NODE_ENV = originalEnv;
        config.WHITELIST_ORIGINS = originalOrigins;
        if (corsServer) await new Promise<void>((resolve, reject) => corsServer!.close((error) => error ? reject(error) : resolve()));
    }
});

test('malformed and oversized JSON return safe client errors', async () => {
    const malformed = await fetch(`${baseUrl}/api/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, 'Invalid request body');
    const oversized = await fetch(`${baseUrl}/api/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(110_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).message, 'Request body too large');
});
