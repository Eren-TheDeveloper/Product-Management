export interface Product {
  id: number;
  name: string;
  price: string | number;
  stock: number;
  barcode?: string;
  createdAt?: string;
}

export interface CartItem {
  productId: number;
  name: string;
  barcode: string;
  price: string;
  stock: number;
  quantity: number;
  subtotal: string;
}

export interface InventorySummary {
  productCount: number;
  totalStock: number;
  inventoryValue: string;
  healthyCount: number;
  lowCount: number;
  outCount: number;
  criticalCount: number;
  lowStockThreshold: number;
}

export interface Inventory {
  products: Product[];
  summary: InventorySummary;
}

export interface Cart {
  items: CartItem[];
  totalQuantity: number;
  totalPrice: string;
}

export interface Session {
  user: { id: string; name: string; email: string; role: "admin" | "user" };
  accessToken: string;
  refreshToken: string;
}

export type Page = "overview" | "products" | "stock" | "cart";
export type StockFilter = "all" | "available" | "low" | "out";
export type ProductInput = { name: string; price: number; stock: number };
export const LOW_STOCK = 10;
