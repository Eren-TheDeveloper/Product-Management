import { Router } from 'express';
import authenticate from '@/middleware/auth.js';
import { addCart } from '@/controller/sales/cart.js';

const router = Router();
router.post('/addcart', authenticate, addCart);

export default router;
