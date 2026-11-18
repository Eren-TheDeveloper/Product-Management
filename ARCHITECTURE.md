# Product Manager — Mimari inceleme

## Genel yapı

Proje iki bağımsız TypeScript uygulamasından oluşur. React frontend, Express API üzerinden PostgreSQL verilerine erişir. Sepet verileri `CartItem` modeli ve ilgili migration ile kalıcı olarak saklanır.

```text
Tarayıcı
  └─ Frontend: React 19 + TypeScript + Vite
       ├─ App: gezinme, sayfa yerleşimi ve pencereler
       ├─ components: genel bakış, ürünler, sepet ve formlar
       ├─ hooks/useWorkspace: oturum, veriler ve işlemler
       └─ lib/api: HTTP, Bearer token, hata ve zaman aşımı yönetimi
            └─ /api → geliştirmede Vite proxy
                 └─ Backend: Express 5 + TypeScript
                      ├─ routes: adresler ve yetkilendirme
                      ├─ middleware: JWT doğrulama ve yönetici kontrolü
                      ├─ controller: girdiler ve HTTP yanıtları
                      ├─ services/cartService: sepet iş kuralları
                      └─ Prisma → PostgreSQL
```

Frontend bağımlılıkları uygulama tarafında React ve React DOM ile sınırlıdır. İkonlar SVG, grafikler HTML/CSS ile oluşturulur. Playwright yalnızca geliştirme/test bağımlılığıdır. Google Fonts erişimi olmadığında sistem fontları kullanılır.

## Veri modeli

| Model | Sorumluluk |
| --- | --- |
| `User` | İsim, benzersiz e-posta, bcrypt şifre özeti ve `admin`/`user` rolü |
| `Products` | Benzersiz isim, Decimal(12,2) fiyat, stok, otomatik barkod ve oluşturulma tarihi |
| `CartItem` | Birleşik `userId + productId` anahtarıyla kalıcı, kullanıcıya özel sepet satırı |
| `Token` | Kullanıcıya bağlı refresh token kayıtları |

Sepette fiyatlar istemciden alınmaz. Servis güncel ürün fiyatını kullanır, Decimal ile hesaplar ve iki ondalık basamaklı metin döndürür. Frontend sepet toplamlarını bu yanıttan gösterir.

Sepet yazımları Serializable transaction ve çakışma durumunda yeniden deneme kullanır. Sepete ekleme stok ayırmaz; stok değişmişse frontend sepet satırında uyarı gösterir. Ürün silinince ilişkili sepet satırları cascade ile silinir.

## Frontend–backend sözleşmesi

| İşlem | Metot ve adres | Gönderilen alanlar |
| --- | --- | --- |
| Giriş | `POST /api/auth/login` | `email`, `password` |
| Kayıt | `POST /api/auth/register` | `name`, `email`, `password` |
| Çıkış | `POST /api/auth/logout` | Authorization başlığında **refresh token** |
| Ürün listesi ve genel göstergeler | `GET /api/products` | —; aynı yanıttaki `allProducts` ve `summary` kullanılır |
| Ürün ekleme | `POST /api/products` | `name`, `price`, `stock` |
| Stok güncelleme | `PATCH /api/products/update/stock` | `name`, `stock` |
| Fiyat güncelleme | `PATCH /api/products/update/price` | `name`, `price` |
| Ürün silme | `DELETE /api/products` | `name` |
| Sepeti okuma | `GET /api/cart` | — |
| Sepete bir adet ekleme | `POST /api/cart/items` | `productId`, `quantity: 1` |
| Sepet miktarını belirleme | `PATCH /api/cart/items/:productId` | `quantity` |
| Satır çıkarma | `DELETE /api/cart/items/:productId` | — |
| Sepeti temizleme | `DELETE /api/cart` | — |

Ürün ve sepet istekleri access token kullanır. Kullanıcı kimliği istek gövdesine eklenmez; backend JWT'den belirler. Yönetici kontrolleri `requireAdmin` middleware'inde kalır. Giriş ve kayıt yanıtlarındaki `user` nesnesine **`role` alanı eklendi**; frontend yönetici düğmelerini bu bilgiyle gösterir. Yeni kayıtlar backend tarafından hâlâ `user` rolüyle oluşturulur.

API ürün adını değiştirme sunmadığı için düzenleme formunda ad salt okunurdur. Fiyat ve stok farklı uç noktalardır; iki işlem kısmen başarılı olursa veri yeniden okunur ve kısmi başarı açıkça bildirilir.

## Arayüz ve durum yönetimi

