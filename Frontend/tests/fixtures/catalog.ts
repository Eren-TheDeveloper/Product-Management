import type { Cart, Product } from "../../src/types";

export function inventoryResponse(products: Product[]) {
  const outCount = products.filter((product) => product.stock === 0).length;
  const lowCount = products.filter(
    (product) => product.stock > 0 && product.stock <= 10,
  ).length;
  const cents = products.reduce(
    (sum, product) =>
      sum +
      BigInt(Math.round(Number(product.price) * 100)) * BigInt(product.stock),
    0n,
  );
  return {
    allProducts: products,
    summary: {
      productCount: products.length,
      totalStock: products.reduce((sum, product) => sum + product.stock, 0),
      inventoryValue: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
      healthyCount: products.length - outCount - lowCount,
      lowCount,
      outCount,
      criticalCount: lowCount + outCount,
      lowStockThreshold: 10,
    },
  };
}

export const fixtureProducts: Product[] = [
  { id: 1, name: "Studio Kablosuz Kulaklık", price: "2499.00", stock: 42 },
  { id: 2, name: "Mekanik Klavye K87", price: "1899.00", stock: 18 },
  { id: 3, name: "Minimal Masa Lambası", price: "849.00", stock: 7 },
  { id: 4, name: "UltraView 27” Monitör", price: "7499.00", stock: 24 },
  { id: 5, name: "USB-C Çoklayıcı 7-in-1", price: "1199.00", stock: 0 },
  { id: 6, name: "Ergonomik Kablosuz Mouse", price: "649.00", stock: 65 },
  { id: 7, name: "Taşınabilir Bluetooth Hoparlör", price: "1599.00", stock: 9 },
  { id: 8, name: "Alüminyum Laptop Standı", price: "799.00", stock: 32 },
  { id: 9, name: "4K Web Kamera", price: "2199.00", stock: 0 },
  { id: 10, name: "MagSafe Şarj Standı", price: "1299.00", stock: 12 },
  { id: 11, name: "Keçe Masa Düzenleyici", price: "349.00", stock: 4 },
  { id: 12, name: "Örgü USB-C Kablo", price: "249.00", stock: 56 },
];

export function makeFixtureCart(
  products: Product[],
  quantities: Record<number, number>,
): Cart {
  let totalCents = 0;
  let totalQuantity = 0;
  const items = products
    .filter((product) => quantities[product.id] > 0)
    .map((product) => {
      const quantity = quantities[product.id];
      const cents = Math.round(Number(product.price) * 100);
      totalCents += cents * quantity;
      totalQuantity += quantity;
      return {
        productId: product.id,
        name: product.name,
        barcode: `TEST-${product.id}`,
        price: (cents / 100).toFixed(2),
        stock: product.stock,
        quantity,
        subtotal: ((cents * quantity) / 100).toFixed(2),
      };
    });
  return { items, totalQuantity, totalPrice: (totalCents / 100).toFixed(2) };
}
