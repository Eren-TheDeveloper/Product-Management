import { useState } from "react";
import { LOW_STOCK } from "../types";
import type { Product, StockFilter } from "../types";
import { money, number, stockStatus } from "../lib/format";
import { Icon, ProductArt } from "./Icon";

export function ProductList({
  products,
  filter,
  onFilter,
  query,
  onQuery,
  busy,
  canManage,
  overview = false,
  stockPage = false,
  onAdd,
  onEdit,
  onDelete,
  onCart,
  onViewAll,
}: {
  products: Product[];
  filter: StockFilter;
  onFilter: (filter: StockFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  busy: boolean;
  canManage: boolean;
  overview?: boolean;
  stockPage?: boolean;
  onAdd: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onCart: (product: Product) => void;
  onViewAll: () => void;
}) {
  const [sort, setSort] = useState(stockPage ? "stock" : "newest");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const pageSize = overview ? 5 : 8;
  const counts = {
    all: products.length,
    available: products.filter((product) => product.stock > LOW_STOCK).length,
    low: products.filter(
      (product) => product.stock > 0 && product.stock <= LOW_STOCK,
    ).length,
    out: products.filter((product) => product.stock === 0).length,
  };
  const filtered = products
    .filter((product) => {
      const matches =
        product.name
          .toLocaleLowerCase("tr-TR")
          .includes(query.toLocaleLowerCase("tr-TR")) ||
        String(product.id).includes(query.trim()) ||
        product.barcode?.includes(query.trim());
      return (
        matches &&
        (filter === "all" ||
          (filter === "available"
            ? product.stock > LOW_STOCK
            : filter === "low"
              ? product.stock > 0 && product.stock <= LOW_STOCK
              : product.stock === 0))
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "tr")
        : sort === "price"
          ? Number(b.price) - Number(a.price)
          : sort === "stock"
            ? a.stock - b.stock
            : b.id - a.id,
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <section className="panel products-panel">
      <div className="panel-heading products-heading">
        <div>
          <h2>
            {stockPage
              ? "Stok envanteri"
              : overview
                ? "Ürünlerinize hızlı bir bakış"
                : "Ürün kataloğu"}
            <span className="count-badge">{products.length}</span>
          </h2>
          <p>
            {stockPage
              ? "Stok seviyelerini izleyin ve ihtiyaçları zamanında karşılayın."
              : "Tüm ürünleriniz, düzenli ve her zaman elinizin altında."}
          </p>
        </div>
        {overview ? (
          <button className="text-button" onClick={onViewAll}>
            Tüm ürünler
            <Icon name="arrow" size={16} />
          </button>
        ) : (
          <div className="view-switch" aria-label="Görünüm">
            <button
              className={layout === "list" ? "active" : ""}
              onClick={() => setLayout("list")}
              aria-label="Liste görünümü"
              aria-pressed={layout === "list"}
            >
              <Icon name="list" size={17} />
            </button>
            <button
              className={layout === "grid" ? "active" : ""}
              onClick={() => setLayout("grid")}
              aria-label="Kart görünümü"
              aria-pressed={layout === "grid"}
            >
              <Icon name="grid" size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="product-toolbar">
        <div className="filter-tabs" aria-label="Stok durumuna göre filtrele">
          {(
            [
              { key: "all", label: "Tüm ürünler" },
              { key: "available", label: "Stokta" },
              { key: "low", label: "Düşük stok" },
              { key: "out", label: "Tükendi" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              className={filter === tab.key ? "active" : ""}
              onClick={() => {
                onFilter(tab.key);
                setPage(1);
              }}
              aria-pressed={filter === tab.key}
            >
              {tab.key === "low" && <i className="tab-dot" />}
              {tab.label}
              <span>{counts[tab.key]}</span>
            </button>
          ))}
        </div>
        <div className="table-controls">
          <label className="table-search">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => {
                onQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Ürün ara..."
              aria-label="Ürün adı veya numarası ara"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQuery("")}
                aria-label="Aramayı temizle"
              >
                <Icon name="close" size={13} />
              </button>
            )}
          </label>
          <label className="sort-select">
            <span className="sr-only">Ürünleri sırala</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="newest">En yeni</option>
              <option value="name">İsim A–Z</option>
              <option value="price">Fiyat ↓</option>
              <option value="stock">Stok ↑</option>
            </select>
            <Icon name="down" size={13} />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name={products.length ? "search" : "box"} size={30} />
          </span>
          <h3>
            {products.length
              ? "Aradığınız ürün bulunamadı"
              : "İlk ürününüzü ekleyin"}
          </h3>
          <p>
            {products.length
              ? "Farklı bir arama yapın veya stok filtresini değiştirin."
              : "Ürünlerinizi ekleyerek envanterinizi tek bir yerden yönetmeye başlayın."}
          </p>
          {products.length ? (
            <button
              className="button secondary"
              onClick={() => {
                onFilter("all");
                onQuery("");
              }}
            >
              Filtreleri temizle
            </button>
          ) : (
            canManage && (
              <button className="button primary" onClick={onAdd}>
                <Icon name="plus" size={16} />
                Ürün ekle
              </button>
            )
          )}
        </div>
      ) : layout === "grid" && !overview ? (
        <div className="product-grid">
          {visible.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-art">
                <ProductArt name={product.name} id={product.id} large />
                <span
                  className={`status-badge ${stockStatus(product.stock).className}`}
                >
                  <i />
                  {stockStatus(product.stock).label}
                </span>
              </div>
              <div className="product-card-info">
                <span className="product-sku">
                  PRD-{String(product.id).padStart(4, "0")}
                </span>
                <h3>{product.name}</h3>
                <div className="product-card-meta">
                  <strong>{money(product.price)}</strong>
                  <span>{number(product.stock)} adet</span>
                </div>
                <div className="product-card-actions">
                  <button
                    className="button secondary"
                    onClick={() => onCart(product)}
                    disabled={busy || product.stock === 0}
                  >
                    <Icon name="cart" size={16} />
                    Sepete ekle
                  </button>
                  {canManage && (
                    <button
                      className="icon-button"
                      aria-label={`${product.name} düzenle`}
                      disabled={busy}
                      onClick={() => onEdit(product)}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>Ürün adı</th>
                <th>Ürün kodu</th>
                <th>Birim fiyat</th>
                <th>Stok miktarı</th>
                <th>Durum</th>
                <th className="actions-column">
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id}>
                  <td>
                    <button
                      className="product-name-button"
                      onClick={() => onEdit(product)}
                    >
                      <ProductArt name={product.name} id={product.id} />
                      <span>
                        {product.name}
                        <small>
                          Ürün #{String(product.id).padStart(4, "0")}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="product-sku">
                      PRD-{String(product.id).padStart(4, "0")}
                    </span>
                  </td>
                  <td className="price-cell">{money(product.price)}</td>
                  <td>
                    <div className="stock-cell">
                      <span>
                        {number(product.stock)}
                        <small>adet</small>
                      </span>
                      <div
                        className={`stock-meter ${stockStatus(product.stock).className}`}
                      >
                        <span
                          style={{
                            width: `${Math.min((product.stock / Math.max(...products.map((item) => item.stock), 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${stockStatus(product.stock).className}`}
                    >
                      <i />
                      {stockStatus(product.stock).label}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => onCart(product)}
                        disabled={busy || product.stock === 0}
                        aria-label={`${product.name} sepete ekle`}
                        title="Sepete ekle"
                      >
                        <Icon name="cart" size={17} />
                      </button>
                      {canManage && (
                        <>
                          <button
                            className="icon-button"
                            onClick={() => onEdit(product)}
                            disabled={busy}
                            aria-label={`${product.name} düzenle`}
                            title="Düzenle"
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            className="icon-button danger-hover"
                            onClick={() => onDelete(product)}
                            disabled={busy}
                            aria-label={`${product.name} sil`}
                            title="Sil"
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span>
          {filtered.length
            ? `${number(filtered.length)} ürünün ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} arası gösteriliyor`
            : "0 ürün gösteriliyor"}
        </span>
        <div className="pagination">
          <button
            className="icon-button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Önceki sayfa"
          >
            <Icon
              name="chevron"
              size={15}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
          <span>
            <strong>{currentPage}</strong> / {totalPages}
          </span>
          <button
            className="icon-button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Sonraki sayfa"
          >
            <Icon name="chevron" size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
