import type { RequestHandler } from 'express';
import { prisma } from '@/db/db.js';

const updateStock: RequestHandler = async (req, res, next) => {
    const { name, stock } = req.body;
    try {
        const updatedProduct = await prisma.products.update({
            where: { name }, data: { stock }, select: { name: true, stock: true },
        });
        res.status(200).json({ status: 'Successful', message: 'Product stock updated', updatedProduct });
    } catch (error) {
        next(error);
    }
};

export default updateStock;
