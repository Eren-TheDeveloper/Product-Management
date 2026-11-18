import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Cart, Inventory, Product, ProductInput, Session } from "../types";

const SESSION_KEY = "stockly.session";
const emptyCart: Cart = { items: [], totalQuantity: 0, totalPrice: "0.00" };
const emptyProducts: Product[] = [];

function readSession(): Session | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) || "null",
    ) as Session | null;
    return typeof value?.accessToken === "string" &&
      typeof value.refreshToken === "string" &&
      typeof value.user?.id === "string" &&
      typeof value.user.name === "string" &&
      typeof value.user.email === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function useWorkspace() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(() => !!readSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    kind: "success" | "error";
  } | null>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const operation = useRef(0);
  const sequence = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const currentSession = useRef(session);
  const products = inventory?.products || emptyProducts;
  const summary = inventory?.summary || null;
  const canManage = session?.user.role === "admin";

  const notify = useCallback(
    (message: string, kind: "success" | "error" = "success") =>
      setToast({ message, kind }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(async (owner: Session, foreground = true) => {
    if (locked.current || owner !== currentSession.current) return;
    const ownerGeneration = generation.current;
    const request = ++sequence.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    if (foreground) setLoading(true);
    const current = () =>
      ownerGeneration === generation.current && request === sequence.current;
    try {
      const [nextInventory, nextCart] = await Promise.all([
        api.products(owner.accessToken, controller.signal),
        api.cart(owner.accessToken, controller.signal),
      ]);
      if (!current()) return;
      // Product rows and their summary come from one server snapshot.
      setInventory(nextInventory);
      setCart(nextCart);
      setLastUpdated(Date.now());
      setError("");
    } catch (cause) {
      if (controller.signal.aborted || !current()) return;
      controller.abort();
      setInventory(null);
      setCart(emptyCart);
      setLastUpdated(null);
      setError(cause instanceof Error ? cause.message : "Veriler yüklenemedi.");
    } finally {
      if (current()) setLoading(false);
      if (readController.current === controller) readController.current = null;
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    // Loading is initialized by readSession/reset. Start external I/O after setup,
    // and cancel it if StrictMode cleans up this effect before it runs.
    const timer = setTimeout(() => void refresh(session, false), 0);
    const invalidateRead = () => {
      sequence.current++;
      readController.current?.abort();
      readController.current = null;
    };
    return () => {
      clearTimeout(timer);
      invalidateRead();
    };
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    const revalidate = () => {
      if (
        document.visibilityState === "visible" &&
        !readController.current &&
        !locked.current
      )
        void refresh(session, false);
    };
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [session, refresh]);

  const reload = async () => {
    if (currentSession.current) await refresh(currentSession.current);
  };

  const reset = (next: Session | null) => {
    generation.current++;
    operation.current++;
    sequence.current++;
    readController.current?.abort();
    readController.current = null;
    currentSession.current = next;
    locked.current = false;
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* In-memory sessions still work. */
    }
    setInventory(null);
    setCart(emptyCart);
    setLastUpdated(null);
    setLoading(!!next);
    setBusy(false);
    setError("");
    setActionError("");
    setSession(next);
  };

  const connect = (next: Session) => {
    reset(next);
    notify(`Hoş geldiniz, ${next.user.name.split(" ")[0]}.`);
  };
  const disconnect = async () => {
    if (locked.current) return;
    const previous = currentSession.current;
    // Clear private data immediately; a slow logout response cannot restore it.
    reset(null);
    if (!previous) return;
    try {
      await api.logout(previous.refreshToken);
    } catch {
      if (!currentSession.current)
        notify(
          "Yerel oturum kapatıldı. Sunucudaki çıkış işlemi doğrulanamadı.",
          "error",
        );
      return;
    }
    if (!currentSession.current) notify("Oturum kapatıldı.");
  };

  const run = async (
    action: (token: string, current: () => boolean) => Promise<void>,
    message: string,
  ) => {
    if (locked.current) return false;
    const owner = currentSession.current;
    const ownerGeneration = generation.current;
    const id = ++operation.current;
    const current = () =>
      ownerGeneration === generation.current &&
      owner === currentSession.current;
    locked.current = true;
    setBusy(true);
    setActionError("");
    sequence.current++;
    readController.current?.abort();
    readController.current = null;
    setLoading(false);
    try {
      if (!owner) throw new Error("Bu işlem için hesabınıza giriş yapın.");
      await action(owner.accessToken, current);
      if (!current()) return false;
      notify(message);
      return true;
    } catch (cause) {
      if (!current()) return false;
      const message =
        cause instanceof Error ? cause.message : "İşlem tamamlanamadı.";
      setActionError(message);
      notify(message, "error");
      if (cause instanceof ApiError && cause.status === 401) {
        setInventory(null);
        setCart(emptyCart);
        setLastUpdated(null);
        setError(message);
      }
      return false;
    } finally {
      if (id === operation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };

  const refreshAfterWrite = async (token: string, current: () => boolean) => {
    try {
      const [nextInventory, nextCart] = await Promise.all([
        api.products(token),
        api.cart(token),
      ]);
      if (current()) {
        setInventory(nextInventory);
        setCart(nextCart);
        setLastUpdated(Date.now());
        setError("");
      }
    } catch {
      if (!current()) return;
      setInventory(null);
      setCart(emptyCart);
      setLastUpdated(null);
      setError(
        "Değişiklik kaydedildi, ancak güncel veriler alınamadı. Lütfen listeyi yenileyin.",
      );
      throw new Error(
        "Değişiklik kaydedildi. Güncel verileri görmek için listeyi yenileyin.",
      );
    }
  };

  const saveProduct = (input: ProductInput, existing?: Product) =>
    run(
      async (token, current) => {
        if (!canManage)
          throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
        if (
          !Number.isInteger(input.stock) ||
          input.stock < 0 ||
          input.stock > 2147483647 ||
          !Number.isFinite(input.price) ||
          input.price < 0 ||
          input.price > 9999999999.99 ||
          !input.name.trim()
        )
          throw new Error(
            "Geçerli bir ürün adı, fiyat ve tam sayı stok miktarı girin.",
          );
        if (
          products.some(
            (product) =>
              product.id !== existing?.id && product.name === input.name.trim(),
          )
        )
          throw new Error("Bu isimde bir ürün zaten var.");
        let changed = false;
        let failure: unknown;
        try {
          if (existing) {
            if (input.stock !== existing.stock) {
              await api.stock(token, existing.name, input.stock);
              changed = true;
            }
            if (!current()) return;
            if (input.price !== Number(existing.price)) {
              await api.price(token, existing.name, input.price);
              changed = true;
            }
          } else {
            await api.addProduct(token, { ...input, name: input.name.trim() });
            changed = true;
          }
        } catch (cause) {
          failure = cause;
        }
        if (!current()) return;
        if (changed || !failure) await refreshAfterWrite(token, current);
        if (!current()) return;
        if (failure) {
          if (failure instanceof ApiError && failure.status === 401) {
            setInventory(null);
            setCart(emptyCart);
            setLastUpdated(null);
            setError(failure.message);
          }
          if (!changed) throw failure;
          throw new Error(
            `Değişikliğin bir bölümü kaydedildi. ${failure instanceof Error ? failure.message : "Kaydetme başarısız."}`,
          );
        }
      },
      existing ? "Ürün bilgileri güncellendi." : "Yeni ürün kataloğa eklendi.",
    );

  const deleteProduct = (product: Product) =>
    run(async (token, current) => {
      if (!canManage)
        throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
      await api.deleteProduct(token, product.name);
      if (current()) await refreshAfterWrite(token, current);
    }, "Ürün silindi.");
  const addToCart = (product: Product) =>
    run(async (token, current) => {
      const nextCart = await api.addToCart(token, product.id);
      if (current()) setCart(nextCart);
    }, "Ürün sepete eklendi.");
  const setQuantity = (productId: number, quantity: number) =>
    run(
      async (token, current) => {
        const nextCart =
          quantity === 0
            ? await api.removeItem(token, productId)
            : await api.setQuantity(token, productId, quantity);
        if (current()) setCart(nextCart);
      },
      quantity === 0 ? "Ürün sepetten çıkarıldı." : "Sepet güncellendi.",
    );
  const clearCart = () =>
    run(async (token, current) => {
      const nextCart = await api.clearCart(token);
      if (current()) setCart(nextCart);
    }, "Sepet temizlendi.");

  return {
    session,
    canManage,
    products,
    summary,
    cart,
    lastUpdated,
    loading,
    busy,
    error,
    actionError,
    toast,
    notify,
    reload,
    connect,
    disconnect,
    saveProduct,
    deleteProduct,
    addToCart,
    setQuantity,
    clearCart,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
