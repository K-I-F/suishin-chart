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

// 各計測値の妥当な範囲。範囲外・数値でない値は空欄として書き込む（列ズレ・異常値の混入を防ぐ）。
// 上限は元サイトの想定最大値に安全マージンを掛けたもの。
const BOUNDS = {
  water_level_m: [0, 60], // 想定最大 29.5m
  storage_m3: [0, 9000], // 想定最大 4500m3
  rainfall_mm_h: [0, 400], // 気象庁の猛烈な雨でも ~80mm/h 程度
};

// "20260908212349" -> "2026-09-08T21:23:49+09:00" (元データはJST)
// 14桁の数字でなければ null。ゆるい暦チェックも行う。
function toIso(dt) {
  if (typeof dt !== "string" || !/^\d{14}$/.test(dt)) return null;
  const y = dt.slice(0, 4);
  const mo = dt.slice(4, 6);
  const d = dt.slice(6, 8);
  const h = dt.slice(8, 10);
  const mi = dt.slice(10, 12);
  const s = dt.slice(12, 14);
  const moN = +mo;
  const dN = +d;
  const hN = +h;
  const miN = +mi;
  const sN = +s;
  if (moN < 1 || moN > 12 || dN < 1 || dN > 31 || hN > 23 || miN > 59 || sN > 59) return null;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return iso;
}

// 有限の数値で範囲内なら正規化した文字列、そうでなければ "" を返す。
// Number() 経由なのでカンマ・改行・制御文字は原理的に混入しない（CSV壊れ対策）。
function cleanNum(raw, [min, max]) {
  if (raw === null || raw === undefined || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return "";
  return String(n);
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "suishin-chart-collector (+https://github.com)" },
  });
  // ネットワーク層・HTTPエラーは「異常」として赤くする（原因調査したい）
  if (!res.ok) throw new Error(`source fetch failed: HTTP ${res.status}`);

  // 本文がJSONでない／形が違うのは一時的な不調とみなし、赤くせずスキップ（自己修復）
  let json;
  try {
    json = JSON.parse(await res.text());
  } catch {
    console.log("source response was not valid JSON; skipping this run");
    return;
  }
  if (!json || typeof json !== "object" || !Array.isArray(json.present_value_list)) {
    console.log("source response had unexpected shape; skipping this run");
    return;
  }
  const list = json.present_value_list;
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
  let skipped = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") {
      skipped++;
      continue;
    }
    const iso = toIso(r.datetime);
    if (iso === null) {
      skipped++;
      continue;
    }
    if (seen.has(iso)) continue;

    const ai = Array.isArray(r.ai) ? r.ai : [];
    // ai[0]=貯留施設水位(m) / ai[1]=貯留量(m3) / ai[3]=降水強度(mm/h)
    // (元サイトの index.html: analogList=[0,1], 最大値 29.5 / 4500 に基づく推定)
    const level = cleanNum(ai[0], BOUNDS.water_level_m);
    const storage = cleanNum(ai[1], BOUNDS.storage_m3);
    const rain = cleanNum(ai[3], BOUNDS.rainfall_mm_h);

    // 3項目すべて空なら意味のある記録ではないので捨てる
    if (level === "" && storage === "" && rain === "") {
      skipped++;
      continue;
    }

    rows.push([iso, level, storage, rain].join(","));
    seen.add(iso);
  }

  if (skipped > 0) console.log(`skipped ${skipped} invalid record(s)`);

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
