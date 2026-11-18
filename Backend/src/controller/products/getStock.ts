import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@/db/db.js'

const getStock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const products = await prisma.products.findMany({
            select: {
                id: true,
                name: true,
                stock: true
            }
        })

        return res
        .status(200)
        .json({
            status: 'Successful',
            products
        })

    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed to get stock', error);

        return res
        .status(400)
        .json({
            status: 'Failed',
            message: 'Failed to get stock'
        });
    }
}

export default getStock;