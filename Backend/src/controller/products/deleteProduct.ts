import type { RequestHandler } from 'express';
import { prisma } from '@/db/db.js';

const deleteProduct: RequestHandler = async (req, res, next) => {
    try {
        await prisma.products.delete({ where: { name: req.body.name } });
        res.status(200).json({ status: 'Successful', message: 'Product deleted' });
    } catch (error) {
        next(error);
    }
};

export default deleteProduct;
