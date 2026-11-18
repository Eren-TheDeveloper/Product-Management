import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

process.env.JWT_ACCESS_SECRET = 'products-tests-only-secret';
const { prisma } = await import('../src/db/db.js');
const { default: routes } = await import('../src/routes/products/productRoutes.js');
const { errorHandler } = await import('../src/middleware/databaseError.js');
const app = express();
app.use(express.json());
app.use('/api/products', routes);
app.use(errorHandler);
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let writes = 0;
let lastData: unknown;
const restorers: Array<() => void> = [];
function stub(target: object, method: string, implementation: (...args: any[]) => any) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = implementation;
    restorers.push(() => { delegate[method] = original; });
}
const dbError = (code: string) => new Prisma.PrismaClientKnownRequestError('private database details', { code, clientVersion: '6.12' });

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/products`;
});
beforeEach(() => {
    writes = 0;
    lastData = undefined;
    stub(prisma.user, 'findUnique', async ({ where }: any) => ({ id: where.id, role: where.id }));
    for (const method of ['create', 'update', 'delete']) {
        stub(prisma.products, method, async ({ data }: any) => {
            writes++;
            lastData = data;
            return { id: 1, ...data };
        });
    }
});
afterEach(() => { for (const restore of restorers.splice(0).reverse()) restore(); });
after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
});
async function request(method: string, path: string, body?: unknown, role: string | null = 'admin') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (role) headers.Authorization = `Bearer ${jwt.sign({ id: role }, process.env.JWT_ACCESS_SECRET!, {
        algorithm: 'HS256', subject: 'accessApi', expiresIn: '1m',
    })}`;
    const response = await fetch(`${baseUrl}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}

test('product writes require authentication and an administrator', async () => {
    for (const [method, path] of [['POST', ''], ['PATCH', '/update/stock'], ['PATCH', '/update/price'], ['DELETE', '']]) {
        assert.equal((await request(method!, path!, {}, null)).status, 401);
        assert.equal((await request(method!, path!, {}, 'user')).status, 403);
    }
    assert.equal(writes, 0);
});

test('missing, malformed and blank product bodies are rejected before database writes', async () => {
    for (const body of [undefined, null, [], {}, { name: 1 }, { name: '  ' }, { name: 'x'.repeat(151) }]) {
        for (const [method, path] of [['POST', ''], ['PATCH', '/update/stock'], ['PATCH', '/update/price'], ['DELETE', '']]) {
            assert.equal((await request(method!, path!, body)).status, 400);
        }
    }
    assert.equal(writes, 0);
});

test('stock must be a nonnegative PostgreSQL integer for creation and updates', async () => {
    for (const stock of [undefined, null, -1, 0.5, '2', true, {}, [], 2_147_483_648]) {
        const body = { name: 'Product', price: 1, stock };
        assert.equal((await request('POST', '', body)).status, 400);
        assert.equal((await request('PATCH', '/update/stock', body)).status, 400);
    }
    assert.equal(writes, 0);
});

test('prices reject coercion, overflow and silent fractional rounding', async () => {
    for (const price of [undefined, null, -1, true, {}, [], '', ' ', 'NaN', 'Infinity', '1e3', 0.001, '1.001', 10_000_000_000]) {
        const body = { name: 'Product', stock: 1, price };
        assert.equal((await request('POST', '', body)).status, 400);
        assert.equal((await request('PATCH', '/update/price', body)).status, 400);
    }
    assert.equal(writes, 0);
});

test('zero, schema limits and exact decimal strings remain valid', async () => {
    for (const price of [0, 0.29, '0.10', '9999999999.99']) {
        assert.equal((await request('POST', '', { name: ' Product ', stock: 2_147_483_647, price })).status, 201);
        assert.deepEqual(lastData, { name: 'Product', stock: 2_147_483_647, price });
    }
    assert.equal((await request('PATCH', '/update/stock', { name: 'Product', stock: 0 })).status, 200);
    assert.equal((await request('PATCH', '/update/price', { name: 'Product', price: 0 })).status, 200);
});

test('concurrent duplicate creation returns 409 without disclosing database details', async () => {
    stub(prisma.products, 'create', async () => { throw dbError('P2002'); });
    const result = await request('POST', '', { name: 'Product', price: 1, stock: 1 });
    assert.equal(result.status, 409);
    assert.ok(!JSON.stringify(result.body).includes('private'));
});

test('updates and deletes of missing products consistently return 404', async () => {
    stub(prisma.products, 'update', async () => { throw dbError('P2025'); });
    stub(prisma.products, 'delete', async () => { throw dbError('P2025'); });
    assert.equal((await request('PATCH', '/update/stock', { name: 'Missing', stock: 0 })).status, 404);
    assert.equal((await request('PATCH', '/update/price', { name: 'Missing', price: 0 })).status, 404);
    assert.equal((await request('DELETE', '', { name: 'Missing' })).status, 404);
});

test('product identifiers reject alternate numeric syntax before querying', async () => {
    let reads = 0;
    stub(prisma.products, 'findUnique', async () => { reads++; return null; });
    for (const id of ['0', '-1', '1.5', '1e0', '0x1', '01', '2147483648']) {
        assert.equal((await request('GET', `/${id}`)).status, 400);
    }
    assert.equal(reads, 0);
});
