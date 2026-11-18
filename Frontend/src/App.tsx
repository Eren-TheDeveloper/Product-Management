import { useEffect, useRef, useState } from "react";
import type { Page, Product, StockFilter } from "./types";
import { useWorkspace } from "./hooks/useWorkspace";
import { exportCsv } from "./lib/format";
import { Icon } from "./components/Icon";
import type { IconName } from "./components/Icon";
import { Dashboard, StockAttention } from "./components/Dashboard";
import { ProductList } from "./components/ProductList";
import { CartView } from "./components/CartView";
import { AuthDialog, ConfirmDialog, ProductDialog } from "./components/Dialogs";
import { Modal } from "./components/Modal";
import "./App.css";
import "./styles/components.css";
import "./styles/responsive.css";

const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: "overview", label: "Genel bakış", icon: "overview" },
  { id: "products", label: "Ürünler", icon: "box" },
  { id: "stock", label: "Stok takibi", icon: "layers" },
  { id: "cart", label: "Sepetim", icon: "cart" },
];
const pageText = {
  overview: {
    eyebrow: "BÜYÜK RESİM, KÜÇÜK DETAYLAR",
    title: "Her şey kontrolünüz altında.",
    description:
      "Ürünlerinizi, stoklarınızı ve işinizin bugününü bir arada görün.",
  },
  products: {
    eyebrow: "HER ÜRÜNÜN BİR YERİ VAR",
    title: "Kataloğunuz, bir adım ötede.",
    description: "Ürünlerinizi keşfedin, düzenleyin ve envanterinizi büyütün.",
  },
  stock: {
    eyebrow: "DOĞRU ZAMANDA, DOĞRU MİKTAR",
    title: "Stoklarınızdan haberdar olun.",
    description:
      "Kritik seviyeleri fark edin, stoklarınızı kolayca güncel tutun.",
  },
  cart: {
    eyebrow: "BİR ARADA DAHA KOLAY",
    title: "İhtiyacınız olan her şey burada.",
    description:
      "Ürünlerinizi bir araya getirin, miktarları ve toplamları yönetin.",
  },
};
function getPage(): Page {
  const hash = window.location.hash.replace("#", "");
  return navigation.some((item) => item.id === hash)
    ? (hash as Page)
    : "overview";
}

