import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';

// Match PostgreSQL INTEGER and the product's Decimal(12, 2) column.
export function validateProduct(fields: Array<'name' | 'price' | 'stock'>): RequestHandler {
    return (req, res, next) => {
        const body: unknown = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.status(400).json({ status: 'Failed', message: 'A product object is required' });
            return;
        }
        const input = body as Record<string, unknown>;
        const errors: Record<string, string> = {};
        if (fields.includes('name') && (
            typeof input.name !== 'string' || !input.name.trim() || input.name.length > 150
        )) errors.name = 'Product name must contain 1 to 150 characters';
        if (fields.includes('stock') && (
            typeof input.stock !== 'number' || !Number.isInteger(input.stock) ||
            input.stock < 0 || input.stock > 2_147_483_647
        )) errors.stock = 'Stock must be an integer between 0 and 2147483647';
        if (fields.includes('price')) {
            const price = input.price;
            let valid = false;
            if ((typeof price === 'number' && Number.isFinite(price)) ||
                (typeof price === 'string' && /^\d+(\.\d{1,2})?$/.test(price))) {
                const decimal = new Prisma.Decimal(price);
                valid = decimal.gte(0) && decimal.lte('9999999999.99') && decimal.decimalPlaces() <= 2;
            }
            if (!valid) errors.price = 'Price must be between 0 and 9999999999.99 with at most two decimal places';
        }
        if (Object.keys(errors).length) {
            res.status(400).json({ status: 'Failed', message: 'Invalid product data', errors });
            return;
        }
        if (fields.includes('name')) input.name = (input.name as string).trim();
        next();
    };
}
