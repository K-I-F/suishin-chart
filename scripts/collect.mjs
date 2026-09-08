// 武蔵野市 北町雨水貯留施設のリアルタイムJSONを取得し、
// docs/data/history.csv に新しい記録だけ追記する。
// GitHub Actions (10分間隔) から実行される想定。依存パッケージなし (Node 20+ の組み込み fetch を使用)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const TERMINAL_ID = "0811303103";
const SOURCE_URL = `https://public.ysuishin.com/public/${TERMINAL_ID}/2.json?time=${Date.now()}`;
const DATA_PATH = path.join("docs", "data", "history.csv");
const HEADER = "datetime,water_level_m,storage_m3,rainfall_mm_h";

// "20260908212349" -> "2026-09-08T21:23:49+09:00" (元データはJST)
function toIso(dt) {
  const y = dt.slice(0, 4);
  const mo = dt.slice(4, 6);
  const d = dt.slice(6, 8);
  const h = dt.slice(8, 10);
  const mi = dt.slice(10, 12);
  const s = dt.slice(12, 14);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "suishin-chart-collector (+https://github.com)" },
  });
  if (!res.ok) throw new Error(`source fetch failed: HTTP ${res.status}`);

  const json = JSON.parse(await res.text());
  const list = Array.isArray(json.present_value_list) ? json.present_value_list : [];
  if (list.length === 0) {
    console.log("no records in source response");
    return;
  }

  await mkdir(path.dirname(DATA_PATH), { recursive: true });

  let existing = "";
  const seen = new Set();
  if (existsSync(DATA_PATH)) {
    existing = await readFile(DATA_PATH, "utf8");
    for (const line of existing.trimEnd().split("\n").slice(1)) {
      const iso = line.split(",")[0];
      if (iso) seen.add(iso);
    }
  }

  const rows = [];
  for (const r of list) {
    if (!r || typeof r.datetime !== "string" || r.datetime.length < 14) continue;
    const iso = toIso(r.datetime);
    if (seen.has(iso)) continue;
    const ai = Array.isArray(r.ai) ? r.ai : [];
    // ai[0]=貯留施設水位(m) / ai[1]=貯留量(m3) / ai[3]=降水強度(mm/h)
    // (元サイトの index.html: analogList=[0,1], 最大値 29.5 / 4500 に基づく推定)
    rows.push([iso, ai[0] ?? "", ai[1] ?? "", ai[3] ?? ""].join(","));
    seen.add(iso);
  }

  if (rows.length === 0) {
    console.log("nothing new to append");
    return;
  }
  rows.sort();

  const base = existing.trimEnd();
  const body = base.length > 0
    ? `${base}\n${rows.join("\n")}\n`
    : `${HEADER}\n${rows.join("\n")}\n`;
  await writeFile(DATA_PATH, body);
  console.log(`appended ${rows.length} row(s); latest = ${rows[rows.length - 1].split(",")[0]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