function App() {
  const workspace = useWorkspace();
  const {
    products,
    summary,
    cart,
    lastUpdated,
    session,
    canManage,
    busy,
    loading,
    error,
    toast,
  } = workspace;
  const signedOut = !session;
  const [page, setPage] = useState<Page>(getPage);
  const [filter, setFilter] = useState<StockFilter>("all");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState<
    "auth" | "product" | "delete" | "clear" | "help" | null
  >(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const date = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
  const userName = session?.user.name || "Misafir";
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");

  useEffect(() => {
    const onHash = () => {
      setPage(getPage());
      setFilter("all");
      setQuery("");
      setSidebarOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setSidebarOpen(false);
        mobileMenuRef.current?.focus();
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const navigate = (next: Page, nextFilter: StockFilter = "all") => {
    if (next !== page) window.history.pushState(null, "", `#${next}`);
    setPage(next);
    setFilter(nextFilter);
    setQuery("");
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const edit = (product: Product) => {
    setSelectedProduct(product);
    setDialog("product");
  };
  const add = () => {
    setSelectedProduct(null);
    setDialog("product");
  };
  const download = () => {
    exportCsv(
      [
        [
          "Ürün no",
          "Ürün adı",
          "Birim fiyat (TRY)",
          "Stok adedi",
          "Envanter değeri (TRY)",
        ],
        ...products.map((product) => [
          product.id,
          product.name,
          String(product.price),
          product.stock,
          (Number(product.price) * product.stock).toFixed(2),
        ]),
      ],
      "stockly-envanter.csv",
    );
    workspace.notify("Envanter raporunuz indirildi.");
  };

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        İçeriğe geç
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Menüyü kapat"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        aria-label="Ana menü"
      >
        <a
          className="brand"
          href="#overview"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
          aria-label="Stockly ana sayfa"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            stockly<span className="brand-dot">.</span>
          </span>
          <span className="brand-version">WORKSPACE</span>
        </a>
        <button
          className="workspace-selector"
          onClick={() => setDialog(signedOut ? "auth" : "help")}
        >
          <span className="workspace-symbol">
            <Icon name="box" size={19} />
          </span>
          <span>
            <strong>
              {signedOut ? "Hesabınıza giriş yapın" : "Çalışma alanım"}
            </strong>
            <small>
              {signedOut ? "Ürünlerinize güvenle erişin" : "Product Manager"}
            </small>
          </span>
          <Icon name="down" size={14} />
        </button>
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <nav>
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.id);
              }}
              aria-current={page === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.id === "products" && <small>{products.length}</small>}
              {item.id === "cart" && cart.totalQuantity > 0 && (
                <small className="cart-count">{cart.totalQuantity}</small>
              )}
              {page === item.id && <span className="nav-indicator" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-decoration">
              <Icon name="layers" size={21} />
              <span>+</span>
            </span>
            <strong>
              {signedOut
                ? "Düzenli envanter. Rahat bir zihin."
                : "İşinizin kontrolü sizde."}
            </strong>
            <p>
              {signedOut
                ? "Veritabanınızdaki ürünleri ve stokları görmek için hesabınıza giriş yapın."
                : "Ürünleriniz, stoklarınız ve sepetiniz tek bir çalışma alanında."}
            </p>
            <button onClick={() => setDialog(signedOut ? "auth" : "help")}>
              {signedOut ? "Hesabınıza bağlanın" : "Çalışma alanı rehberi"}
              <Icon name="arrowUp" size={16} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => setDialog("help")}>
            <Icon name="help" size={19} />
            <span>Yardım & kısa yollar</span>
            <Icon name="arrowUp" size={14} />
          </button>
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>
            <button
              className="user-info"
              onClick={() => setDialog(signedOut ? "auth" : "help")}
            >
              <strong>{userName}</strong>
              <small>
                {signedOut
                  ? "Oturum açık değil"
                  : canManage
                    ? "Yönetici"
                    : "Standart kullanıcı"}
              </small>
            </button>
            {signedOut ? (
              <button
                className="icon-button"
                onClick={() => setDialog("auth")}
                aria-label="Hesabınıza giriş yapın"
              >
                <Icon
                  name="logout"
                  size={17}
                  style={{ transform: "rotate(180deg)" }}
                />
              </button>
            ) : (
              <button
                className="icon-button"
                disabled={busy || loading}
                onClick={() => void workspace.disconnect()}
                aria-label="Oturumu kapat"
                title="Oturumu kapat"
              >
                <Icon name="logout" size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={mobileMenuRef}
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-expanded={sidebarOpen}
              aria-label="Menüyü aç"
            >
              <Icon name="menu" />
            </button>
            <span>Çalışma alanı</span>
            <Icon name="chevron" size={13} />
            <strong>
              {navigation.find((item) => item.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <form
              className="global-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                if (page === "cart") {
                  setPage("products");
                  window.history.pushState(null, "", "#products");
                }
                document
                  .getElementById("product-section")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                placeholder="Çalışma alanında ara..."
                aria-label="Çalışma alanında ürün ara"
                disabled={signedOut}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>Ctrl K</kbd>
            </form>
            <button
              className={`connection-chip ${signedOut ? "signed-out" : ""}`}
              title={
                lastUpdated
                  ? `Son güncelleme: ${new Date(lastUpdated).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul" })}`
                  : undefined
              }
              onClick={() =>
                signedOut ? setDialog("auth") : void workspace.reload()
              }
              disabled={loading || busy}
            >
              <i />
              {signedOut
                ? "Giriş yap"
                : loading
                  ? "Bağlanıyor"
                  : error
                    ? "Bağlantı hatası"
                    : "Canlı veriler"}
            </button>
            <span className="topbar-divider" />
            <button
              className="avatar topbar-avatar"
              onClick={() => setDialog(signedOut ? "auth" : "help")}
              aria-label="Hesap bilgileri"
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                <span />
                {pageText[page].eyebrow}
              </span>
              <h1>
                {signedOut
                  ? "Çalışma alanınıza hoş geldiniz."
                  : pageText[page].title}
              </h1>
              <p>
                {signedOut
                  ? "Ürünlerinizi ve stoklarınızı hesabınızla yönetin."
                  : pageText[page].description}
              </p>
            </div>
            <div className="heading-actions">
              <span className="date-chip">
                <Icon name="calendar" size={15} />
                {date}
              </span>
              {session && page === "overview" ? (
                <button
                  className="button secondary"
                  onClick={download}
                  disabled={loading || !!error || !products.length}
                >
                  <Icon name="download" size={16} />
                  Dışa aktar
                </button>
              ) : page !== "cart" && canManage ? (
                <button
                  className="button primary"
                  onClick={add}
                  disabled={loading || !!error}
                >
                  <Icon name="plus" size={17} />
                  Yeni ürün
                </button>
              ) : null}
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <Icon name="alert" size={19} />
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => void workspace.reload()}
                disabled={loading}
              >
                Tekrar dene
              </button>
              <button className="text-button" onClick={() => setDialog("auth")}>
                Giriş yap
              </button>
            </div>
          )}

          {signedOut ? (
            <section className="panel empty-state cart-empty">
              <span className="empty-icon">
                <Icon name="lock" size={32} />
              </span>
              <h2>Ürünlerinizi görmek için giriş yapın</h2>
              <p>
                Ürün ve stok bilgileri hesabınıza giriş yaptıktan sonra
                veritabanından yüklenir.
              </p>
              <button
                className="button primary"
                onClick={() => setDialog("auth")}
              >
                Hesabıma giriş yap
                <Icon name="arrow" size={17} />
              </button>
            </section>
          ) : loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              <strong>Çalışma alanınız hazırlanıyor</strong>
              <p>Ürünleriniz ve stoklarınız yükleniyor...</p>
            </div>
          ) : error ? (
            <section className="panel empty-state">
              <span className="empty-icon">
                <Icon name="refresh" size={30} />
              </span>
              <h2>Verilerinizi şu anda gösteremiyoruz</h2>
              <p>
                Bağlantıyı kontrol edip tekrar deneyin veya hesabınıza yeniden
                giriş yapın.
              </p>
              <button
                className="button secondary"
                onClick={() => void workspace.reload()}
              >
                <Icon name="refresh" size={16} />
                Yeniden yükle
              </button>
            </section>
          ) : (
            <>
              {page === "overview" && summary && (
                <Dashboard
                  products={products}
                  summary={summary}
                  onFilter={(next) => navigate("stock", next)}
                />
              )}
              {page === "stock" && (
                <>
                  <div className="section-heading">
                    <span>STOK DURUMUNUZ</span>
                    <button className="text-button" onClick={download}>
                      <Icon name="download" size={15} />
                      Stok raporunu indir
                    </button>
                  </div>
                  {summary && (
                    <Dashboard
                      products={products}
                      summary={summary}
                      onFilter={setFilter}
                    />
                  )}
                </>
              )}
              {(page === "overview" || page === "stock") && (
                <StockAttention
                  products={products}
                  onEdit={edit}
                  onView={() => navigate("stock")}
                />
              )}
              {page !== "cart" && (
                <div id="product-section">
                  <ProductList
                    key={`${session?.user.id}:${page}`}
                    products={products}
                    filter={filter}
                    onFilter={setFilter}
                    query={query}
                    onQuery={setQuery}
                    busy={busy}
                    canManage={canManage}
                    overview={page === "overview"}
                    stockPage={page === "stock"}
                    onAdd={add}
                    onEdit={edit}
                    onDelete={(product) => {
                      setSelectedProduct(product);
                      setDialog("delete");
                    }}
                    onCart={(product) => void workspace.addToCart(product)}
                    onViewAll={() => navigate("products")}
                  />
                </div>
              )}
              {page === "cart" && (
                <CartView
                  cart={cart}
                  busy={busy}
                  onQuantity={(id, quantity) =>
                    void workspace.setQuantity(id, quantity)
                  }
                  onClear={() => setDialog("clear")}
                  onBrowse={() => navigate("products")}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-logo">s.</span>
              {lastUpdated
                ? `Son güncelleme: ${new Date(lastUpdated).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul" })}`
                : "Her şey yerli yerinde."}
            </span>
            <span>
              Stockly Workspace<span className="footer-dot">·</span>
              {new Date().getFullYear()}
            </span>
          </footer>
        </main>
      </div>

      {toast && (
        <div
          className={`toast ${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span className="toast-icon">
            <Icon
              name={toast.kind === "success" ? "check" : "alert"}
              size={17}
            />
          </span>
          <p>{toast.message}</p>
        </div>
      )}
      {dialog === "auth" && (
        <AuthDialog
          onClose={() => setDialog(null)}
          onConnect={(next) => {
            workspace.connect(next);
            setQuery("");
            setFilter("all");
          }}
        />
      )}
      {dialog === "product" && (
        <ProductDialog
          product={selectedProduct}
          canManage={canManage}
          busy={busy}
          actionError={workspace.actionError}
          onClose={() => setDialog(null)}
          onSave={workspace.saveProduct}
          onCart={(product) => void workspace.addToCart(product)}
        />
      )}
      {dialog === "delete" && selectedProduct && (
        <ConfirmDialog
          title="Ürünü silmek istediğinize emin misiniz?"
          text={`“${selectedProduct.name}” kalıcı olarak silinecek ve tüm sepetlerden kaldırılacak. Bu işlem geri alınamaz.`}
          confirmText="Ürünü sil"
          busy={busy}
          actionError={workspace.actionError}
          onClose={() => setDialog(null)}
          onConfirm={() => workspace.deleteProduct(selectedProduct)}
        />
      )}
      {dialog === "clear" && (
        <ConfirmDialog
          title="Sepetiniz temizlensin mi?"
          text="Sepetinizdeki tüm ürünler kaldırılacak. Ürünlerinizin stok miktarı değişmeyecek."
          confirmText="Sepeti temizle"
          busy={busy}
          actionError={workspace.actionError}
          onClose={() => setDialog(null)}
          onConfirm={workspace.clearCart}
        />
      )}
      {dialog === "help" && (
        <Modal
          title="Biraz yardıma mı ihtiyacınız var?"
          description="Çalışma alanınızı daha yakından tanıyın."
          onClose={() => setDialog(null)}
        >
          <div className="help-content">
            <div>
              <Icon name="overview" />
              <p>
                <strong>Genel bakış</strong>Göstergeler tüm ürünlerin güncel
                fiyat ve stoklarından hesaplanır. Grafik üzerinden stok
                dağılımını inceleyebilirsiniz.
              </p>
            </div>
            <div>
              <Icon name="layers" />
              <p>
                <strong>Stok takibi</strong>1–10 adet arası düşük stok, 0 adet
                tükenmiş ürün olarak gösterilir. Durum etiketlerine tıklayarak
                listeyi filtreleyin.
              </p>
            </div>
            <div>
              <Icon name="box" />
              <p>
                <strong>Ürün yönetimi</strong>Yöneticiler ürün ekleyebilir,
                fiyat ve stok güncelleyebilir, ürün silebilir. Standart
                kullanıcılar ürünleri inceleyip sepet oluşturabilir.
              </p>
            </div>
            <div>
              <Icon name="cart" />
              <p>
                <strong>Sepetiniz</strong>Sepet kullanıcıya özeldir. Sepete
                eklemek stok azaltmaz. Ödeme ve satış tamamlama bu çalışma
                alanında sunulmaz.
              </p>
            </div>
            <div>
              <Icon name="search" />
              <p>
                <strong>Hızlı arama</strong>
                <kbd>Ctrl K</kbd> ile arama alanına geçin. Ürün adı veya ürün
                numarasıyla arama yapın.
              </p>
            </div>
            {session && (
              <div className="help-account">
                <span>Bağlı hesap</span>
                <strong>{session.user.email}</strong>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;
