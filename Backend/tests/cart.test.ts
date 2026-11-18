import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

process.env.JWT_ACCESS_SECRET = 'cart-tests-only-secret';
const { prisma } = await import('../src/db/db.js');
const { default: cartRoutes } = await import('../src/routes/sales/cartRoutes.js');
const { default: salesRoutes } = await import('../src/routes/sales/salesRoutes.js');

// Prisma delegates are Proxy objects, so replace their methods directly.
const restorers: Array<() => void> = [];
function stub(target: object, method: string, implementation: (...args: any[]) => any) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = implementation;
    restorers.push(() => { delegate[method] = original; });
}

const products = new Map<number, {
    id: number; name: string; barcode: string; price: Prisma.Decimal; stock: number;
}>();
const rows = new Map<string, { userId: string; productId: number; quantity: number }>();
const key = (userId: string, productId: number) => `${userId}:${productId}`;
const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);
app.use('/sale', salesRoutes);
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
});

beforeEach(() => {
    products.clear();
    rows.clear();
    products.set(1, { id: 1, name: 'Product A', barcode: 'barcode-a', price: new Prisma.Decimal('0.10'), stock: 5 });
    products.set(2, { id: 2, name: 'Product B', barcode: 'barcode-b', price: new Prisma.Decimal('0.20'), stock: 10 });

    // Exercise the real routes, auth, controllers and services without a live database.
    stub(prisma.user, 'findUnique', async ({ where }: any) =>
        ['user-a', 'user-b'].includes(where.id) ? { id: where.id, role: 'user' } : null);
    stub(prisma.products, 'findUnique', async ({ where }: any) => products.get(where.id) ?? null);
    stub(prisma.cartItem, 'findUnique', async ({ where }: any) => {
        const { userId, productId } = where.userId_productId;
        return rows.get(key(userId, productId)) ?? null;
    });
    stub(prisma.cartItem, 'findMany', async ({ where }: any) =>
        [...rows.values()].filter((row) => row.userId === where.userId)
            .map((row) => ({ ...row, product: products.get(row.productId) })));
    stub(prisma.cartItem, 'upsert', async ({ where, create, update }: any) => {
        const { userId, productId } = where.userId_productId;
        const rowKey = key(userId, productId);
        const existing = rows.get(rowKey);
        const row = existing ? { ...existing, ...update } : create;
        rows.set(rowKey, row);
        return row;
    });
    stub(prisma.cartItem, 'deleteMany', async ({ where }: any) => {
        let count = 0;
        for (const [rowKey, row] of rows) {
            if (row.userId === where.userId && (where.productId === undefined || row.productId === where.productId)) {
                rows.delete(rowKey);
                count++;
            }
        }
        return { count };
    });
    stub(prisma, '$transaction', async (action: any, options: any) => {
        assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
        return action(prisma);
    });
});

afterEach(() => { for (const restore of restorers.splice(0).reverse()) restore(); mock.restoreAll(); });

async function request(method: string, path: string, body?: unknown, userId: string | null = 'user-a') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) {
        const token = jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET!, {
            algorithm: 'HS256', subject: 'accessApi', expiresIn: '1m',
        });
        headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}

test('all cart routes and the original addcart route require authentication', async () => {
    for (const [method, path] of [
        ['GET', '/api/cart'], ['POST', '/api/cart/items'], ['PATCH', '/api/cart/items/1'],
        ['DELETE', '/api/cart/items/1'], ['DELETE', '/api/cart'], ['POST', '/sale/addcart'],
    ]) {
        assert.equal((await request(method!, path!, undefined, null)).status, 401);
    }
    assert.equal((await request('GET', '/api/cart', undefined, 'deleted-user')).status, 401);
});

test('an empty cart has zero totals', async () => {
    const result = await request('GET', '/api/cart');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.cart, { items: [], totalQuantity: 0, totalPrice: '0.00' });
});

test('adding merges quantities, ignores client prices and leaves stock unchanged', async () => {
    let result = await request('POST', '/api/cart/items', {
        productId: 1, quantity: 2, price: 999, name: 'spoofed', userId: 'user-b',
    });
    assert.equal(result.status, 200);
    result = await request('POST', '/api/cart/items', { productId: 1, quantity: 1 });
    assert.equal(result.body.cart.items.length, 1);
    assert.equal(result.body.cart.items[0].quantity, 3);
    assert.equal(result.body.cart.items[0].name, 'Product A');
    assert.equal(result.body.cart.items[0].price, '0.10');
    assert.equal(result.body.cart.totalPrice, '0.30');
    assert.equal(products.get(1)!.stock, 5);
    assert.equal((await request('GET', '/api/cart', undefined, 'user-b')).body.cart.items.length, 0);
});

test('the original id and optional barcode request remains supported', async () => {
    const result = await request('POST', '/sale/addcart', { id: 1, barcode: 'barcode-a', quantity: 2 });
    assert.equal(result.status, 200);
    assert.equal(result.body.cart.items[0].productId, 1);
    assert.equal((await request('GET', '/api/cart')).body.cart.totalQuantity, 2);
    assert.equal((await request('POST', '/sale/addcart', { id: 1, barcode: 'wrong', quantity: 1 })).status, 404);
});

