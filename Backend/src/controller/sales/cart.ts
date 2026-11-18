import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { Request, RequestHandler } from 'express';
import * as cartService from '@/services/cartService.js';
import { CartError } from '@/services/cartService.js';
import type { Cart } from '@/types/saleType.js';

function positiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
        throw new CartError(400, `${field} must be a positive integer no greater than 2147483647`);
    }
    return value;
}

function pathProductId(req: Request): number {
    const value = req.params.productId;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        throw new CartError(400, 'productId must be a positive integer');
    }
    return positiveInteger(Number(value), 'productId');
}

function cartHandler(action: (req: Request, userId: string) => Promise<Cart>): RequestHandler {
    return async (req, res) => {
        if (!req.user) {
            res.status(401).json({ status: 'Failed', message: 'Authorization failed' });
            return;
        }

        try {
            const cart = await action(req, req.user.id);
            res.status(200).json({ status: 'Successful', cart });
        } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
            if (error instanceof CartError) {
                res.status(error.statusCode).json({ status: 'Failed', message: error.message });
                return;
            }
            console.error('Cart operation failed', error);
            res.status(500).json({ status: 'Failed', message: 'Cart operation failed' });
        }
    };
}

export const getCart = cartHandler((_req, userId) => cartService.getCart(userId));

export const addCart = cartHandler((req, userId) => {
    // Keep the original /sale/addcart request's `id` field working.
    const { productId, id, quantity, barcode } = req.body ?? {};
    if (productId !== undefined && id !== undefined && productId !== id) {
        throw new CartError(400, 'id and productId must refer to the same product');
    }
    const selectedId = positiveInteger(productId ?? id, 'productId');
    const amount = positiveInteger(quantity, 'quantity');
    if (barcode !== undefined && (typeof barcode !== 'string' || barcode.trim().length === 0)) {
        throw new CartError(400, 'barcode must be a non-empty string');
    }
    return cartService.saveCartItem(userId, selectedId, amount, 'add', barcode);
});

export const updateCartItem = cartHandler((req, userId) => cartService.saveCartItem(
    userId,
    pathProductId(req),
    positiveInteger(req.body?.quantity, 'quantity'),
    'set',
));

export const removeCartItem = cartHandler((req, userId) =>
    cartService.removeCartItem(userId, pathProductId(req)));

export const clearCart = cartHandler((_req, userId) => cartService.clearCart(userId));
