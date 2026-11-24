// Feed'leri ceker, yeni yazilari LLM ile (anahtar yoksa heuristik ile) siniflandirir,
// koke data.json yazar. GitHub Actions icinde `node scripts/fetch.mjs` olarak calisir.
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "feeds.json");
const DATA_PATH = path.join(ROOT, "data.json");

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const MAX = cfg.maxItemsPerFeed ?? 30;
const parser = new Parser({ timeout: 20000, headers: { "User-Agent": "blog-takip/1.0" } });

// --- Mevcut data.json'u onbellek olarak yukle (etiketleri tekrar uretmemek icin) ---
let cache = new Map();
try {
  const prev = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  for (const it of prev.items || []) cache.set(it.id, it);
} catch { /* ilk calistirma */ }

const stripHtml = (s = "") => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const idFor = (entry) => entry.guid || entry.id || entry.link || entry.title;

// --- Feed'leri cek ---
const collected = [];
for (const feed of cfg.feeds) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).slice(0, MAX);
    for (const e of items) {
      const id = idFor(e);
      if (!id) continue;
      const dateStr = e.isoDate || e.pubDate || null;
      collected.push({
        id,
        title: (e.title || "(baslik yok)").trim(),
        link: e.link || "",
        source: feed.name,
        weight: feed.weight ?? 0,
        date: dateStr ? new Date(dateStr).toISOString() : null,
        summary: stripHtml(e.contentSnippet || e.content || e.summary || "").slice(0, 400),
      });
    }
    console.log(`OK   ${feed.name}: ${items.length} yazi`);
  } catch (err) {
    console.error(`FAIL ${feed.name}: ${err.message}`);
  }
}

// --- Siniflandirilacak yeni yazilar (onbellekte etiketi olmayanlar) ---
const needLabel = collected.filter((it) => !cache.get(it.id)?.importance);
console.log(`Yeni/etiketsiz yazi: ${needLabel.length}`);

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLASSIFIER_MODEL || "claude-haiku-5-5";

// Anahtar kelime fallback (API yoksa veya hata olursa)
function heuristic(it) {
  const t = (it.title + " " + it.summary).toLowerCase();
  const hi = /(launch|released?|announce|breaking|raises?\s*\$|acquir|vulnerab|exploit|breakthrough|gpt|outage|zero-day)/;
  const lo = /(weekly|roundup|links|digest|newsletter|notes)/;
  if (hi.test(t) || it.weight >= 2) return "important";
  if (lo.test(t)) return "small";
  return it.weight >= 1 ? "medium" : "medium";
}

async function classifyBatch(batch) {
  const list = batch.map((it, i) => `${i}. [${it.source}] ${it.title}`).join("\n");
  const prompt =
    `Asagida teknoloji blog yazilarinin basliklari var. Okuyucu yapay zeka, sistem muhendisligi, ` +
    `yari iletkenler, altyapi ve kripto ile ilgileniyor. Her yaziyi onemine gore siniflandir:\n` +
    `- "important": onemli bir gelisme, yeni urun/model lansmani, kritik haber, buyuk guvenlik olayi\n` +
    `- "medium": kaliteli teknik yazi ama acil/cigir acici degil\n` +
    `- "small": derleme, haftalik linkler, kisa not, kucuk guncelleme\n\n` +
    `Sadece su formatta JSON dizisi dondur, baska hicbir sey yazma: ` +
    `[{"i":0,"importance":"medium"}, ...]\n\nYazilar:\n${list}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = (json.content || []).map((c) => c.text || "").join("");
  const match = text.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(match ? match[0] : text);
  const valid = new Set(["important", "medium", "small"]);
  for (const row of arr) {
    const it = batch[row.i];
    if (it && valid.has(row.importance)) it.importance = row.importance;
  }
}

if (needLabel.length) {
  if (!KEY) {
    console.warn("ANTHROPIC_API_KEY yok -> anahtar kelime heuristigi kullaniliyor.");
    for (const it of needLabel) it.importance = heuristic(it);
  } else {
    const SIZE = 25;
    for (let i = 0; i < needLabel.length; i += SIZE) {
      const batch = needLabel.slice(i, i + SIZE);
      try {
        await classifyBatch(batch);
        for (const it of batch) if (!it.importance) it.importance = heuristic(it);
      } catch (err) {
        console.error(`Siniflandirma hatasi, heuristik: ${err.message}`);
        for (const it of batch) it.importance = heuristic(it);
      }
    }
  }
}

// Onbellekteki etiketleri koru
for (const it of collected) {
  const c = cache.get(it.id);
  if (c?.importance && !it.importance) it.importance = c.importance;
  if (!it.importance) it.importance = heuristic(it);
}

// Tarihe gore yeni -> eski sirala
collected.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

const out = {
  generatedAt: new Date().toISOString(),
  count: collected.length,
  sources: cfg.feeds.map((f) => f.name),
  items: collected,
};
fs.writeFileSync(DATA_PATH, JSON.stringify(out, null, 2));
console.log(`Yazildi: ${DATA_PATH} (${collected.length} yazi)`);
