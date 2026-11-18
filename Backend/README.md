# Product Manager Backend

Express + TypeScript API; PostgreSQL verisine Prisma ile erişilir.

- `src/routes`: API yolları ve kimlik doğrulama bağlantıları.
- `src/controller`: HTTP girdilerinin doğrulanması ve yanıtlar.
- `src/services/cartService.ts`: Sepet işlemleri, stok kontrolü ve tutar hesaplama.
- `src/middleware/auth.ts`: Bearer access token doğrulaması; kullanıcı `req.user` üzerinden alınır.
- `src/db/db.ts`: Paylaşılan Prisma istemcisi.
- `src/db/settings.ts` ve `src/db/resilience.ts`: Havuz/timeout ayarları, bağlantı yaşam döngüsü ve güvenli yeniden deneme.
- `src/app.ts`: Express uygulaması ve sağlık adresleri; `src/server.ts`: Başlatma ve kontrollü kapanış.
- `prisma/schema.prisma` ve `prisma/migrations`: Veri modeli ve veritabanı değişiklikleri.

## Kurulum ve kontrol

`.env` dosyasında mevcut veritabanı ve JWT ayarları bulunmalıdır. Yeni sepet tablosunu hedef veritabanına uygulamak için:

```sh
npx prisma migrate deploy
npx prisma generate
npm run typecheck
npm test
npm run dev
```

`migrate deploy` bekleyen tüm migration dosyalarını uygular. Sepet migration dosyası `20261019090000_add_cart_items` mevcut ürün ve kullanıcı tablolarına bağlı yeni bir tablo ekler.

Testler HTTP rotalarını, gerçek kimlik doğrulama/controller/service kodunu ve taklit Prisma işlemlerini kullanır; canlı veritabanına bağlanmaz. PostgreSQL transaction davranışı ve migration'ın uygulanması bu testlerin kapsamında değildir.

## Giriş ve Token tablosu

Başarılı `POST /api/auth/login` yanıtında `accessToken`, `refreshToken` ve `user` bulunur. Backend yanıtı göndermeden önce refresh token'ı `Token` tablosuna kullanıcı kimliğiyle kaydeder. Bu yazma başarısızsa giriş başarılı sayılmaz; bağlantı hatasında `503 DATABASE_UNAVAILABLE` döner. Her giriş farklı bir refresh token üretir.

`Token` tablosu yalnızca **refresh token** saklar; access token bu tabloya yazılmaz. Frontend iki token'ı `sessionStorage` içindeki `stockly.session` kaydında tutar. Sayfa yenilenince mevcut oturum kullanılır, yeniden login yapılmaz ve yeni token satırı eklenmez. Çıkışta ilgili refresh token satırı silinir; diğer oturumlar korunur.

Girişi kontrol ederken tarayıcının Network bölümünde `POST /api/auth/login` isteğinin `200` döndüğünü doğrulayın. Ardından `Backend/.env` içindeki `DATABASE_URL` ile aynı veritabanını ve şemayı açıp `Token` tablosunu **çıkış yapmadan önce** yenileyin. Token veya bağlantı parolalarını paylaşmayın.

```sh
npm run test:auth
```

Bu testler gerçek bcrypt ve JWT koduyla başarılı girişi, refresh token kaydını, tekrar girişte benzersiz token üretimini, yanlış şifreyi, kayıt hatasında başarının engellenmesini ve çıkışta yalnızca ilgili kaydın silinmesini doğrular. Prisma işlemleri taklit edilir; test komutu canlı veritabanına yazmaz.

## Veritabanı bağlantı dayanıklılığı

Mevcut `.env` ve SSL bilgileri değiştirilmez. Prisma istemcisi oluşturulurken eksik bağlantı parametreleri çalışma zamanında eklenir. `.env.example` içindeki `DB_*` ayarlarıyla değiştirilebilir. URL'de zaten tanımlanmış parametreler korunur; açık bir `DB_*` değeri aynı URL parametresini geçersiz kılar.

| Ayar | Varsayılan | Anlamı |
| --- | --- | --- |
| `DB_CONNECTION_LIMIT` | `5` | Süreç başına havuzdaki en fazla bağlantı |
| `DB_CONNECT_TIMEOUT_SECONDS` | `10` | Yeni bağlantının kurulmasını bekleme süresi, saniye |
| `DB_POOL_TIMEOUT_SECONDS` | `5` | Havuzdan boş bağlantı bekleme süresi, saniye |
| `DB_SOCKET_TIMEOUT_SECONDS` | `10` | Tek bir sorgunun bitmesini bekleme süresi, saniye |
| `DB_CONNECT_ATTEMPTS` | `5` | İlk deneme dahil başlangıç bağlantı denemesi |
| `DB_RETRY_DELAY_MS` | `500` | İlk yeniden deneme beklemesi, milisaniye |
| `DB_RETRY_MAX_DELAY_MS` | `5000` | Üstel bekleme ve rastgele ek gecikme üst sınırı |
| `DB_READ_ATTEMPTS` | `2` | Bağımsız okuma sorgusunda ilk deneme dahil toplam deneme |
| `DB_READ_RETRY_DELAY_MS` | `150` | Güvenli okuma tekrarının beklemesi |
| `DB_TRANSACTION_MAX_WAIT_MS` | `5000` | Interactive transaction başlatma beklemesi |
| `DB_TRANSACTION_TIMEOUT_MS` | `10000` | Interactive transaction süresi |
| `SHUTDOWN_TIMEOUT_MS` | `20000` | Kontrollü kapanış için üst süre |

