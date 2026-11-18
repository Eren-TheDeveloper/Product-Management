import type { Page } from "@playwright/test";
import { fixtureProducts, inventoryResponse, makeFixtureCart } from "./catalog";

// HTTP fixtures are only installed by tests. Application code has no fallback data.
export async function mockWorkspace(page: Page) {
  let products = fixtureProducts.map((product) => ({ ...product }));
  let quantities: Record<number, number> = {};
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "stockly.session",
      JSON.stringify({
        user: {
          id: "fixture-admin",
          name: "Test Yönetici",
          email: "admin@example.com",
          role: "admin",
        },
        accessToken: "fixture-access",
        refreshToken: "fixture-refresh",
      }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON();
    if (path === "/api/auth/logout")
      return route.fulfill({ json: { status: "Successful" } });
    if (request.headers().authorization !== "Bearer fixture-access")
      return route.fulfill({ status: 401, json: { status: "Failed" } });
    if (path === "/api/products") {
      if (method === "POST")
        products.push({
          id: Math.max(0, ...products.map((product) => product.id)) + 1,
          name: body.name,
          price: Number(body.price).toFixed(2),
          stock: body.stock,
        });
      if (method === "DELETE") {
        const removed = products.find((product) => product.name === body.name);
        if (removed) delete quantities[removed.id];
        products = products.filter((product) => product.name !== body.name);
      }
      return route.fulfill({
        json: { status: "Successful", ...inventoryResponse(products) },
      });
    }
    if (path.startsWith("/api/products/update/")) {
      products = products.map((product) =>
        product.name !== body.name
          ? product
          : path.endsWith("/stock")
            ? { ...product, stock: body.stock }
            : { ...product, price: Number(body.price).toFixed(2) },
      );
      return route.fulfill({ json: { status: "Successful" } });
    }
    if (path.startsWith("/api/cart")) {
      const id =
        method === "POST" ? body.productId : Number(path.split("/").at(-1));
      if (method === "POST" || method === "PATCH") {
        const product = products.find((product) => product.id === id);
        const quantity =
          method === "POST"
            ? (quantities[id] || 0) + body.quantity
            : body.quantity;
        if (!product || quantity > product.stock)
          return route.fulfill({ status: 409, json: { status: "Failed" } });
        quantities[id] = quantity;
      }
      if (method === "DELETE") {
        if (path === "/api/cart") quantities = {};
        else delete quantities[id];
      }
      return route.fulfill({
        json: {
          status: "Successful",
          cart: makeFixtureCart(products, quantities),
        },
      });
    }
    return route.fulfill({ status: 404, json: { status: "Failed" } });
  });
}
