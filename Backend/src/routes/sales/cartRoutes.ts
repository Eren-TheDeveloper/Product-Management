import { Router } from 'express';
import authenticate from '@/middleware/auth.js';
import { addCart, clearCart, getCart, removeCartItem, updateCartItem } from '@/controller/sales/cart.js';

const router = Router();

router.use(authenticate);
router.get('/', getCart);
router.post('/items', addCart);
router.patch('/items/:productId', updateCartItem);
router.delete('/items/:productId', removeCartItem);
router.delete('/', clearCart);

export default router;