- Genel bakışta toplam ürün, stok adedi, güncel fiyatlarla envanter değeri ve kritik ürün sayısı gösterilir. `Backend/src/services/inventorySummary.ts` bu değerleri ürün listesiyle aynı veritabanı okumasından üretir. Tutar Decimal ile hesaplanır; frontend para biçimlendirmesi büyük tutarları Number'a çevirerek kuruş kaybetmez. Satış/ciro geçmişi üretilmez.
- Ürün kataloğu ve genel göstergeler ortak, sepet kullanıcıya özeldir. Ürünlere kullanıcı sahipliği veya hesap bazlı filtre eklenmemiştir.
- Sağlıklı stok `> 10`, düşük stok `1–10`, tükenen stok `0` adettir. Eşik `src/types.ts` içindeki `LOW_STOCK` sabitinden yönetilir.
- API tüm ürünleri döndürdüğünden arama, filtreleme, sıralama ve sayfalama istemcide yapılır.
- `#overview`, `#products`, `#stock`, `#cart` bağlantıları doğrudan açılabilir; tarayıcı geri/ileri gezinmesi desteklenir.
- Oturum açılmadan ürün ve envanter verileri gösterilmez. Ürünler ve sepet yalnızca API'den yüklenir; boş katalog veya bağlantı hatasında örnek ürün kullanılmaz. Çıkışta yüklenen veriler temizlenir. Test verileri yalnızca `Frontend/tests/fixtures/` içinde bulunur ve uygulamaya dahil edilmez.
- Canlı oturum `sessionStorage` içinde, tarayıcı sekmesi kapsamında saklanır. 401 yanıtları yeniden giriş akışına yönlendiren hata durumu oluşturur; API token yenileme sunmadığı için otomatik refresh uygulanmaz.
- Başlangıç/yenileme hatalarında eski veriler güncel veri gibi gösterilmez. İsteklerde 15 saniye zaman aşımı, Türkçe hatalar ve tekrar deneme bulunur.
- Ürünler ve gösterge özeti tek bir frontend durumunda tutulur. Görünür sekmede 30 saniyelik yenileme ve sekmeye dönüşte yeniden okuma yapılır. İstek sıra numarası, oturum nesli ve AbortController ile eski yanıtların yeni veriyi ezmesi engellenir. Çıkışta veriler sunucudaki logout yanıtı beklenmeden temizlenir. `/api` yanıtları `private, no-store` ve `Vary: Authorization` başlıklarıyla korunur; fetch de `cache: no-store` kullanır.
- Silme ve sepet temizleme onay pencereleri, HTML form doğrulaması, işlem sırasında düğme kilitleme ve CSV formül koruması bulunur.

## Backend iyileştirmeleri ve kalan eksikler

1. Eski `/sale/addcart` yolu yeniden bağlandı ve `/api/cart/items` ile aynı kimlik doğrulama, doğrulama ve sepet servisini kullanır. Sepet testleri tam test komutuna dahildir.
2. Token yenileme, mevcut kullanıcı bilgisi (`/me`) ve satış/ödeme tamamlama uç noktaları yok. Frontend bu işlemler için sahte akış sunmaz.
3. Ürün yazımları ortak middleware ile doğrulanır: ad 1–150 karakter, stok 0–2147483647 tam sayı, fiyat Decimal(12,2) sınırında ve en fazla iki ondalık basamaktır. Sıfır geçerlidir. Eksik alanlar, tür dönüşümüne açık girdiler ve taşmalar yazımdan önce 400 döndürür. Kayıtta ad ve kimlik doğrulamada metin türleri de sunucuda doğrulanır.
4. Genel Express hata işleyicisi ve veritabanı hataları için ortak `503 / DATABASE_UNAVAILABLE` yanıtı eklenmiştir. Controller'lar bağlantı hatalarını yanlış giriş veya kimlik doğrulama hatası olarak döndürmez.
5. Ürün listeleme API'sinde sunucu tarafı sayfalama/arama, kategori ve görsel alanları yok. Çok büyük kataloglar için API'nin sayfalama desteğiyle genişletilmesi gerekir.
6. CORS izin listesi virgülle ayrılır ve geliştirme dışındaki ortamlarda origin tam eşleşmesiyle kontrol edilir. Reddedilen origin 403 döndürür. Mükerrer kayıtlar 409, bulunamayan güncelleme/silme hedefleri 404 döndürür; beklenmeyen hatalar iç ayrıntıları yanıta eklemez.

## Doğrulama kapsamı

Frontend üretim derlemesi ve backend TypeScript kontrolü çalıştırıldı. Playwright testleri API üzerinden CRUD, arama/filtre/sayfalama, sepet miktarları, mobil taşma ve pencere odağı, API istek sözleşmeleri, rol ayrımı, oturum hatası ve erişilemeyen backend durumunu kapsar. Oturumsuz durumda, boş API kataloğunda ve çıkış sonrasında örnek ürün gösterilmediği de doğrulanır. API senaryoları HTTP yanıtlarını taklit eder ve canlı veritabanına kayıt yazmaz.

Otomatik kontroller canlı veritabanına yazmaz. Backend testleri gerçek rota, yetkilendirme ve servisleri taklit Prisma işlemleriyle doğrular. Gerçek PostgreSQL migration ve transaction davranışı ayrıca entegrasyon ortamında doğrulanmalıdır.

## Veritabanı bağlantı yönetimi

`Backend/src/db/settings.ts`, mevcut URL ve SSL ayarlarını koruyarak Prisma 6 bağlantı havuzu ve timeout parametrelerini tamamlar. `resilience.ts` sınırlı üstel yeniden deneme, iptal, eşzamanlı bağlantı/prob paylaşımı ve güvenli okuma politikasını yönetir. Yazımlar ve transaction içindeki sorgular bağlantı kopması sonrası otomatik tekrarlanmaz. `db.ts` bu politikayı paylaşılan Prisma istemcisine uygular. İşlem süreleri ve ayarlanabilir değerler [Backend README](Backend/README.md) dosyasında yer alır.

Express kurulumu `src/app.ts`, sunucu yaşam döngüsü `src/server.ts` içinde ayrılmıştır. Sunucu bağlantıyı `SELECT 1` ile doğruladıktan sonra HTTP dinlemeye başlar. `/health/live` süreç sağlığını, `/health/ready` güncel veritabanı erişimini bildirir. Kapanışta HTTP istekleri tamamlanmadan havuz kapatılmaz.
