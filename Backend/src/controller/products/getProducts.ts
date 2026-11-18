import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { Request, Response } from "express";
import { prisma } from '@/db/db.js'

const getProducts = async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    if(typeof req.params.id !== 'string' || !/^[1-9]\d*$/.test(req.params.id) || !Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
        return res
        .status(400)
        .json({
            status: 'Failed',
            message: 'Product ID must be valid positive integer'
        });
    }

    try {
        const product = await prisma.products.findUnique({
            where: { id }
        });

        if(!product) {
            return res
            .status(404)
            .json({
                status: 'Failed',
                message: 'Product not found'
            });
        }

        return res
        .status(200)
        .json({
            status: 'Successful',
            message: 'Product Found',
            product,
        });
    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed to get product', error);

        return res
        .status(500)
        .json({
            status: 'Failed',
            message: 'Failed to get product',
        });
    }
};

export default getProducts;
