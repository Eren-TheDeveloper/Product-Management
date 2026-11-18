import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockWorkspace } from "./fixtures/backend";
import { inventoryResponse } from "./fixtures/catalog";

const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("link", { name, exact: false });

test("signed-out visitors see login without products, metrics or product API requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await page.goto("/#products");
  await expect(
    page.getByRole("heading", { name: "Ürünlerinizi görmek için giriş yapın" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.locator(".stat-value")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Yeni ürün", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Demo", { exact: false })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("empty API catalog remains empty and never substitutes sample products", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "stockly.session",
      JSON.stringify({
        user: {
          id: "empty-admin",
          name: "Test Yönetici",
          email: "admin@example.com",
          role: "admin",
        },
        accessToken: "empty-access",
        refreshToken: "empty-refresh",
      }),
    ),
  );
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/products"
          ? inventoryResponse([])
          : { cart: { items: [], totalQuantity: 0, totalPrice: "0.00" } },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "İlk ürününüzü ekleyin" }),
  ).toBeVisible();
  await expect(page.locator(".stat-value").first()).toHaveText("0farklı ürün");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "İlk ürününüzü ekleyin" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test.describe("authenticated workspace", () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspace(page);
  });
  test("dashboard calculates inventory metrics and filters stock health", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Her şey kontrolünüz altında." }),
    ).toBeVisible();
    await expect(page.locator(".stat-value").nth(0)).toHaveText(
      "12farklı ürün",
    );
    await expect(page.locator(".stat-value").nth(1)).toHaveText("269adet");
    await expect(page.locator(".stat-value").nth(3)).toHaveText("5ürün");
    await expect(page.locator(".donut-hole")).toContainText("58%");
    await page
      .getByRole("combobox", { name: "Grafik ölçütü" })
      .selectOption("value");
    await expect(page.locator(".chart-footer")).toContainText(
      "Güncel envanter değeri",
    );
    await page
      .locator(".health-legend")
      .getByRole("button", { name: "Tükendi" })
      .click();
    await expect(page).toHaveURL(/#stock$/);
    await expect(page.locator("tbody tr")).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("catalog supports search, stock filters, pagination and card view", async ({
    page,
  }) => {
    await page.goto("/#products");
    await page
      .getByRole("textbox", { name: "Ürün adı veya numarası ara" })
      .fill("kulaklık");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText(
      "Studio Kablosuz Kulaklık",
    );
    await page.getByRole("button", { name: "Aramayı temizle" }).click();
    await page
      .getByRole("button", { name: "Düşük stok", exact: false })
      .click();
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Tüm ürünler", exact: false })
      .click();
    await page.getByRole("button", { name: "Sonraki sayfa" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await page.getByRole("button", { name: "Kart görünümü" }).click();
    await expect(page.locator(".product-card")).toHaveCount(4);
    await page.getByRole("button", { name: "Önceki sayfa" }).click();
    await expect(page.locator(".product-card")).toHaveCount(8);
  });

  test("API product creation, stock and price editing, deletion and CSV export work", async ({
    page,
  }) => {
    await page.goto("/#products");
    await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Ürün adı", exact: true })
      .fill("Tarayıcı Test Ürünü");
    await dialog
      .getByRole("spinbutton", { name: "Birim fiyat" })
      .fill("123.45");
    await dialog.getByRole("spinbutton", { name: "Stok miktarı" }).fill("4");
    await dialog.getByRole("button", { name: "Ürünü ekle" }).click();
    await expect(dialog).not.toBeVisible();
    const row = page
      .getByRole("row")
      .filter({ hasText: "Tarayıcı Test Ürünü" });
    await expect(row).toContainText("Düşük stok");
    await row
      .getByRole("button", { name: "Tarayıcı Test Ürünü düzenle" })
      .click();
    await dialog.getByRole("spinbutton", { name: "Birim fiyat" }).fill("200");
    await dialog.getByRole("spinbutton", { name: "Stok miktarı" }).fill("20");
    await dialog.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await expect(row).toContainText("200,00");
    await expect(row).toContainText("Stokta");
    await row.getByRole("button", { name: "Tarayıcı Test Ürünü sil" }).click();
    await dialog
      .getByRole("button", { name: "Ürünü sil", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await nav(page, "Genel bakış").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(
      "stockly-envanter.csv",
    );
  });

  test("cart uses current product prices, adjusts quantity and removes items", async ({
    page,
  }) => {
    await page.goto("/#products");
    await page
      .getByRole("textbox", { name: "Ürün adı veya numarası ara" })
      .fill("Studio");
    await page
      .getByRole("button", { name: "Studio Kablosuz Kulaklık sepete ekle" })
      .click();
    await nav(page, "Sepetim").click();
    await expect(page.locator(".summary-total")).toContainText("2.499,00");
    await page
      .getByRole("button", { name: "Studio Kablosuz Kulaklık miktarını artır" })
      .click();
    await expect(page.locator(".summary-total")).toContainText("4.998,00");
    await expect(page.locator(".quantity-control")).toHaveText("2");
    await page
      .getByRole("button", { name: "Studio Kablosuz Kulaklık sepetten çıkar" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sepetiniz henüz boş" }),
    ).toBeVisible();
  });

  test("mobile layout stays within viewport and navigation and dialogs are accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: "test-results/mobile-overview.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Menüyü aç" }).click();
    await nav(page, "Ürünler").click();
    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
    await page.getByRole("button", { name: "Yeni ürün", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => element.getBoundingClientRect().right),
    ).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Yeni ürün", exact: true }),
    ).toBeFocused();
  });
});

test("API login and admin mutations use the backend contracts and refresh token logout", async ({
  page,
}) => {
  const calls: {
    path: string;
    method: string;
    authorization?: string;
    data: unknown;
  }[] = [];
  let product = {
    id: 23,
    name: "Gerçek API Ürünü",
    price: "100.00",
    stock: 15,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const data = request.postDataJSON();
    calls.push({
      path,
      method,
      data,
      authorization: request.headers().authorization,
    });
    const json =
      path === "/api/auth/login"
        ? {
            user: {
              id: "admin-id",
              name: "Test Yönetici",
              email: "admin@example.com",
              role: "admin",
            },
            accessToken: "access-test",
            refreshToken: "refresh-test",
          }
        : path === "/api/products" && method === "GET"
          ? inventoryResponse([product])
          : path === "/api/cart"
            ? { cart: { items: [], totalQuantity: 0, totalPrice: "0.00" } }
            : { status: "Successful" };
    if (path.endsWith("/update/stock"))
      product = { ...product, stock: data.stock };
    if (path.endsWith("/update/price"))
      product = { ...product, price: data.price.toFixed(2) };
    await route.fulfill({ status: 200, json });
  });
  await page.goto("/#products");
  await page.getByRole("button", { name: "Hesabıma giriş yap" }).click();
  await page
    .getByRole("textbox", { name: "E-posta adresi" })
    .fill("admin@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Çalışma alanına giriş yap" }).click();
  await expect(
    page.getByRole("button", { name: "Canlı veriler" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Gerçek API Ürünü düzenle" }).click();
  await page.getByRole("spinbutton", { name: "Stok miktarı" }).fill("22");
  await page.getByRole("spinbutton", { name: "Birim fiyat" }).fill("150.50");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.locator("tbody")).toContainText("150,50");
  expect(
    calls.find((call) => call.path.endsWith("/update/stock")),
  ).toMatchObject({
    method: "PATCH",
    authorization: "Bearer access-test",
    data: { name: product.name, stock: 22 },
  });
  expect(
    calls.find((call) => call.path.endsWith("/update/price")),
  ).toMatchObject({
    method: "PATCH",
    authorization: "Bearer access-test",
    data: { name: product.name, price: 150.5 },
  });
  await page.getByRole("button", { name: "Oturumu kapat" }).click();
  await expect(
    page.getByRole("button", { name: "Giriş yap", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.locator(".stat-value")).toHaveCount(0);
  expect(
    calls.find((call) => call.path.endsWith("/logout"))?.authorization,
  ).toBe("Bearer refresh-test");
  expect(
    await page.evaluate(() => sessionStorage.getItem("stockly.session")),
  ).toBeNull();
});

test("standard user cannot access admin actions and expired sessions show recovery", async ({
  page,
}) => {
  let expired = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login")
      return route.fulfill({
        json: {
          user: {
            id: "user-id",
            name: "Test Kullanıcı",
            email: "user@example.com",
            role: "user",
          },
          accessToken: "user-access",
          refreshToken: "user-refresh",
        },
      });
    if (expired)
      return route.fulfill({
        status: 401,
        json: { message: "Invalid or expired access token" },
      });
    return route.fulfill({
      json:
        path === "/api/products"
          ? inventoryResponse([
              { id: 1, name: "Standart Ürün", price: "49.90", stock: 3 },
            ])
          : { cart: { items: [], totalQuantity: 0, totalPrice: "0.00" } },
    });
  });
  await page.goto("/#products");
  await page.getByRole("button", { name: "Hesabıma giriş yap" }).click();
  await page
    .getByRole("textbox", { name: "E-posta adresi" })
    .fill("user@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Çalışma alanına giriş yap" }).click();
  await expect(page.locator("tbody")).toContainText("Standart Ürün");
  await expect(
    page.getByRole("button", { name: "Yeni ürün", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Standart Ürün düzenle" }),
  ).toHaveCount(0);
  expired = true;
  await page.getByRole("button", { name: "Canlı veriler" }).click();
  await expect(page.getByRole("alert")).toContainText("Oturumunuz geçersiz");
  await expect(
    page.getByRole("heading", { name: "Verilerinizi şu anda gösteremiyoruz" }),
  ).toBeVisible();
  await expect(page.locator("tbody")).toHaveCount(0);
});

test("API cart enforces stock, sends absolute quantities and uses server totals", async ({
  page,
}) => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let quantity = 0;
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "stockly.session",
      JSON.stringify({
        user: {
          id: "cart-user",
          name: "Sepet Kullanıcısı",
          email: "cart@example.com",
          role: "user",
        },
        accessToken: "cart-access",
        refreshToken: "cart-refresh",
      }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({ path, method, body });
    expect(request.headers().authorization).toBe("Bearer cart-access");
    if (path === "/api/products")
      return route.fulfill({
        json: inventoryResponse([
          { id: 9, name: "Ondalık Fiyatlı Ürün", price: "0.10", stock: 2 },
        ]),
      });
    if (method === "POST") {
      expect(body).toEqual({ productId: 9, quantity: 1 });
      if (quantity === 2)
        return route.fulfill({
          status: 409,
          json: { message: "Insufficient stock" },
        });
      quantity++;
    }
    if (method === "PATCH") {
      expect(body).toEqual({ quantity: 1 });
      quantity = body.quantity;
    }
    if (method === "DELETE") quantity = 0;
    return route.fulfill({
      json: {
        cart: {
          items: quantity
            ? [
                {
                  productId: 9,
                  name: "Ondalık Fiyatlı Ürün",
                  barcode: "barcode-nine",
                  price: "0.10",
                  stock: 2,
                  quantity,
                  subtotal: quantity === 2 ? "0.20" : "0.10",
                },
              ]
            : [],
          totalQuantity: quantity,
          totalPrice: quantity === 2 ? "0.20" : quantity ? "0.10" : "0.00",
        },
      },
    });
  });
  await page.goto("/#products");
  const add = page.getByRole("button", {
    name: "Ondalık Fiyatlı Ürün sepete ekle",
  });
  await add.click();
  await expect(nav(page, "Sepetim")).toContainText("1");
  await add.click();
  await expect(nav(page, "Sepetim")).toContainText("2");
  await add.click();
  await expect(page.getByRole("alert")).toContainText("Stok yetersiz");
  await nav(page, "Sepetim").click();
  await expect(page.locator(".summary-total")).toContainText("0,20");
  await expect(
    page.getByRole("button", { name: "Ondalık Fiyatlı Ürün miktarını artır" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Ondalık Fiyatlı Ürün miktarını azalt" })
    .click();
  await expect(page.locator(".summary-total")).toContainText("0,10");
  await page
    .getByRole("button", { name: "Sepeti temizle", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sepeti temizle", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sepetiniz henüz boş" }),
  ).toBeVisible();
  expect(
    calls.some((call) => call.path === "/api/cart" && call.method === "DELETE"),
  ).toBe(true);
});

test("partial product updates refresh data and show the failure inside the dialog", async ({
  page,
}) => {
  let stock = 12;
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "stockly.session",
      JSON.stringify({
        user: {
          id: "admin",
          name: "Yönetici",
          email: "admin@example.com",
          role: "admin",
        },
        accessToken: "admin-access",
        refreshToken: "admin-refresh",
      }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/update/price"))
      return route.fulfill({
        status: 500,
        json: { message: "Failed on update price" },
      });
    if (path.endsWith("/update/stock")) stock = request.postDataJSON().stock;
    return route.fulfill({
      json:
        path === "/api/products"
          ? inventoryResponse([
              {
                id: 1,
                name: "Kısmi Güncelleme Ürünü",
                price: "100.00",
                stock,
              },
            ])
          : path === "/api/cart"
            ? { cart: { items: [], totalQuantity: 0, totalPrice: "0.00" } }
            : { status: "Successful" },
    });
  });
  await page.goto("/#products");
  await page
    .getByRole("button", { name: "Kısmi Güncelleme Ürünü düzenle" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Stok miktarı" }).fill("24");
  await dialog.getByRole("spinbutton", { name: "Birim fiyat" }).fill("200");
  await dialog.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Değişikliğin bir bölümü kaydedildi",
  );
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.locator("tbody")).toContainText("24");
  await expect(page.locator("tbody")).toContainText("100,00");
});

test("unavailable backend is explained without leaving the login dialog", async ({
  page,
}) => {
  await page.route("**/api/auth/login", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Hesabıma giriş yap" }).click();
  await page
    .getByRole("textbox", { name: "E-posta adresi" })
    .fill("user@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Çalışma alanına giriş yap" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Sunucuya ulaşılamadı",
  );
});
