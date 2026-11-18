import { Router } from 'express';
import addProducts from '@/controller/products/addProduct.js'
import getProducts from '@/controller/products/getProducts.js';
import getStock from '@/controller/products/getStock.js';
import updateStock from '@/controller/products/updateStock.js';
import updatePrice from '@/controller/products/updatePrice.js';
import authenticate from '@/middleware/auth.js';
import requireAdmin from '@/middleware/requireAdmin.js'
import deleteProduct from '@/controller/products/deleteProduct.js';
import getAllProducts from '@/controller/products/getAllProducts.js';
import { validateProduct } from '@/middleware/productValidation.js';

const router = Router();

router.use(authenticate);

router.post('/', requireAdmin, validateProduct(['name', 'price', 'stock']), addProducts);

router.get('/', getAllProducts);

router.get('/stock', getStock);

router.get('/:id', getProducts);

router.patch('/update/stock', requireAdmin, validateProduct(['name', 'stock']), updateStock);

router.patch('/update/price', requireAdmin, validateProduct(['name', 'price']), updatePrice);

router.delete('/', requireAdmin, validateProduct(['name']), deleteProduct);

export default router;
