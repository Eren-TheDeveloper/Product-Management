import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { money, stockStatus } from "../lib/format";
import type { Product, ProductInput, Session } from "../types";
import { Modal } from "./Modal";
import { Icon, ProductArt } from "./Icon";

export function AuthDialog({
  onClose,
  onConnect,
}: {
  onClose: () => void;
  onConnect: (session: Session) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const session = await api.auth(mode, {
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
        ...(mode === "register"
          ? { name: String(data.get("name")).trim() }
          : {}),
      });
      onConnect(session);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş yapılamadı.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title={
        mode === "login"
          ? "Çalışma alanınıza hoş geldiniz"
          : "Birlikte daha düzenli başlayalım"
      }
      description={
        mode === "login"
          ? "Hesabınıza giriş yapın, envanterinize bağlanın."
          : "Ürünleri incelemek ve sepet oluşturmak için hesap açın."
      }
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="auth-brand">
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        <span>
          stockly<span className="brand-dot">.</span>
        </span>
      </div>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "active" : ""}
          disabled={pending}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Giriş yap
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          disabled={pending}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Hesap oluştur
        </button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === "register" && (
          <label>
            Ad soyad
            <input
              name="name"
              placeholder="Adınız ve soyadınız"
              autoComplete="name"
              required
              maxLength={100}
              pattern=".*\S.*"
              disabled={pending}
            />
          </label>
        )}
        <label>
          E-posta adresi
          <div className="input-with-icon">
            <Icon name="mail" size={17} />
            <input
              name="email"
              type="email"
              placeholder="siz@sirketiniz.com"
              autoComplete="email"
              required
              maxLength={50}
              disabled={pending}
            />
          </div>
        </label>
        <label>
          Şifre
          <div className="input-with-icon">
            <Icon name="lock" size={17} />
            <input
              name="password"
              type={visible ? "text" : "password"}
              placeholder="En az 8 karakter"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              required
              disabled={pending}
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setVisible(!visible)}
              aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={visible}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
        </label>
        {error && (
          <p className="inline-error" role="alert">
            <Icon name="alert" size={17} />
            {error}
          </p>
        )}
        <button
          className="button primary full-width"
          type="submit"
          disabled={pending}
        >
          {pending ? (
            <>
              <span className="spinner" />
              Bağlanıyor...
            </>
          ) : (
            <>
              {mode === "login" ? "Çalışma alanına giriş yap" : "Hesap oluştur"}
              <Icon name="arrow" size={17} />
            </>
          )}
        </button>
        <p className="form-note">
          <Icon name="lock" size={13} />
          {mode === "register"
            ? "Yeni hesaplar standart kullanıcı yetkisiyle oluşturulur."
            : "Oturumunuz bu tarayıcı sekmesinde saklanır."}
        </p>
      </form>
    </Modal>
  );
}

export function ProductDialog({
  product,
  canManage,
  busy,
  actionError,
  onClose,
  onSave,
  onCart,
}: {
  product: Product | null;
  canManage: boolean;
  busy: boolean;
  actionError: string;
  onClose: () => void;
  onSave: (input: ProductInput, product?: Product) => Promise<boolean>;
  onCart: (product: Product) => void;
}) {
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const price = Number(data.get("price"));
    const stock = Number(data.get("stock"));
    if (
      !name ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setError("Lütfen tüm alanları doğru şekilde doldurun.");
      return;
    }
    setError("");
    setAttempted(true);
    if (await onSave({ name, price, stock }, product || undefined)) onClose();
  };
  return (
    <Modal
      title={
        product
          ? canManage
            ? "Ürünü düzenle"
            : "Ürün detayları"
          : "Yeni ürün ekle"
      }
      description={
        product
          ? "Ürün bilgilerini ve güncel stok durumunu inceleyin."
          : "Kataloğunuza yeni bir ürün ekleyin."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {product && (
        <div className="product-dialog-preview">
          <ProductArt name={product.name} id={product.id} />
          <div>
            <strong>{product.name}</strong>
            <span>PRD-{String(product.id).padStart(4, "0")}</span>
          </div>
          <span
            className={`status-badge ${stockStatus(product.stock).className}`}
          >
            <i />
            {stockStatus(product.stock).label}
          </span>
        </div>
      )}
      {canManage ? (
        <form className="form" onSubmit={submit}>
          <label>
            Ürün adı
            <input
              name="name"
              defaultValue={product?.name || ""}
              placeholder="Örn. Kablosuz Kulaklık"
              required
              maxLength={150}
              readOnly={!!product}
              disabled={busy}
            />
            {product && (
              <small>
                Ürün adı sabittir. Fiyatı ve stok miktarını
                güncelleyebilirsiniz.
              </small>
            )}
          </label>
          <div className="form-row">
            <label>
              Birim fiyat (₺)
              <input
                type="number"
                name="price"
                defaultValue={product?.price}
                min="0"
                max="9999999999.99"
                step="0.01"
                placeholder="0,00"
                required
                disabled={busy}
              />
            </label>
            <label>
              Stok miktarı
              <input
                type="number"
                name="stock"
                defaultValue={product?.stock}
                min="0"
                max="2147483647"
                step="1"
                placeholder="0"
                required
                disabled={busy}
              />
            </label>
          </div>
          {(error || (attempted && actionError)) && (
            <p className="inline-error" role="alert">
              {error || actionError}
            </p>
          )}
          {!product && (
            <div className="form-info">
              <Icon name="info" size={17} />
              <span>Ürün numarası ve barkod otomatik oluşturulur.</span>
            </div>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Vazgeç
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (
                <span className="spinner" />
              ) : (
                <Icon name={product ? "check" : "plus"} size={17} />
              )}
              {busy
                ? "Kaydediliyor..."
                : product
                  ? "Değişiklikleri kaydet"
                  : "Ürünü ekle"}
            </button>
          </div>
        </form>
      ) : (
        product && (
          <div className="product-detail">
            <div>
              <span>Birim fiyat</span>
              <strong>{money(product.price)}</strong>
            </div>
            <div>
              <span>Stok miktarı</span>
              <strong>{product.stock} adet</strong>
            </div>
            {product.barcode && (
              <div>
                <span>Barkod</span>
                <code>{product.barcode}</code>
              </div>
            )}
            <button
              className="button primary full-width"
              disabled={busy || product.stock === 0}
              onClick={() => onCart(product)}
            >
              <Icon name="cart" size={17} />
              Sepete ekle
            </button>
          </div>
        )
      )}
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  text,
  confirmText,
  busy,
  actionError,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmText: string;
  busy: boolean;
  actionError: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [attempted, setAttempted] = useState(false);
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="confirm-icon">
        <Icon name="trash" size={26} />
      </div>
      <p className="confirm-text">{text}</p>
      {attempted && actionError && (
        <p className="inline-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose} disabled={busy}>
          Vazgeç
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setAttempted(true);
            if (await onConfirm()) onClose();
          }}
        >
          {busy && <span className="spinner" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
