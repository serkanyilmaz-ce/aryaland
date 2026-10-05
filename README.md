# Aryaland 🐾

Ev işleri, takvim, ihtiyaçlar ve gezi planlarını düzenlemek için bir web uygulaması.

## Bu sürüm

- İş/rica ekleme, düzenleme ve tamamlama.
- Aylık/haftalık takvim, gezi planları, ihtiyaçlar ve notlar.
- JSON ile listeleri dışa/içe aktarma.
- Bütçe pasif; giriş ve şifre yönetimi kapalı.
- Kayıtlar yalnızca kullanılan tarayıcının localStorage alanında tutulur. Cihazlar arasında paylaşılmaz. Site dosyaları kişisel kayıtları içermez.

## Geliştirme

Node.js 22.13 veya üzeri:

```sh
npm ci
npm run dev
npm run build
```

## GitHub Pages + Custom Domain

`docs/` klasörü hazır üretim çıktısıdır. Repository → Settings → Pages:

- Source: Deploy from a branch
- Branch: main
- Folder: /docs
- Custom domain: `aryaland.app`
- Enforce HTTPS: Açık

DNS tarafında `aryaland.app` için GitHub Pages A kayıtlarını ve `www` için `CNAME -> serkanyilmaz-ce.github.io` kaydını ekle.

Adres: https://aryaland.app/

Yeni kaynak değişikliklerinden sonra `npm run build:pages` çalıştır ve güncel `docs/` klasörünü de commit et.

`supabase/` ve `src/api.ts` ileride ortak veri ve muhasebe için ayrılmış, bu sürümde kullanılmayan kaynaklardır. Kimlik doğrulama ve sunucu yetkilendirmesi tamamlanmadan gerçek finans verisi bağlantısını açma.
