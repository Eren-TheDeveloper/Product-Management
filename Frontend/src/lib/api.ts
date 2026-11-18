import type {
  Cart,
  Inventory,
  InventorySummary,
  Product,
  ProductInput,
  Session,
} from "../types";

const baseUrl = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const errorMessages: Record<number, string> = {
  400: "Bilgileri kontrol edip yeniden deneyin.",
  401: "Oturumunuz geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.",
  403: "Bu işlem için yönetici yetkisi gerekiyor.",
  404: "İstenen kayıt bulunamadı. Listeyi yenileyip tekrar deneyin.",
  409: "Stok yetersiz, kayıt zaten mevcut veya veriler değişti. Bilgileri yenileyip tekrar deneyin.",
  429: "Çok fazla istek gönderildi. Bir dakika sonra tekrar deneyin.",
  503: "Veritabanına geçici olarak ulaşılamıyor. Lütfen kısa bir süre sonra tekrar deneyin.",
};

async function request<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new ApiError(
      0,
      "Sunucuya ulaşılamadı. Backend bağlantısını kontrol edip tekrar deneyin.",
    );
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessages[response.status] ||
        "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      502,
      "Sunucudan beklenmeyen bir yanıt alındı. API adresini kontrol edin.",
    );
  }
}

export const api = {
  async auth(
    mode: "login" | "register",
    input: { name?: string; email: string; password: string },
  ) {
    try {
      return await request<Session>(`/auth/${mode}`, undefined, "POST", input);
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 404].includes(error.status)) {
        throw new ApiError(
          error.status,
          mode === "login"
            ? "E-posta adresi veya şifre hatalı. Bilgilerinizi kontrol edin."
            : "Hesap oluşturulamadı. E-posta kullanımda olabilir; bilgilerinizi kontrol edin.",
        );
      }
      throw error;
    }
  },
  logout: (refreshToken: string) =>
    request("/auth/logout", refreshToken, "POST"),
  async products(token: string, signal?: AbortSignal): Promise<Inventory> {
    const response = await request<{
      allProducts: Product[];
      summary: InventorySummary;
    }>("/products", token, "GET", undefined, signal);
    const { allProducts: products, summary } = response;
    const validInteger = (value: unknown): value is number =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (
      !Array.isArray(products) ||
      !products.every(
        (product) =>
          product &&
          validInteger(product.id) &&
          product.id > 0 &&
          typeof product.name === "string" &&
          validInteger(product.stock) &&
          ["number", "string"].includes(typeof product.price) &&
          String(product.price).trim() !== "" &&
          Number.isFinite(Number(product.price)) &&
          Number(product.price) >= 0,
      ) ||
      !summary ||
      ![
        "productCount",
        "totalStock",
        "healthyCount",
        "lowCount",
        "outCount",
        "criticalCount",
        "lowStockThreshold",
      ].every((key) => validInteger(summary[key as keyof InventorySummary])) ||
      typeof summary.inventoryValue !== "string" ||
      !/^\d+\.\d{2}$/.test(summary.inventoryValue) ||
      summary.productCount !== products.length ||
      summary.healthyCount + summary.lowCount + summary.outCount !==
        summary.productCount ||
      summary.criticalCount !== summary.lowCount + summary.outCount
    ) {
      throw new ApiError(
        502,
        "Sunucudan geçersiz ürün veya envanter özeti alındı. Backend’i güncelleyip verileri yeniden yükleyin.",
      );
    }
    return { products, summary };
  },
  addProduct: (token: string, input: ProductInput) =>
    request("/products", token, "POST", input),
  stock: (token: string, name: string, stock: number) =>
    request("/products/update/stock", token, "PATCH", { name, stock }),
  price: (token: string, name: string, price: number) =>
    request("/products/update/price", token, "PATCH", { name, price }),
  deleteProduct: (token: string, name: string) =>
    request("/products", token, "DELETE", { name }),
  async cart(token: string, signal?: AbortSignal) {
    return (
      await request<{ cart: Cart }>("/cart", token, "GET", undefined, signal)
    ).cart;
  },
  async addToCart(token: string, productId: number) {
    return (
      await request<{ cart: Cart }>("/cart/items", token, "POST", {
        productId,
        quantity: 1,
      })
    ).cart;
  },
  async setQuantity(token: string, productId: number, quantity: number) {
    return (
      await request<{ cart: Cart }>(
        `/cart/items/${productId}`,
        token,
        "PATCH",
        { quantity },
      )
    ).cart;
  },
  async removeItem(token: string, productId: number) {
    return (
      await request<{ cart: Cart }>(`/cart/items/${productId}`, token, "DELETE")
    ).cart;
  },
  async clearCart(token: string) {
    return (await request<{ cart: Cart }>("/cart", token, "DELETE")).cart;
  },
};