Parametrelerin anlamı [Prisma 6 PostgreSQL bağlantı referansına](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql) dayanır. Havuz limiti her Node süreci için ayrıdır; birden fazla uygulama örneğinde toplam bağlantı sayısını veritabanı/pooler kapasitesine göre ayarlayın. Timeout'lar bağlantı/sorgu başınadır; çok sorgulu bir HTTP isteğinin toplam süresi daha uzun olabilir. `0` değeri URL'de açıkça verilmişse Prisma'nın sınırsız bekleme anlamı korunur; `DB_*` değişkenleri pozitif değer ister.

- Başlangıçta `$connect()` ve gerçek bir `SELECT 1` çalışır. Geçici erişim/kopma hatalarında kademeli gecikme ve rastgele ek bekleme ile sınırlı yeniden deneme yapılır. Parola, izin, şema veya hatalı URL sorunları tekrar denenmez. Denemeler biterse sunucu hata koduyla kapanır; bağlantısız şekilde istek kabul etmez.
- Eşzamanlı başlangıç çağrıları tek bir bağlantı denemesini paylaşır. Geliştirmede aynı süreçte istemci yeniden kullanılır. Her istekte bağlantı havuzu kapatılıp açılmaz.
- `P1001`, `P1002`, `P1017` hatalarında yalnızca transaction dışındaki bilinen okuma işlemleri en fazla bir kez yeniden denenir. Yazma işlemleri, ham SQL ve transaction içindeki sorgular otomatik tekrarlanmaz. Transaction çakışmaları için sepet servisindeki mevcut kontrollü yeniden deneme devam eder.
- `P2024` gibi dolu havuz hataları ve `P1008` sorgu timeout'ları fazladan yük oluşturmamak için tekrar denenmez. Bağlantı sorunları HTTP `503`, `DATABASE_UNAVAILABLE` ve `Retry-After: 1` ile döner. Bu başlık özellikle yazma isteklerinin otomatik tekrar edilmesi talimatı değildir; sonucu belirsiz yazımlarda önce güncel kayıt kontrol edilmelidir.
- `SIGTERM`/`SIGINT` sırasında yeni HTTP bağlantıları durdurulur, devam eden istekler tamamlanır, ardından Prisma havuzu kapatılır. Başlangıç geri çekilme beklemesi kapanışta iptal edilir. DB yardımcıları doğrudan `process.exit()` çağırmaz.
- Bağlantı logları kod/deneme/gecikme bilgisi içerir; bağlantı adresi, şifre ve sorgu girdileri yazılmaz. Sağlık sorgusu istek üzerine çalışır; sürekli keepalive sorgusu veya sağlayıcının uyumasını engelleyen zamanlayıcı eklenmez.

### Sağlık adresleri ve kontroller

| Adres | Davranış |
| --- | --- |
| `GET /health/live` | Veritabanına gitmeden `200`; Node/HTTP sunucusu çalışıyor. |
| `GET /health/ready` | `SELECT 1` başarılıysa `200`, veritabanı erişilemiyorsa `503`. Sonuç önbelleğe alınmaz; eşzamanlı problar tek sorguyu paylaşır. |

```sh
npm run typecheck
npm run test:db
```

Bağlantı testleri başlangıç tekrarlarını, iptal/kapanışı, eşzamanlı çağrıları, güvenli okuma tekrarını, yazımların tekrarlanmamasını ve HTTP 503 yanıtlarını kapsar. Gerçek Prisma connector testi yerel ve yanıt vermeyen bir TCP dinleyicisine bağlanır; canlı veritabanına yazmadan gerçek engine timeout davranışını doğrular.

`npm test` kimlik doğrulama, ürün doğrulama, sepet, envanter, CORS ve veritabanı dayanıklılığı testlerini birlikte çalıştırır. Eski `/sale/addcart` yolu aynı sepet servisine bağlıdır ve test kapsamındadır.

## Ürün doğrulaması ve HTTP hataları

Ürün adı kırpılarak 1–150 karakter aralığında doğrulanır. Stok 0–2147483647 arasında tam sayı olmalıdır. Fiyat 0–9999999999.99 arasında, en fazla iki ondalık basamaklı sayı veya ondalık metin olabilir; daha hassas tutarlar sessizce yuvarlanmaz. Oluşturmada tüm alanlar zorunludur. Güncellemede ad ile ilgili fiyat/stok alanı zorunludur. Geçersiz veri `400`, mükerrer kayıt `409`, bulunamayan ürün `404`, beklenmeyen sunucu hatası `500` döndürür. Veritabanı erişim hatalarında mevcut `503` sözleşmesi korunur.

