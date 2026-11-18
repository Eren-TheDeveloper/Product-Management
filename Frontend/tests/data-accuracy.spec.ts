import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Product, Session } from "../src/types";
import { inventoryResponse } from "./fixtures/catalog";

const admin: Session = {
  user: {
    id: "admin-a",
    name: "Kullanıcı A",
    email: "a@example.com",
    role: "admin",
  },
  accessToken: "access-a",
  refreshToken: "refresh-a",
};
const user: Session = {
  user: {
    id: "user-b",
    name: "Kullanıcı B",
    email: "b@example.com",
    role: "user",
  },
  accessToken: "access-b",
  refreshToken: "refresh-b",
};
const emptyCart = { items: [], totalQuantity: 0, totalPrice: "0.00" };
const rows: Product[] = [
  { id: 1, name: "Ortak Ürün A", price: "999.00", stock: 40 },
  { id: 2, name: "Ortak Ürün B", price: "339.00", stock: 25 },
];
const session = (page: Page) =>
  page.addInitScript(
    (value) => sessionStorage.setItem("stockly.session", JSON.stringify(value)),
    admin,
  );

test("overview uses the database summary and the same product snapshot", async ({
  page,
}) => {
  await session(page);
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: inventoryResponse(rows) }),
  );
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: emptyCart } }),
  );
  await page.goto("/");
  await expect(page.locator(".stat-value").nth(0)).toHaveText("2farklı ürün");
  await expect(page.locator(".stat-value").nth(1)).toHaveText("65adet");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("₺48.435,00");
  await expect(page.locator(".stat-value").nth(3)).toHaveText("0ürün");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator(".page-footer")).toContainText("Son güncelleme:");
});

test("large server Decimal totals are displayed without losing cents", async ({
  page,
}) => {
  await session(page);
  await page.route("**/api/products", (route) =>
    route.fulfill({
      json: inventoryResponse([
        { id: 1, name: "A", price: "9999999999.99", stock: 2147483647 },
        { id: 2, name: "B", price: "0.10", stock: 3 },
      ]),
    }),
  );
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: emptyCart } }),
  );
  await page.goto("/");
  await expect(page.locator(".currency-value")).toHaveText(
    "₺21.474.836.469.978.525.163,83",
  );
});

test("missing or inconsistent overview data is rejected rather than shown as valid totals", async ({
  page,
}) => {
  await session(page);
  let invalid: unknown = { allProducts: rows };
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: invalid }),
  );
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: emptyCart } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "geçersiz ürün veya envanter özeti",
  );
  await expect(page.locator(".stat-value")).toHaveCount(0);
  invalid = {
    ...inventoryResponse(rows),
    summary: { ...inventoryResponse(rows).summary, productCount: 99 },
  };
  await page
    .getByRole("button", { name: "Yeniden yükle", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "geçersiz ürün veya envanter özeti",
  );
  await expect(page.locator(".stat-value")).toHaveCount(0);
});

test("focus and periodic refresh update externally changed inventory", async ({
  page,
}) => {
  await page.clock.install();
  await session(page);
  let products = rows;
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: inventoryResponse(products) }),
  );
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: emptyCart } }),
  );
  await page.goto("/");
  await expect(page.locator(".stat-value").nth(1)).toHaveText("65adet");
  products = rows.map((product) => ({ ...product, stock: 1 }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".stat-value").nth(1)).toHaveText("2adet");
  await expect(page.locator(".currency-value")).toHaveText("₺1.338,00");
  products = rows.map((product) => ({ ...product, stock: 0 }));
  await page.clock.fastForward(30_000);
  await expect(page.locator(".stat-value").nth(1)).toHaveText("0adet");
  await expect(page.locator(".currency-value")).toHaveText("₺0,00");
});

test("a delayed old background response cannot overwrite a newer manual refresh", async ({
  page,
}) => {
  await session(page);
  let holdNext = false;
  let held = false;
  let serveNew = false;
  let release!: () => void;
  let completed!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handled = new Promise<void>((resolve) => {
    completed = resolve;
  });
  await page.route("**/api/products", async (route) => {
    if (holdNext) {
      holdNext = false;
      held = true;
      await delayed;
      try {
        await route.fulfill({
          json: inventoryResponse(
            rows.map((product) => ({ ...product, stock: 99 })),
          ),
        });
      } finally {
        completed();
      }
    } else
      await route.fulfill({
        json: inventoryResponse(
          serveNew ? rows.map((product) => ({ ...product, stock: 1 })) : rows,
        ),
      });
  });
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: emptyCart } }),
  );
  await page.goto("/");
  await expect(page.locator(".stat-value").nth(1)).toHaveText("65adet");
  holdNext = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => held).toBe(true);
  serveNew = true;
  await page
    .getByRole("button", { name: "Canlı veriler", exact: true })
    .click();
  await expect(page.locator(".stat-value").nth(1)).toHaveText("2adet");
  release();
  await handled;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.locator(".stat-value").nth(1)).toHaveText("2adet");
  await expect(page.locator(".currency-value")).toHaveText("₺1.338,00");
});

test("account changes retain the shared catalog but never reuse another user cart or delayed logout", async ({
  page,
}) => {
  await session(page);
  let holdNextCart = false;
  let cartHeld = false;
  let releaseCart!: () => void;
  let releaseLogout!: () => void;
  const delayedCart = new Promise<void>((resolve) => {
    releaseCart = resolve;
  });
  const delayedLogout = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: inventoryResponse(rows) }),
  );
  await page.route("**/api/cart", async (route) => {
    const old = route.request().headers().authorization === "Bearer access-a";
    if (old && holdNextCart) {
      holdNextCart = false;
      cartHeld = true;
      await delayedCart;
    }
    const quantity = old ? 2 : 1;
    await route.fulfill({
      json: {
        cart: {
          items: [
            {
              productId: 1,
              name: "Ortak Ürün A",
              barcode: "barcode-1",
              price: "999.00",
              stock: 40,
              quantity,
              subtotal: old ? "1998.00" : "999.00",
            },
          ],
          totalQuantity: quantity,
          totalPrice: old ? "1998.00" : "999.00",
        },
      },
    });
  });
  await page.route("**/api/auth/logout", async (route) => {
    await delayedLogout;
    await route.fulfill({ json: { status: "Successful" } });
  });
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: user }),
  );
  await page.goto("/#cart");
  await expect(page.locator(".summary-total")).toContainText("1.998,00");
  holdNextCart = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => cartHeld).toBe(true);
  await page
    .getByRole("button", { name: "Oturumu kapat", exact: true })
    .click();
  await expect(page.locator(".cart-item")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Hesabıma giriş yap", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "E-posta adresi" })
    .fill("b@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Çalışma alanına giriş yap", exact: true })
    .click();
  await expect(page.locator(".summary-total")).toContainText("999,00");
  await expect(page.locator(".quantity-control")).toHaveText("1");
  releaseCart();
  releaseLogout();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Genel bakış", exact: true })
    .click();
  await expect(page.locator(".stat-value").first()).toHaveText("2farklı ürün");
  await expect(page.locator(".stat-value").nth(1)).toHaveText("65adet");
  await expect(page.locator(".sidebar-user")).toContainText("Kullanıcı B");
});
