import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { Request, Response } from 'express';
import { prisma } from '@/db/db.js';
import { inventorySummary } from '@/services/inventorySummary.js';

const getAllProducts = async (req: Request, res: Response) => {
    try {
        const allProducts = await prisma.products.findMany({
            select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                barcode: true,
            }
        });

        return res
        .status(200)
        .json({
            status: 'Successful',
            message: 'All Products Successfuly Taken',
            allProducts,
            summary: inventorySummary(allProducts),
        });

    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed to taken all products');

        return res
        .status(500)
        .json({
            status: 'Failed',
            message: 'Failed to taken all products',
        });
    }
}

export default getAllProducts;
