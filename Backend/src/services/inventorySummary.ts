import { Prisma } from '@prisma/client';

const LOW_STOCK = 10;
const Decimal = Prisma.Decimal.clone({ precision: 40 });

export function inventorySummary(
    products: ReadonlyArray<{ price: Prisma.Decimal; stock: number }>,
) {
    let totalStock = 0;
    let inventoryValue = new Decimal(0);
    let lowCount = 0;
    let outCount = 0;
    for (const product of products) {
        totalStock += product.stock;
        inventoryValue = inventoryValue.add(
            new Decimal(product.price).mul(product.stock),
        );
        if (product.stock === 0) outCount++;
        else if (product.stock <= LOW_STOCK) lowCount++;
    }
    return {
        productCount: products.length,
        totalStock,
        inventoryValue: inventoryValue.toFixed(2),
        healthyCount: products.length - lowCount - outCount,
        lowCount,
        outCount,
        criticalCount: lowCount + outCount,
        lowStockThreshold: LOW_STOCK,
    };
}
