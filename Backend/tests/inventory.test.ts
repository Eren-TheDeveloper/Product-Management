import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Prisma } from '@prisma/client';
import { inventorySummary } from '../src/services/inventorySummary.js';

test('an empty catalog has zero totals and no healthy-stock claim', () => {
    assert.deepEqual(inventorySummary([]), {
        productCount: 0,
        totalStock: 0,
        inventoryValue: '0.00',
        healthyCount: 0,
        lowCount: 0,
        outCount: 0,
        criticalCount: 0,
        lowStockThreshold: 10,
    });
});

test('summary counts stock boundaries and calculates exact decimal inventory value', () => {
    const rows = [0, 1, 10, 11].map((stock) => ({
        stock,
        price: new Prisma.Decimal('2.50'),
    }));
    assert.deepEqual(inventorySummary(rows), {
        productCount: 4,
        totalStock: 22,
        inventoryValue: '55.00',
        healthyCount: 1,
        lowCount: 2,
        outCount: 1,
        criticalCount: 3,
        lowStockThreshold: 10,
    });
    assert.equal(
        inventorySummary([
            { stock: 3, price: new Prisma.Decimal('0.10') },
            { stock: 2, price: new Prisma.Decimal('0.20') },
        ]).inventoryValue,
        '0.70',
    );
});

test('large inventory totals retain cents beyond JavaScript number precision', () => {
    assert.equal(
        inventorySummary([
            { stock: 2147483647, price: new Prisma.Decimal('9999999999.99') },
            { stock: 3, price: new Prisma.Decimal('0.10') },
        ]).inventoryValue,
        '21474836469978525163.83',
    );
});

const { prisma } = await import('../src/db/db.js');
const { default: getAllProducts } =
    await import('../src/controller/products/getAllProducts.js');
const original = prisma.products.findMany;
const app = express();
app.get('/products', getAllProducts);
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => {
    prisma.products.findMany = original;
});
after(async () => {
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.$disconnect();
});

test('product rows and dashboard totals are returned from the same database read', async () => {
    let calls = 0;
    prisma.products.findMany = (async (args: any) => {
        calls++;
        assert.equal(args.select.barcode, true);
        return [
            { id: 1, name: 'A', price: new Prisma.Decimal('10.10'), stock: 12, barcode: 'barcode-a' },
            { id: 2, name: 'B', price: new Prisma.Decimal('0.20'), stock: 3 },
        ];
    }) as typeof original;
    const response = await fetch(`${baseUrl}/products`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(calls, 1);
    assert.equal(body.allProducts.length, 2);
    assert.equal(body.allProducts[0].barcode, 'barcode-a');
    assert.equal(body.summary.productCount, 2);
    assert.equal(body.summary.totalStock, 15);
    assert.equal(body.summary.inventoryValue, '121.80');
    assert.equal(body.summary.lowCount, 1);
});
