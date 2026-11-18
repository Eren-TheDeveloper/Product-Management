import { Prisma } from '@prisma/client';
import { prisma } from '@/db/db.js';
import type { Cart } from '@/types/saleType.js';

export class CartError extends Error {
    constructor(public readonly statusCode: number, message: string) {
        super(message);
    }
}

async function readCart(db: Prisma.TransactionClient, userId: string): Promise<Cart> {
    const rows = await db.cartItem.findMany({
        where: { userId },
        include: { product: true },
        orderBy: [{ createdAt: 'asc' }, { productId: 'asc' }],
    });

    let totalPrice = new Prisma.Decimal(0);
    let totalQuantity = 0;
    const items = rows.map(({ product, productId, quantity }) => {
        const subtotal = product.price.mul(quantity);
        totalPrice = totalPrice.add(subtotal);
        totalQuantity += quantity;

        return {
            productId,
            name: product.name,
            barcode: product.barcode,
            stock: product.stock,
            price: product.price.toFixed(2),
            quantity,
            subtotal: subtotal.toFixed(2),
        };
    });

    return { items, totalQuantity, totalPrice: totalPrice.toFixed(2) };
}

// Retry conflicting writes so simultaneous additions cannot overwrite each other.
async function writeCart(action: (db: Prisma.TransactionClient) => Promise<Cart>): Promise<Cart> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await prisma.$transaction(action, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
        } catch (error) {
            const conflict = error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === 'P2034' || error.code === 'P2002');
            if (!conflict) throw error;
            if (attempt === 2) {
                throw new CartError(409, 'Cart changed concurrently; please retry');
            }
        }
    }
    throw new CartError(409, 'Cart changed concurrently; please retry');
}

export const getCart = (userId: string) => readCart(prisma, userId);

export function saveCartItem(
    userId: string,
    productId: number,
    quantity: number,
    mode: 'add' | 'set',
    barcode?: string,
) {
    return writeCart(async (db) => {
        const product = await db.products.findUnique({ where: { id: productId } });
        if (!product || (barcode !== undefined && barcode !== product.barcode)) {
            throw new CartError(404, 'Product not found');
        }

        const where = { userId_productId: { userId, productId } };
        const existing = await db.cartItem.findUnique({ where });
        if (mode === 'set' && !existing) {
            throw new CartError(404, 'Product not found in cart');
        }

        const nextQuantity = mode === 'add' ? (existing?.quantity ?? 0) + quantity : quantity;
        if (nextQuantity > product.stock) {
            throw new CartError(409, `Insufficient stock; available quantity: ${product.stock}`);
        }

        await db.cartItem.upsert({
            where,
            create: { userId, productId, quantity: nextQuantity },
            update: { quantity: nextQuantity },
        });
        return readCart(db, userId);
    });
}

export function removeCartItem(userId: string, productId: number) {
    return writeCart(async (db) => {
        const result = await db.cartItem.deleteMany({ where: { userId, productId } });
        if (result.count === 0) throw new CartError(404, 'Product not found in cart');
        return readCart(db, userId);
    });
}

export function clearCart(userId: string) {
    return writeCart(async (db) => {
        await db.cartItem.deleteMany({ where: { userId } });
        return readCart(db, userId);
    });
}
