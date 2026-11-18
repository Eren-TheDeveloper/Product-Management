import { useState } from "react";
import { LOW_STOCK } from "../types";
import type { InventorySummary, Product, StockFilter } from "../types";
import { money, number } from "../lib/format";
import { Icon, ProductArt } from "./Icon";

export function Dashboard({
  products,
  summary,
  onFilter,
}: {
  products: Product[];
  summary: InventorySummary;
  onFilter: (filter: StockFilter) => void;
}) {
  const [metric, setMetric] = useState("stock");
  const {
    totalStock,
    inventoryValue: totalValue,
    healthyCount: available,
    lowCount: low,
    outCount: out,
  } = summary;
  const healthyPercent = summary.productCount
    ? (available / summary.productCount) * 100
    : 0;
  const lowPercent = summary.productCount
    ? (low / summary.productCount) * 100
    : 0;
  const items = [...products]
    .sort((a, b) =>
      metric === "stock"
        ? b.stock - a.stock
        : Number(b.price) * b.stock - Number(a.price) * a.stock,
    )
    .slice(0, 7);
  const values = items.map((product) =>
    metric === "stock" ? product.stock : Number(product.price) * product.stock,
  );
  const maxValue = Math.max(...values, 1);
  const max = metric === "stock" ? Math.ceil(maxValue / 4) * 4 : maxValue;
  const stats = [
    {
      label: "Toplam ürün",
      value: number(summary.productCount),
      unit: "farklı ürün",
      icon: "box" as const,
      note: "Kataloğunuzdaki tüm ürünler",
      color: "green",
    },
    {
      label: "Toplam stok",
      value: number(totalStock),
      unit: "adet",
      icon: "layers" as const,
      note: "Envanterinizdeki ürün adedi",
      color: "blue",
    },
    {
      label: "Envanter değeri",
      value: money(totalValue),
      unit: "",
      icon: "wallet" as const,
      note: "Güncel fiyat × stok miktarı",
      color: "purple",
    },
    {
      label: "Kritik stok",
      value: number(summary.criticalCount),
      unit: "ürün",
      icon: "alert" as const,
      note: `${out} tükenen · ${low} düşük stoklu ürün`,
      color: "amber",
    },
  ];
  return (
    <>
      <div className="stats-grid">
        {stats.map((stat) => (
          <article className={`stat-card ${stat.color}`} key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className="stat-icon">
                <Icon name={stat.icon} size={19} />
              </span>
            </div>
            <div
              className={`stat-value ${stat.icon === "wallet" ? "currency-value" : ""}`}
            >
              {stat.value}
              <span>{stat.unit}</span>
            </div>
            <div className="stat-note">
              <span className="tiny-dot" />
              {stat.note}
            </div>
          </article>
        ))}
      </div>

      <div className="charts-grid">
        <section className="panel distribution-panel">
          <div className="panel-heading">
            <div>
              <h2>Envanter dağılımı</h2>
              <p>Envanterinizde en çok yer alan ürünler</p>
            </div>
            <label className="select-wrap">
              <span className="sr-only">Grafik ölçütü</span>
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
              >
                <option value="stock">Stok miktarı</option>
                <option value="value">Envanter değeri</option>
              </select>
              <Icon name="down" size={14} />
            </label>
          </div>
          {items.length ? (
            <div
              className="bar-chart"
              role="img"
              aria-label={items
                .map(
                  (item, i) =>
                    `${item.name}: ${metric === "stock" ? `${values[i]} adet` : money(values[i])}`,
                )
                .join(", ")}
            >
              <div className="chart-y-axis">
                {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                  <span key={ratio}>
                    {metric === "stock"
                      ? number(Math.ceil(max * ratio))
                      : new Intl.NumberFormat("tr-TR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(max * ratio)}
                  </span>
                ))}
              </div>
              <div className="chart-plot">
                <div className="chart-gridlines">
                  {[0, 1, 2, 3, 4].map((line) => (
                    <span key={line} />
                  ))}
                </div>
                <div className="chart-bars">
                  {items.map((product, index) => (
                    <div className="bar-group" key={product.id}>
                      <div className="bar-track">
                        <div
                          className={`chart-bar bar-${index}`}
                          style={{
                            height: `${(values[index] / max) * 100}%`,
                            minHeight: values[index] === 0 ? 0 : undefined,
                          }}
                          tabIndex={0}
                        >
                          <span className="bar-tooltip">
                            {product.name}
                            <strong>
                              {metric === "stock"
                                ? `${number(product.stock)} adet`
                                : money(values[index])}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <span className="bar-label" title={product.name}>
                        {product.name.split(" ").slice(0, 2).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="chart-empty">
              <Icon name="chart" size={36} />
              <p>Ürün eklediğinizde dağılım burada görünecek.</p>
            </div>
          )}
          <div className="chart-footer">
            <span>
              <i />
              {metric === "stock"
                ? "Mevcut stok miktarı"
                : "Güncel envanter değeri"}
            </span>
            <span>İlk {items.length} ürün</span>
          </div>
        </section>

        <section className="panel health-panel">
          <div className="panel-heading">
            <div>
              <h2>Stok sağlığı</h2>
              <p>Envanterinizin güncel durumu</p>
            </div>
            <span className="muted-icon">
              <Icon name="layers" size={18} />
            </span>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: products.length
                  ? `conic-gradient(var(--accent) 0% ${healthyPercent}%, var(--amber) ${healthyPercent}% ${healthyPercent + lowPercent}%, var(--red) ${healthyPercent + lowPercent}% 100%)`
                  : "var(--border)",
              }}
            >
              <div className="donut-hole">
                <span>
                  {Math.round(healthyPercent)}
                  <small>%</small>
                </span>
                <p>Sağlıklı stok</p>
              </div>
            </div>
            <span className="donut-orbit orbit-one" />
            <span className="donut-orbit orbit-two" />
          </div>
          <div className="health-legend">
            {(
              [
                { label: "Stokta", count: available, key: "available" },
                { label: "Düşük stok", count: low, key: "low" },
                { label: "Tükendi", count: out, key: "out" },
              ] as const
            ).map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => onFilter(item.key)}
              >
                <span>
                  <i className={`legend-dot ${item.key}`} />
                  {item.label}
                </span>
                <strong>
                  {item.count}
                  <Icon name="chevron" size={13} />
                </strong>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function StockAttention({
  products,
  onEdit,
  onView,
}: {
  products: Product[];
  onEdit: (product: Product) => void;
  onView: () => void;
}) {
  const critical = products
    .filter((product) => product.stock <= LOW_STOCK)
    .sort((a, b) => a.stock - b.stock);
  return (
    <section className="attention-banner">
      <span className={`attention-icon ${critical.length ? "" : "healthy"}`}>
        <Icon name={critical.length ? "alert" : "check"} size={21} />
      </span>
      <div>
        <strong>
          {products.length === 0
            ? "Henüz stok verisi yok"
            : critical.length
              ? `${critical.length} ürününüz ilgi bekliyor`
              : "Stoklarınız iyi durumda"}
        </strong>
        <p>
          {products.length === 0
            ? "Ürün eklediğinizde stok durumu burada gösterilecek."
            : critical.length
              ? "Stoklar tükenmeden harekete geçin, iş akışınız kesintiye uğramasın."
              : "Tüm ürünleriniz yeterli stok seviyesinde. Her şey yolunda."}
        </p>
      </div>
      {critical.length > 0 && (
        <>
          <div className="attention-products">
            {critical.slice(0, 3).map((product) => (
              <button
                key={product.id}
                title={`${product.name} · ${product.stock} adet`}
                onClick={() => onEdit(product)}
              >
                <ProductArt name={product.name} id={product.id} />
              </button>
            ))}
          </div>
          <button className="text-button amber-text" onClick={onView}>
            Stokları incele
            <Icon name="arrow" size={17} />
          </button>
        </>
      )}
    </section>
  );
}
