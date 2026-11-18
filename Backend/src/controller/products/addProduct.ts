import { prisma } from '@/db/db.js';
import type { RequestHandler } from 'express';

const addProducts: RequestHandler = async (req, res, next) => {
    const { name, price, stock } = req.body;
    try {
        // The unique constraint also handles concurrent creation requests.
        const product = await prisma.products.create({ data: { name, price, stock } });
        res.status(201).json({
            status: 'Successful', message: 'Product Created',
            data: { id: product.id, name: product.name, price: product.price, stock: product.stock },
        });
    } catch (error) {
        next(error);
    }
};

export default addProducts;
