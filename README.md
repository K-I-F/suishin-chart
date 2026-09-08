# 北町雨水貯留施設 貯留量ログ

武蔵野市「北町雨水貯留施設」の[リアルタイム公開データ](https://public.ysuishin.com/opendata/suishin/13/203/index.html)を
10分間隔で収集し、長期の時系列グラフとしてスマホ等から閲覧できるようにする静的サイト。

- 収集: GitHub Actions（cron 10分間隔）が `scripts/collect.mjs` を実行し、`docs/data/history.csv` に追記してコミットする
- 表示: `docs/` を GitHub Pages で公開。Chart.js で貯留量・水位・降水強度を描画（期間切替、ズーム対応）

## 制約

- **過去にさかのぼった収集はできない。** 元データは直近90分ぶん（約16件）しか返さず、履歴用URLは非公開。
  よって記録はこのリポジトリの Actions を有効化した時点以降のぶんだけ増えていく。
- GitHub Actions の cron は混雑時に数分遅れることがある。また **リポジトリが60日間更新されないと
  スケジュール実行が自動停止する**（`git push` が走るので通常は問題にならない）。
- データ列（水位 / 貯留量 / 降水強度）の対応は元サイトの JS（`analogList=[0,1]`, 最大値 29.5 / 4500）からの推定。

## データ形式 `docs/data/history.csv`

```
datetime,water_level_m,storage_m3,rainfall_mm_h
2026-09-08T21:20:38+09:00,3.26,497,3.36
```

`datetime` は JST（+09:00）。

## セットアップ

### 1. リポジトリを用意する

GitHub アカウントを作成（https://github.com/signup ）してから、新規リポジトリ `suishin-chart` を作る（Public 推奨。Public なら Actions 実行時間は無制限）。

このフォルダで初回コミットして push する:

```powershell
cd C:\Users\81806\Desktop\Cursor\suishin-chart
git init
git add .
git commit -m "initial: 貯留量ログの収集と表示"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/suishin-chart.git
git push -u origin main
```

### 2. GitHub Pages を有効化

リポジトリの **Settings → Pages** で:

- **Source**: `Deploy from a branch`
- **Branch**: `main` / フォルダ `/docs` → Save

数分後 `https://<ユーザー名>.github.io/suishin-chart/` で表示される。これをスマホのブラウザで開く。

### 3. Actions を有効化

- **Settings → Actions → General → Workflow permissions** を **Read and write permissions** にする（コミットの push に必要）
- **Actions** タブで `collect` ワークフローを選び **Enable workflow**
- 動作確認は **Run workflow**（`workflow_dispatch`）で即時実行できる

以後10分おきに `docs/data/history.csv` が伸びていく。

## ローカルで表示確認

```powershell
cd C:\Users\81806\Desktop\Cursor\suishin-chart\docs
python -m http.server 8000
# ブラウザで http://localhost:8000/
```

収集スクリプトの手動実行:

```powershell
cd C:\Users\81806\Desktop\Cursor\suishin-chart
node scripts\collect.mjs
```
