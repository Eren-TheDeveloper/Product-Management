import { exportCsv, money, number } from "../lib/format";
import type { Cart } from "../types";
import { Icon, ProductArt } from "./Icon";

export function CartView({
  cart,
  busy,
  onQuantity,
  onClear,
  onBrowse,
}: {
  cart: Cart;
  busy: boolean;
  onQuantity: (productId: number, quantity: number) => void;
  onClear: () => void;
  onBrowse: () => void;
}) {
  const invalid = cart.items.some((item) => item.quantity > item.stock);
  return cart.items.length === 0 ? (
    <section className="panel empty-state cart-empty">
      <span className="empty-icon">
        <Icon name="cart" size={36} />
      </span>
      <span className="eyebrow">YENİ BİR SEPET, YENİ BİR BAŞLANGIÇ</span>
      <h2>Sepetiniz henüz boş</h2>
      <p>
        Kataloğunuzdan ürün ekleyin, miktarları düzenleyin
        <br />
        ve güncel toplamları tek bir yerde görün.
      </p>
      <button className="button primary" onClick={onBrowse}>
        Ürünleri keşfet
        <Icon name="arrow" size={17} />
      </button>
    </section>
  ) : (
    <div className="cart-layout">
      <section className="panel cart-items">
        <div className="panel-heading">
          <div>
            <h2>
              Sepetiniz<span className="count-badge">{cart.items.length}</span>
            </h2>
            <p>{number(cart.totalQuantity)} adet ürün, güncel fiyatlarla.</p>
          </div>
          <button
            className="text-button danger-text"
            onClick={onClear}
            disabled={busy}
          >
            <Icon name="trash" size={16} />
            Sepeti temizle
          </button>
        </div>
        {cart.items.map((item) => (
          <article className="cart-item" key={item.productId}>
            <ProductArt name={item.name} id={item.productId} />
            <div className="cart-product">
              <h3>{item.name}</h3>
              <p>
                {money(item.price)}
                <span> / adet</span>
              </p>
              {item.quantity > item.stock && (
                <small className="danger-text">
                  Stok yetersiz · Mevcut: {item.stock}
                </small>
              )}
            </div>
            <div className="quantity-control">
              <button
                onClick={() => onQuantity(item.productId, item.quantity - 1)}
                disabled={busy}
                aria-label={`${item.name} miktarını azalt`}
              >
                <Icon name="minus" size={14} />
              </button>
              <span>{item.quantity}</span>
              <button
                onClick={() => onQuantity(item.productId, item.quantity + 1)}
                disabled={busy || item.quantity >= item.stock}
                aria-label={`${item.name} miktarını artır`}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            <strong className="cart-subtotal">{money(item.subtotal)}</strong>
            <button
              className="icon-button danger-hover"
              onClick={() => onQuantity(item.productId, 0)}
              disabled={busy}
              aria-label={`${item.name} sepetten çıkar`}
            >
              <Icon name="close" size={17} />
            </button>
          </article>
        ))}
        <div className="cart-bottom">
          <button className="text-button" onClick={onBrowse}>
            <Icon name="plus" size={16} />
            Ürün eklemeye devam et
          </button>
          <span>
            <Icon name="lock" size={14} />
            Kullanıcıya özel sepet
          </span>
        </div>
      </section>
      <aside className="panel cart-summary">
        <h2>Sepet özeti</h2>
        <div>
          <span>Ürün çeşidi</span>
          <strong>{cart.items.length}</strong>
        </div>
        <div>
          <span>Toplam adet</span>
          <strong>{number(cart.totalQuantity)}</strong>
        </div>
        <div className="summary-total">
          <span>Toplam tutar</span>
          <strong>{money(cart.totalPrice)}</strong>
        </div>
        {invalid && (
          <p className="inline-error">
            <Icon name="alert" size={17} />
            Bazı ürünlerin stok miktarı değişti. Lütfen miktarları güncelleyin.
          </p>
        )}
        <button
          className="button primary"
          onClick={() =>
            exportCsv(
              [
                ["Ürün", "Birim fiyat (TRY)", "Adet", "Tutar (TRY)"],
                ...cart.items.map((item) => [
                  item.name,
                  item.price,
                  item.quantity,
                  item.subtotal,
                ]),
                ["TOPLAM", "", cart.totalQuantity, cart.totalPrice],
              ],
              "stockly-sepet.csv",
            )
          }
        >
          <Icon name="download" size={17} />
          Sepeti dışa aktar
        </button>
        <p className="cart-note">
          <Icon name="info" size={16} />
          Sepete eklemek stok ayırmaz veya azaltmaz. Tutarlar güncel ürün
          fiyatlarına göre hesaplanır.
        </p>
      </aside>
    </div>
  );
}
