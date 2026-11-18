# Stockly — Ürün ve stok yönetimi

Mevcut Product Manager backend'ine bağlanan Türkçe, koyu temalı React 19 + TypeScript arayüzü.

## Çalıştırma

Node.js 22.12 veya üzeri gerekir. Bağımlılıkları yükleyin ve geliştirme sunucusunu başlatın:

```powershell
cd Frontend
npm install
npm run dev
```

Vite terminalinde gösterilen adresi açın; varsayılan adres `http://localhost:5173` olur. Giriş yapmadan ürün veya envanter verisi gösterilmez. Girişten sonra ürünler ve sepet yalnızca backend'den yüklenir. API boş ürün listesi döndürdüğünde katalog boş gösterilir; örnek ürünlerle doldurulmaz.

Gerçek veriler için backend'i ayrı terminalde başlatın:

```powershell
cd Backend
npm run dev
```

Backend için mevcut PostgreSQL bağlantısı, Prisma istemcisi, migration'lar ve JWT ortam değişkenleri gerekir. Kurulum için [Backend README](../Backend/README.md) dosyasını inceleyin. **Hesabıma giriş yap** düğmesi üzerinden mevcut hesabınızla giriş yapın veya standart kullanıcı hesabı oluşturun.

## API bağlantısı

`/api` istekleri geliştirmede Vite proxy üzerinden backend'e gider. Varsayılan hedef `http://localhost:3000` olur.

Backend farklı bir portta çalışıyorsa `.env.example` dosyasını `.env.local` olarak kopyalayıp hedefi değiştirin. Örneğin backend 8000 portundaysa:

```dotenv
API_PROXY_TARGET=http://127.0.0.1:8000
```

Hedef backend'in `PORT` değeriyle eşleşmelidir. Ortam dosyalarını UTF-8 **BOM olmadan** kaydedin. Değişiklik sonrası Vite'ı yeniden başlatın.

Üretimde aynı origin üzerindeki `/api` adresini backend'e yönlendiren bir reverse proxy kullanın veya derlemeden önce tam API adresini tanımlayın:

```dotenv
VITE_API_URL=https://api.example.com/api
```

`VITE_` ile başlayan değerler tarayıcıya açılır; bunlara JWT secret veya veritabanı parolası koymayın. Ayrı origin kullanıldığında backend CORS izinlerini frontend origin'ine göre yapılandırın. `npm run preview` yalnızca derlenmiş frontend'i sunar; geliştirme API proxy'si üretim dağıtımına taşınmaz.

## Özellikler

- **Genel bakış:** ürün listesiyle aynı API yanıtında gelen ürün/stok sayıları, Decimal ile hesaplanmış envanter değeri, stok dağılımı ve stok sağlığı. Geçersiz veya eksik özetler doğru veri gibi gösterilmez.
- **Ürünler:** arama, stok filtreleri, sıralama, sayfalama, tablo/kart görünümü ve ürün detayı.
- **Yönetici işlemleri:** ürün ekleme, fiyat/stok güncelleme, onaylı silme. İsim backend sözleşmesi nedeniyle düzenlenmez.
- **Stok takibi:** tükenen ve 1–10 adet arasındaki kritik ürünler; düşük stok miktarına göre varsayılan sıralama.
- **Sepet:** ekleme, miktar değiştirme, satır çıkarma, onaylı temizleme ve sunucudan alınan güncel toplamlar.
- **Dışa aktarma:** Excel uyumlu UTF-8 CSV; envanter ve sepet raporları, formül değerlendirmesine karşı metin koruması.
- **Oturum:** giriş/kayıt/çıkış, yönetici ve standart kullanıcı ayrımı, sekme kapsamlı oturum ve süresi dolan token için yeniden giriş.
- **Güncellik:** görünür sekmede 30 saniyede bir ve sekmeye geri dönüldüğünde yenileme; elle yenileme ve son güncelleme zamanı. API yanıtları önbellekten okunmaz. Eski istekler iptal edilir; geciken bir yanıt yeni oturumun veya daha yeni bir yenilemenin verisini değiştiremez.
- **Erişilebilirlik:** klavye odağı, yerel dialog odağı/kapatma, azaltılmış hareket tercihi, `Ctrl K` arama kısayolu ve mobil menü.

Sepete eklemek stok azaltmaz. Ödeme/satış tamamlama, geçmiş ciro grafiği, görsel yükleme veya otomatik token yenileme backend'de bulunmadığı için sunulmaz.

Ürün kataloğu ve genel envanter göstergeleri bütün hesaplar için ortaktır. Sepetler kullanıcıya özeldir. Frontend ve backend birlikte güncellenmelidir: `GET /api/products` yanıtında `allProducts` ile birlikte `summary` alanı beklenir. Eski backend çalışıyorsa durdurup `npm run dev` ile yeniden başlatın, ardından frontend sayfasını yenileyin.

## Kod düzeni

```text
src/
  App.tsx                 Sayfa yerleşimi, hash gezinmesi ve pencereler
  App.css                 Panel, gezinme ve gösterge stilleri
  index.css               Tema değişkenleri ve temel stiller
  types.ts                API veri tipleri ve LOW_STOCK eşiği
  components/             Grafikler, katalog, sepet, pencereler ve ikonlar
  hooks/useWorkspace.ts   Oturum, API verileri ve işlem koordinasyonu
  lib/api.ts              API adresleri, token ve HTTP hata yönetimi
  lib/format.ts           Türkçe tutar/sayı ve CSV biçimlendirme
  styles/                 Bileşen ve responsive stiller
tests/workspace.spec.ts   Tarayıcı üzerinden kullanıcı akışları
```

Backend katmanları, API sözleşmeleri ve incelemede görülen mevcut eksikler [ARCHITECTURE.md](../ARCHITECTURE.md) dosyasında açıklanmıştır.

## Kontroller

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright taklit HTTP yanıtları üzerinden API sözleşmelerini ve kullanıcı akışlarını test eder; canlı veritabanını değiştirmez. Test verileri yalnızca `tests/fixtures/` içinde bulunur ve uygulamaya dahil edilmez. Oturumsuz durumda, boş katalogda ve çıkış sonrasında örnek ürün gösterilmediği de doğrulanır. İlk kurulumda tarayıcı indirmesi için internet bağlantısı gerekir. Kurulu Chrome/Chromium ile çalıştırmak için alternatif bir yürütülebilir dosya belirtilebilir:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:e2e
```

Testler yerel Vite sunucusunu kullanır; yoksa kendileri başlatır. Hata ekran görüntüleri ve izleri `test-results/` dizinine kaydedilir. Üretim çıktısı `dist/` dizinindedir.
