import type { RequestHandler } from 'express';
import { prisma } from '@/db/db.js';

const updatePrice: RequestHandler = async (req, res, next) => {
    const { name, price } = req.body;
    try {
        const updatedProduct = await prisma.products.update({
            where: { name }, data: { price }, select: { name: true, price: true },
        });
        res.status(200).json({ status: 'Successful', message: 'Product price updated', updatedProduct });
    } catch (error) {
        next(error);
    }
};

export default updatePrice;
