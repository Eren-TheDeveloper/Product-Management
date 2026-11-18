interface CartItem {
    productId: number;
    name: string;
    price: string;
    barcode: string;
    quantity: number;
    stock: number;
    subtotal: string;
}

interface Cart {
    items: CartItem[];
    totalQuantity: number;
    totalPrice: string;
}

export type { CartItem, Cart };
