# Blog Takip

Takip ettigin teknik bloglari tek sayfada toplayan, GitHub Pages ile hostlanan statik site.
En yeniden eskiye siralar; onem (important / medium / small) ve kaynaga gore filtreler;
okunanlari isaretler.

## Nasil calisir

```
GitHub Actions (6 saatte bir)
   -> scripts/fetch.mjs     feed'leri ceker
   -> Claude API (haiku)    her yeni basligi onemine gore etiketler
   -> data.json             koke yazilir ve commit edilir
index.html                  data.json'u okur, filtreler, "okundu"yu localStorage'da tutar
```

- CORS sorunu yok: tarayici sadece kendi reposundaki `data.json`'u okur.
- Etiketler onbelleklenir: ayni yazi tekrar siniflandirilmaz, maliyet dusuk kalir.
- `ANTHROPIC_API_KEY` yoksa script anahtar kelime heuristigine duser (site yine calisir).

## Kurulum

1. Bu klasoru bir GitHub reposuna yukle (`git init` -> commit -> push).
2. **Settings > Secrets and variables > Actions** altina `ANTHROPIC_API_KEY` ekle.
3. **Settings > Pages**: Source = `Deploy from a branch`, Branch = `main` / root.
4. **Actions** sekmesinden `Feed'leri guncelle` is akisini bir kez elle calistir (Run workflow).
   Bu `data.json`'u doldurur. Sonrasi otomatik (cron).

## Yerelde deneme

```bash
cd scripts
npm install
node fetch.mjs            # API anahtari icin: ANTHROPIC_API_KEY ortam degiskeni
# ardindan index.html'i bir statik sunucuyla ac (file:// fetch'i engeller)
python -m http.server     # kokte; http://localhost:8000
```

## Blog ekleme / cikarma

`config/feeds.json` icindeki `feeds` listesini duzenle. `weight`: kaynagin onem egilimi
(2 = haber agirlikli, 1 = karisik, 0 = uzun-form deneme) — LLM'e ipucu olur.

## Eklenebilecek bloglar (oneri)

Ilgi alanina gore (hepsinin RSS'i var):

**AI / haber:** Simon Willison (simonwillison.net/atom/everything/),
Import AI (jack-clark.net/feed), Pragmatic Engineer (newsletter.pragmaticengineer.com/feed)

**Muhendislik / sistem:** Brendan Gregg (brendangregg.com/blog/rss.xml),
Marc Brooker (brooker.co.za/blog/rss.xml), Antirez (antirez.com/rss),
Netflix/Discord/Uber engineering bloglari

**Yari iletken / donanim:** SemiAnalysis (semianalysis.com/feed),
Chips and Cheese (chipsandcheese.com/feed)
