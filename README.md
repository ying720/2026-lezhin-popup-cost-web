# Lezhin 線下快閃花費計算器

這份小型後端 Web 專案是依照你上傳的 Excel 檔 `2026Lezhin SPAKLZ MD.xlsx` 轉成的商品費用計算器。

## 已整理的場次

- 白夜的花路 台北場：TWD，24 項商品
- 0606-0621台北場：TWD，138 項商品
- 「0520-0525韓國場」的副本：KRW，150 項商品

## 功能

- 選擇場次後，顯示該場次商品清單。
- 可輸入商品數量，並即時計算商品原幣總額。
- 台北場以台幣計算；韓國場可輸入「1 韓元約幾台幣」的匯率。
- 可加入交通、餐飲、住宿、票券、代購費、付款手續費、其他雜費。
- 可設定商品加成百分比與預備金百分比。
- 可設定預算，系統會顯示是否超支。
- 依 Excel 內的滿額贈文字做保守估算。
- 若數量超過從官方備註抓到的限購數，會顯示提醒。
- 響應式設計：手機版商品清單會自動改成卡片式版面，並在底部固定顯示預估總花費。

## 執行方式（Windows）

```bat
cd lezhin_popup_cost_web
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

開啟瀏覽器進入：

```text
http://127.0.0.1:5000
```

## 執行方式（Mac / Linux）

```bash
cd lezhin_popup_cost_web
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

## 檔案說明

- `app.py`：Flask 後端入口。
- `calculator.py`：所有金額、匯率、額外費用、滿額贈估算邏輯。
- `data/products.json`：由 Excel 轉出的商品資料。
- `templates/index.html`：網頁主畫面。
- `static/app.js`：前端互動與呼叫後端 API。
- `static/style.css`：網頁樣式。

## 手機使用建議

在手機瀏覽器打開後，可以直接用搜尋欄找商品，按每張商品卡片上的 `＋` / `－` 調整數量。畫面下方會固定顯示預估總花費，點「明細」可跳到計算結果區。

## 注意

滿額贈與限購是依 Excel 的備註文字抓取與估算，最後仍要以官方現場公告為準。