test('totals use exact decimal arithmetic and current database prices', async () => {
    await request('POST', '/api/cart/items', { productId: 1, quantity: 3 });
    let result = await request('POST', '/api/cart/items', { productId: 2, quantity: 1 });
    assert.equal(result.body.cart.totalPrice, '0.50');
    assert.equal(result.body.cart.totalQuantity, 4);
    products.get(1)!.price = new Prisma.Decimal('1.15');
    result = await request('GET', '/api/cart');
    assert.equal(result.body.cart.totalPrice, '3.65');
    assert.equal(result.body.cart.items[0].subtotal, '3.45');
});

test('invalid quantities and product identifiers are rejected without writes', async () => {
    for (const invalid of [0, -1, 1.5, '2', null, true, 2_147_483_648, {}, []]) {
        assert.equal((await request('POST', '/api/cart/items', { productId: 1, quantity: invalid })).status, 400);
        assert.equal((await request('POST', '/api/cart/items', { productId: invalid, quantity: 1 })).status, 400);
    }
    for (const body of [undefined, {}, [], { productId: 1 }, { quantity: 1 },
        { productId: 1, id: 2, quantity: 1 }, { productId: 1, quantity: 1, barcode: 123 }]) {
        assert.equal((await request('POST', '/api/cart/items', body)).status, 400);
    }
    for (const id of ['0', '-1', '1.5', '1e0', 'abc', '2147483648']) {
        assert.equal((await request('PATCH', `/api/cart/items/${id}`, { quantity: 1 })).status, 400);
        assert.equal((await request('DELETE', `/api/cart/items/${id}`)).status, 400);
    }
    assert.equal(rows.size, 0);
});

test('missing products and quantities exceeding available stock are rejected', async () => {
    assert.equal((await request('POST', '/api/cart/items', { productId: 999, quantity: 1 })).status, 404);
    assert.equal((await request('POST', '/api/cart/items', { productId: 1, quantity: 6 })).status, 409);
    await request('POST', '/api/cart/items', { productId: 1, quantity: 4 });
    assert.equal((await request('POST', '/api/cart/items', { productId: 1, quantity: 2 })).status, 409);
    assert.equal(rows.get(key('user-a', 1))!.quantity, 4);
    products.get(2)!.stock = 0;
    assert.equal((await request('POST', '/api/cart/items', { productId: 2, quantity: 1 })).status, 409);
});

test('patch sets the absolute quantity and validates stock and existence', async () => {
    assert.equal((await request('PATCH', '/api/cart/items/1', { quantity: 1 })).status, 404);
    await request('POST', '/api/cart/items', { productId: 1, quantity: 3 });
    const result = await request('PATCH', '/api/cart/items/1', { quantity: 2 });
    assert.equal(result.status, 200);
    assert.equal(result.body.cart.totalQuantity, 2);
    assert.equal((await request('PATCH', '/api/cart/items/1', { quantity: 6 })).status, 409);
    assert.equal((await request('PATCH', '/api/cart/items/1', { quantity: 0 })).status, 400);
    assert.equal((await request('PATCH', '/api/cart/items/1', { quantity: '2' })).status, 400);
    assert.equal(rows.get(key('user-a', 1))!.quantity, 2);
});

test('reading, modifying, removing and clearing a cart are scoped to its owner', async () => {
    await request('POST', '/api/cart/items', { productId: 1, quantity: 2 });
    assert.equal((await request('PATCH', '/api/cart/items/1', { quantity: 1 }, 'user-b')).status, 404);
    assert.equal((await request('DELETE', '/api/cart/items/1', undefined, 'user-b')).status, 404);
    await request('POST', '/api/cart/items', { productId: 1, quantity: 1 }, 'user-b');
    let result = await request('DELETE', '/api/cart/items/1', undefined, 'user-b');
    assert.equal(result.body.cart.totalQuantity, 0);
    assert.equal((await request('GET', '/api/cart')).body.cart.totalQuantity, 2);
    await request('POST', '/api/cart/items', { productId: 2, quantity: 1 }, 'user-b');
    result = await request('DELETE', '/api/cart');
    assert.deepEqual(result.body.cart, { items: [], totalQuantity: 0, totalPrice: '0.00' });
    assert.equal((await request('GET', '/api/cart', undefined, 'user-b')).body.cart.totalQuantity, 1);
    assert.equal((await request('DELETE', '/api/cart')).status, 200);
});

for (const code of ['P2034', 'P2002']) {
    test(`a transient ${code} transaction conflict is retried`, async () => {
        let attempts = 0;
        stub(prisma, '$transaction', async (action: any) => {
            attempts++;
            if (attempts === 1) throw new Prisma.PrismaClientKnownRequestError('Conflict', { code, clientVersion: '6.12' });
            return action(prisma);
        });
        assert.equal((await request('POST', '/api/cart/items', { productId: 1, quantity: 1 })).status, 200);
        assert.equal(attempts, 2);
        assert.equal(rows.get(key('user-a', 1))!.quantity, 1);
    });
}

test('persistent transaction conflicts return 409 after three attempts', async () => {
    let attempts = 0;
    stub(prisma, '$transaction', async () => {
        attempts++;
        throw new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '6.12' });
    });
    assert.equal((await request('POST', '/api/cart/items', { productId: 1, quantity: 1 })).status, 409);
    assert.equal(attempts, 3);
});

test('database errors return a generic 500 response', async () => {
    mock.method(console, 'error', () => {});
    stub(prisma.cartItem, 'findMany', async () => { throw new Error('internal database details'); });
    const result = await request('GET', '/api/cart');
    assert.equal(result.status, 500);
    assert.equal(result.body.message, 'Cart operation failed');
});
