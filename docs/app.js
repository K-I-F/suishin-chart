"use strict";

const DATA_URL = "./data/history.csv";
const REFRESH_MS = 5 * 60 * 1000;
const STORAGE_MAX = 4500;

let chart = null;
let rows = []; // { t: Date, storage: number|null, level: number|null, rain: number|null }
let rangeDays = 1;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [iso, level, storage, rain] = line.split(",");
    const t = new Date(iso);
    if (isNaN(t.getTime())) continue;
    out.push({
      t,
      level: level === "" ? null : Number(level),
      storage: storage === "" ? null : Number(storage),
      rain: rain === "" ? null : Number(rain),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function visibleRows() {
  if (rangeDays === 0 || rows.length === 0) return rows;
  const cutoff = Date.now() - rangeDays * 86400000;
  return rows.filter((r) => r.t.getTime() >= cutoff);
}

function fmtTime(d) {
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateLatest() {
  if (rows.length === 0) return;
  const last = rows[rows.length - 1];
  document.getElementById("latest").hidden = false;
  document.getElementById("latestStorage").textContent =
    last.storage == null ? "–" : last.storage.toLocaleString();
  document.getElementById("latestLevel").textContent = last.level == null ? "–" : last.level.toFixed(2);
  document.getElementById("latestRain").textContent = last.rain == null ? "–" : last.rain.toFixed(2);
  document.getElementById("latestTime").textContent = fmtTime(last.t);
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildDatasets() {
  const data = visibleRows();
  const showLevel = document.getElementById("showLevel").checked;
  const showRain = document.getElementById("showRain").checked;
  const accent = css("--accent") || "#1880e5";

  const datasets = [
    {
      label: "貯留量 (m³)",
      data: data.map((r) => ({ x: r.t, y: r.storage })),
      borderColor: accent,
      backgroundColor: "rgba(24,128,229,0.12)",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.2,
      spanGaps: false,
      yAxisID: "y",
    },
  ];

  if (showLevel) {
    datasets.push({
      label: "水位 (m)",
      data: data.map((r) => ({ x: r.t, y: r.level })),
      borderColor: "#e0803b",
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.2,
      spanGaps: false,
      yAxisID: "yLevel",
    });
  }

  if (showRain) {
    datasets.push({
      label: "降水強度 (mm/h)",
      type: "bar",
      data: data.map((r) => ({ x: r.t, y: r.rain })),
      backgroundColor: "rgba(120,160,210,0.45)",
      borderWidth: 0,
      yAxisID: "yRain",
      barThickness: 2,
      order: 99,
    });
  }

  return datasets;
}

function scales() {
  const showLevel = document.getElementById("showLevel").checked;
  const showRain = document.getElementById("showRain").checked;
  const tick = css("--muted") || "#6b7280";
  const grid = css("--line") || "#e3e5e9";

  const s = {
    x: {
      type: "time",
      time: { tooltipFormat: "yyyy/MM/dd HH:mm" },
      ticks: { color: tick, maxRotation: 0, autoSkipPadding: 24 },
      grid: { color: grid },
    },
    y: {
      position: "left",
      beginAtZero: true,
      suggestedMax: STORAGE_MAX,
      title: { display: true, text: "貯留量 (m³)", color: tick },
      ticks: { color: tick },
      grid: { color: grid },
    },
  };

  if (showLevel) {
    s.yLevel = {
      position: "right",
      beginAtZero: true,
      suggestedMax: 29.5,
      title: { display: true, text: "水位 (m)", color: tick },
      ticks: { color: tick },
      grid: { drawOnChartArea: false },
    };
  }

  if (showRain) {
    s.yRain = {
      position: "right",
      beginAtZero: true,
      title: { display: true, text: "mm/h", color: tick },
      ticks: { color: tick },
      grid: { drawOnChartArea: false },
      // 降水は下 1/3 に収める
      weight: 1,
      max: undefined,
    };
  }

  return s;
}

function render() {
  const datasets = buildDatasets();
  if (chart) {
    chart.data.datasets = datasets;
    chart.options.scales = scales();
    chart.update();
    return;
  }

  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: scales(),
      plugins: {
        legend: { labels: { color: css("--ink") || "#1b1d21", boxWidth: 14 } },
        tooltip: { },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: "rgba(24,128,229,0.15)" },
            mode: "x",
          },
          pan: { enabled: true, mode: "x", modifierKey: "shift" },
        },
      },
    },
  });

  document.getElementById("chart").addEventListener("dblclick", () => chart.resetZoom());
}

async function load() {
  try {
    let text;
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (fetchErr) {
      // file:// で直接開いたときなどは埋め込みデータにフォールバック
      if (typeof window.SEED_CSV === "string") {
        text = window.SEED_CSV;
      } else {
        throw fetchErr;
      }
    }
    rows = parseCsv(text);
    updateLatest();
    render();
    const first = rows[0] ? fmtTime(rows[0].t) : "–";
    const last = rows[rows.length - 1] ? fmtTime(rows[rows.length - 1].t) : "–";
    document.getElementById("meta").textContent =
      `記録 ${rows.length.toLocaleString()} 件 ／ ${first} 〜 ${last} ／ 最終読み込み ${fmtTime(new Date())}`;
  } catch (err) {
    document.getElementById("meta").textContent = `データの読み込みに失敗した: ${err.message}`;
  }
}

document.querySelectorAll(".range button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    rangeDays = Number(btn.dataset.range);
    if (chart) chart.resetZoom();
    render();
  });
});

document.getElementById("showLevel").addEventListener("change", render);
document.getElementById("showRain").addEventListener("change", render);

load();
setInterval(load, REFRESH_MS);