Ürün listesi barkodu da içerir; frontend barkodla arama ve detay gösteriminde bu alanı kullanır. Kayıtta ad 1–100 karakter olmalıdır; e-posta ve şifre alanları metin türünde doğrulanır.

Geliştirme dışındaki ortamlarda `WHITELIST_ORIGINS` virgülle ayrılmış tam origin listesidir, örneğin `https://shop.example.com,https://admin.example.com:8443`. Protokol ve port eşleşmeye dahildir; alt metin eşleşmesi yapılmaz. İzin verilmeyen origin `403`, bozuk JSON `400`, gövde limitini aşan istek `413` döndürür.

## Ürün listesi ve genel göstergeler

Ürün kataloğu bütün hesaplar için ortaktır. `GET /api/products` hem `allProducts` hem de `summary` döndürür. Özet aynı sorguyla okunan ürünlerden hesaplanır; ayrı sorgular arasında stok değişmesi nedeniyle liste/gösterge uyumsuzluğu oluşmaz.

```json
{
  "status": "Successful",
  "allProducts": [],
  "summary": {
    "productCount": 0,
    "totalStock": 0,
    "inventoryValue": "0.00",
    "healthyCount": 0,
    "lowCount": 0,
    "outCount": 0,
    "criticalCount": 0,
    "lowStockThreshold": 10
  }
}
```

Envanter değeri `price × stock` toplamıdır ve Decimal ile hesaplanıp iki ondalık basamaklı metin döner. Kritik ürün sayısı düşük stoklu ve tükenen ürünlerin toplamıdır. Ürün listesi veya göstergeler kullanıcı hesabına göre filtrelenmez; sepetler ayrıdır. API yanıtları `Cache-Control: private, no-store` ile döner. Bu yanıtı kullanan frontend ile backend birlikte güncellenmelidir.

İlgili doğruluk testlerini çalıştırmak için:

```sh
node --import tsx --test tests/inventory.test.ts
```

## Sepet API

Tüm isteklerde `Authorization: Bearer <accessToken>` başlığı kullanılır. Kullanıcı kimliği token'dan alınır; gövdede kullanıcı kimliği gönderilmez. Her kullanıcının sepeti bağımsızdır ve `CartItem` kayıtlarında kalıcı olarak saklanır.

| Metot | Yol | Gövde / davranış |
| --- | --- | --- |
| GET | `/api/cart` | Sepeti ve toplamları getirir. |
| POST | `/api/cart/items` | `{"productId":1,"quantity":2}`; mevcut miktara ekler. |
| PATCH | `/api/cart/items/1` | `{"quantity":3}`; miktarı 3 olarak ayarlar. |
| DELETE | `/api/cart/items/1` | Ürünü sepetten çıkarır. |
| DELETE | `/api/cart` | Sepeti boşaltır; boş sepette de başarılıdır. |
| POST | `/sale/addcart` | Mevcut yol: `{"id":1,"quantity":2}`; isteğe bağlı `barcode` gönderilebilir. |

Örnek ekleme isteği:

```http
POST /api/cart/items
Authorization: Bearer <accessToken>
Content-Type: application/json

{"productId":1,"quantity":2}
```

Başarılı işlemler `200` ile güncel sepeti döndürür:

```json
{
  "status": "Successful",
  "cart": {
    "items": [
      {
        "productId": 1,
        "name": "Örnek ürün",
        "barcode": "ürünün-barkodu",
        "price": "12.50",
        "stock": 10,
        "quantity": 2,
        "subtotal": "25.00"
      }
    ],
    "totalQuantity": 2,
    "totalPrice": "25.00"
  }
}
```

Miktar ve ürün kimliği pozitif tam sayı olmalıdır; üst sınır PostgreSQL `INTEGER` sınırı olan 2147483647'dir. Geçersiz girdi `400`, kimlik doğrulama hatası `401`, bulunamayan ürün/sepet satırı `404`, yetersiz stok veya tekrar denenmesi gereken eşzamanlı değişiklik `409` döndürür. Beklenmeyen hatalar `500` döndürür.

Fiyat ve ürün adı veritabanından alınır. Tutarlar Decimal ile hesaplanır ve hassasiyet kaybını önlemek için JSON'da iki ondalık basamaklı metin olarak döner. Sepet görüntülendiğinde güncel fiyatlar kullanılır.

Sepete eklemek stok ayırmaz veya azaltmaz. Her ekleme/miktar değişikliğinde kullanıcının o üründeki toplam miktarı mevcut stokla karşılaştırılır. Stok sonradan değişirse sepette stoktan fazla miktar bulunabilir. Satış/ödeme tamamlanması ayrı bir akıştır ve ayrıca transaction içinde stok doğrulaması ve azaltımı gerektirir. Ürün veya kullanıcı silinirse ilgili sepet satırları da silinir.
