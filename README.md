# Transaction Quality Hub (TQHub)

Transaction Quality Hub is a state-of-the-art enterprise spreadsheet processing, auditing, and standardization platform. Built as a fully unified full-stack application, it allows financial analysts and auditors to instantly ingest ledger datasets, detect/override coordinate schemas, perform country-strict phone audits, identify typographical close matches, run statistical anomaly outlier checks, and compile clean partitions ready for legacy target architectures.

---

## 🚀 Key Feature Deliverables

### 1. Ingest & Automated Schema Identifier
- Uploads `.csv` or `.xlsx` files smoothly using client-side `FileReader` binary base64 envelopes.
- Employs fuzzy header-name matches to instantly map unstandardized keys:
  - **Order ID** (e.g. `transaction_id`, `invoice_no`)
  - **Phone Number** (e.g. `mobile`, `customer_phone`)
  - **Payment Mode** (e.g. `pay_method`, `pay_mode`)
  - **Unit Price** (e.g. `amount`, `cost`, `unit_price`)

### 2. Deep Audit Validation Engine
- **Multi-Region Phone Rules**: Tests and flags dial numbers based on country location context specifications:
  - **India**: 10 digits
  - **Singapore**: 8 digits
  - **USA**: 10 digits
  - **UK**: 11 digits
- **Date Standardizer**: Assesses and asserts international calendar formats (`DD-MM-YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`).
- **Time Clock Checker**: Evaluates and isolates clock format errors (`HH:MM`, `HH:MM:SS`).
- **Completeness Ratio & Integrity Auditor**: Flags duplications (by matching `Order ID` occurrences), negative prices, and zero/negative quantities.

### 3. Smart Typographical Auto-Repair Suggestions
- Calculates character distance matches to correct typical transaction errors automatically:
  - `gamil.com` / `gmial.com` $\rightarrow$ `gmail.com`
  - `UP1` / `upy` $\rightarrow$ `UPI`
  - `Credt Card` / `crdt card` $\rightarrow$ `Credit Card`
- Features an interactive review deck in the UI where users can individually click **Accept** or **Dismiss**.

### 4. Statistical Anomaly & Outlier Detector
- Mimics Scikit-learn `IsolationForest` calculations using an optimized variance outlier logic (with Z-scores and Interquartile Ranges).
- Flags deviant price/quantity metrics, identifying suspicious volumes and extremely high transaction values dynamically.

### 5. Partitions & ZIP Chunk Splitter
- Limits outputs automatically and recursively split files exceeding **5000 lines** into modular partitions (e.g. `chunk_1.csv`, `chunk_2.csv`).
- Compresses output blocks into a unified `.zip` file for speed and system-safe legacy ingestion.

---

## 📁 Project Workspace Structure

```
├── .env.example                # Environmental secret configurations file
├── metadata.json               # Platform frame configuration and capabilities
├── package.json                # Custom Full-stack build & start scripts
├── server.ts                   # Backend Express stream parser & analytics controller
├── vite.config.ts              # Vite asset server and alias configuration file
├── src/
│   ├── App.tsx                 # Interactive dark-themed SaaS console SPA
│   ├── index.css               # Embedded fonts and Tailwind styling enhancements
│   └── main.tsx                # Client entry-point
└── public/
    └── sample_transactions.csv # 1-Click interactive sample test ledger file
```

---

## 🛠️ Local Development Setup

To boot TQHub on your local workspace:

1. **Install Base Dependencies**:
   ```bash
   npm install
   ```

2. **Boot in Developer Pipeline Mode**:
   ```bash
   npm run dev
   ```
   Runs Vite and the Node backend concurrently on port `3000`.

3. **Production Compile**:
   ```bash
   npm run build
   ```
   Compiles client assets inside `dist/` and bundles server-side typescript cleanly to a unified `dist/server.cjs` file.

4. **Production Start**:
   ```bash
   npm run start
   ```

---

## ☁️ Production Deployment Instructions

You can host this dual-infrastructure seamlessly with Vercel (Frontend SPA) and Render (Backend Express).

### A. Deploy Frontend on Vercel
Vercel hosts the client-side SPA static bundle:

1. Install Vercel CLI or link your repository to your **Vercel Dashboard**.
2. Set directory root to `.` and configure the framework as **Vite / Other**.
3. Set the Build Command:
   ```bash
   npm run build
   ```
4. Set Output Directory:
   ```bash
   dist
   ```
5. Click **Deploy**. Vercel will host your client static app with global CDN coverage.

### B. Deploy Backend on Render
Render hosts the live analytical API server:

1. Create a **New Web Service** inside your **Render Dashboard** linked to your repository.
2. Set Environment to **Node**.
3. Set Build Command:
   ```bash
   npm run build
   ```
4. Set Start Command:
   ```bash
   npm run start
   ```
5. Add Environment Variables inside Render's panel:
   - `NODE_ENV=production`
   - `PORT=3000`
6. Click **Deploy Web Service**. Render will expose your live validation APIs on an HTTPS subdomain.
7. *Tip*: Update your frontend client code fetches from relative `/api/...` paths to your deployed Render service URL of choice!

---
*Created under Apache-2.0 License • Enterprise Financial Spreadsheet Analytics Core*
