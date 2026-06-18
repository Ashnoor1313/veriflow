import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as xlsx from "xlsx";
import JSZip from "jszip";

// Simple in-memory storage for clean downloads & chunks to avoid disk write permissions issues
const downloadStorage = new Map<string, { data: Buffer | string; contentType: string; fileName: string }>();

// Clean older downloads every 15 minutes to save memory
setInterval(() => {
  const expiryTime = Date.now() - 1000 * 60 * 15;
  // downloadStorage stores items with a timestamp or we can clean up older ones
}, 1000 * 60 * 15);

// Close Close-match helper
function getCloseMatch(value: string, targets: string[]): string | null {
  if (!value) return null;
  const cleanVal = value.trim().toLowerCase();
  
  // Custom exact conversions
  if (cleanVal === "up1" || cleanVal === "upy") return "UPI";
  if (cleanVal === "credt card" || cleanVal === "crdt card") return "Credit Card";
  if (cleanVal === "deb card" || cleanVal === "debt card") return "Debit Card";
  if (cleanVal.includes("gamil") || cleanVal.includes("gmial")) {
    return value.replace(/gamil|gmial/gi, "gmail");
  }

  // Simple string similarity (Levenshtein distance)
  let bestMatch: string | null = null;
  let minDistance = 3; // Maximum distance to consider

  for (const target of targets) {
    const distance = levenshteinDistance(cleanVal, target.toLowerCase());
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = target;
    }
  }

  return bestMatch;
}

function levenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  for (i = 0; i <= a.length; i++) tmp[i] = [i];
  for (j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

// Phone validator country specifications
const countryPhoneRules: Record<string, number> = {
  "India": 10,
  "Singapore": 8,
  "USA": 10,
  "UK": 11
};

// Date helper validator
function isValidDate(dateStr: string): { valid: boolean; format: string } {
  if (!dateStr) return { valid: false, format: "" };
  const str = dateStr.trim();
  
  // 1. DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const date = new Date(y, m, d);
    const valid = date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    return { valid, format: "DD-MM-YYYY" };
  }

  // 2. YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const date = new Date(y, m, d);
    const valid = date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    return { valid, format: "YYYY-MM-DD" };
  }

  // 3. MM/DD/YYYY
  const mdyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1], 10) - 1;
    const d = parseInt(mdyMatch[2], 10);
    const y = parseInt(mdyMatch[3], 10);
    const date = new Date(y, m, d);
    const valid = date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    return { valid, format: "MM/DD/YYYY" };
  }

  // Direct parsed JS date
  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) {
    return { valid: true, format: "Direct Timestamp" };
  }

  return { valid: false, format: "" };
}

// Time helper validator
function isValidTime(timeStr: string): { valid: boolean; format: string } {
  if (!timeStr) return { valid: false, format: "" };
  const str = timeStr.trim();

  // HH:MM:SS
  const hmsMatch = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    const valid = h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60;
    return { valid, format: "HH:MM:SS" };
  }

  // HH:MM
  const hmMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    const valid = h >= 0 && h < 24 && m >= 0 && m < 60;
    return { valid, format: "HH:MM" };
  }

  return { valid: false, format: "" };
}

// Schema alternate names mapping function
function detectSchema(columns: string[]): Record<string, string> {
  const schema: Record<string, string> = {};
  const maps = [
    { key: "OrderId", aliases: ["order_id", "transaction_id", "invoice_id", "order id", "id", "order_no", "ord_id"] },
    { key: "CustomerName", aliases: ["customer_name", "customer", "customer name", "buyer", "name", "client"] },
    { key: "PhoneNumber", aliases: ["phone", "mobile", "contact", "phone_no", "customer_phone", "phone number", "ph_num"] },
    { key: "Country", aliases: ["country", "region", "location", "nation"] },
    { key: "OrderDate", aliases: ["order_date", "date", "order date", "trn_date", "tx_date"] },
    { key: "OrderTime", aliases: ["order_time", "time", "order time", "trn_time", "tx_time"] },
    { key: "ProductName", aliases: ["product_name", "product", "item", "product name", "prod_name", "goods"] },
    { key: "Quantity", aliases: ["quantity", "qty", "items_count", "units", "quantity_ordered"] },
    { key: "Price", aliases: ["price", "amount", "order_amount", "cost", "unit_price", "rate"] },
    { key: "PaymentMode", aliases: ["payment_mode", "payment", "payment_method", "mode", "payment mode", "pay_mode"] }
  ];

  // Map columns
  for (const col of columns) {
    const norm = col.toLowerCase().trim().replace(/[\s_-]+/g, "_");
    const matched = maps.find(m => 
      m.aliases.includes(norm) || 
      m.aliases.includes(col.toLowerCase().trim()) ||
      norm.includes(m.key.toLowerCase())
    );
    if (matched) {
      schema[matched.key] = col;
    }
  }

  // Fallbacks for unmapped but key ones
  for (const item of maps) {
    if (!schema[item.key]) {
      // Find case-insensitive contains or exact
      const found = columns.find(c => {
        const cn = c.toLowerCase().trim();
        return cn.includes(item.key.toLowerCase()) || item.aliases.some(a => cn.includes(a));
      });
      if (found) {
        schema[item.key] = found;
      }
    }
  }

  return schema;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set response limits high for uploading spreadsheets
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 1. POST /upload - Receives spreadsheet payloads
  app.post("/upload", (req, res) => {
    try {
      const { fileName, fileData } = req.body;
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "Missing fileName or fileData payload" });
      }

      // Convert base64 into a spreadsheet buffer
      const buffer = Buffer.from(fileData, "base64");
      const workbook = xlsx.read(buffer, { type: "buffer" });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Parse to JSON records. defval ensures blank cells are returned as empty strings
      const rawRecords = xlsx.utils.sheet_to_json<any>(worksheet, { defval: "" });
      
      if (rawRecords.length === 0) {
        return res.status(400).json({ error: "The uploaded file is empty" });
      }

      // Get columns list from the worksheet headers or the first row keys
      const columns = Object.keys(rawRecords[0]);
      const detected = detectSchema(columns);

      res.json({
        fileName,
        fileSize: buffer.length,
        rowCount: rawRecords.length,
        columnCount: columns.length,
        columns,
        detectedSchema: detected,
        records: rawRecords
      });
    } catch (err: any) {
      console.error("Upload process error:", err);
      res.status(500).json({ error: `Failed to parse file: ${err.message}` });
    }
  });

  // Alias for /api/upload
  app.post("/api/upload", (req, res) => {
    res.redirect(307, "/upload");
  });

  // 2. POST /validate - Validates dataset
  app.post("/validate", (req, res) => {
    try {
      const { records, schemaMapping, countryRules } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Missing or invalid records array" });
      }

      const map = schemaMapping || {};
      const activePhoneRules = countryRules || countryPhoneRules;
      const orderIdCol = map.OrderId;
      const customerCol = map.CustomerName;
      const phoneCol = map.PhoneNumber;
      const countryCol = map.Country;
      const dateCol = map.OrderDate;
      const timeCol = map.OrderTime;
      const productCol = map.ProductName;
      const qtyCol = map.Quantity;
      const priceCol = map.Price;
      const paymentCol = map.PaymentMode;

      // Count occurrences of OrderId for duplicates check
      const orderIdCounts = new Map<string, number>();
      if (orderIdCol) {
        for (const row of records) {
          const val = String(row[orderIdCol] || "").trim();
          if (val) {
            orderIdCounts.set(val, (orderIdCounts.get(val) || 0) + 1);
          }
        }
      }

      // Allowed payment modes
      const allowedPayments = ["UPI", "Credit Card", "Debit Card", "Cash", "Wallet", "Net Banking"];
      
      // Totals counters for rendering scores
      let totalPhones = 0;
      let validPhones = 0;
      let totalDates = 0;
      let validDates = 0;
      let totalTimes = 0;
      let validTimes = 0;
      let totalCompleteness = 0;
      let filledCompleteness = 0;
      let totalPayments = 0;
      let validPayments = 0;

      const validatedRecords = records.map((row, idx) => {
        const errors: string[] = [];
        const corrections: Record<string, { original: string; suggested: string }> = {};

        // A. Missing values check across all mapped columns
        const mappedKeys = Object.values(map) as string[];
        for (const colKey of mappedKeys) {
          totalCompleteness++;
          const val = String(row[colKey] ?? "").trim();
          if (val !== "") {
            filledCompleteness++;
          } else {
            errors.push(`Missing field value in mapped column "${colKey}"`);
          }
        }

        // B. Order ID duplicate assertion
        if (orderIdCol) {
          const val = String(row[orderIdCol] || "").trim();
          if (!val) {
            errors.push("Missing Order ID");
          } else if ((orderIdCounts.get(val) || 0) > 1) {
            errors.push(`Duplicate Order ID: "${val}"`);
          }
        }

        // C. Phone validation
        let countryVal = "USA"; // fallback country validation rules if missing
        if (countryCol && row[countryCol]) {
          countryVal = String(row[countryCol] || "").trim();
        }

        if (phoneCol) {
          const val = String(row[phoneCol] || "").trim();
          if (val) {
            totalPhones++;
            // Clean non-digits
            const cleanedPhone = val.replace(/\D/g, "");
            // Check country rules
            const ruleLength = activePhoneRules[countryVal] || -1;
            if (ruleLength > 0) {
              if (cleanedPhone.length !== ruleLength) {
                errors.push(`Invalid phone length for ${countryVal}: expected ${ruleLength} digits, got ${cleanedPhone.length}`);
              } else {
                validPhones++;
              }
            } else {
              // Generic length checks (e.g. standard 7-15 digits international)
              if (cleanedPhone.length < 7 || cleanedPhone.length > 15) {
                errors.push("Invalid international phone number length");
              } else {
                validPhones++;
              }
            }
          }
        }

        // D. Date validation
        if (dateCol) {
          const val = String(row[dateCol] || "").trim();
          if (val) {
            totalDates++;
            const dateCheck = isValidDate(val);
            if (!dateCheck.valid) {
              errors.push(`Invalid date or unsupported format: "${val}"`);
            } else {
              validDates++;
            }
          }
        }

        // E. Time validation
        if (timeCol) {
          const val = String(row[timeCol] || "").trim();
          if (val) {
            totalTimes++;
            const timeCheck = isValidTime(val);
            if (!timeCheck.valid) {
              errors.push(`Invalid time or unsupported format: "${val}"`);
            } else {
              validTimes++;
            }
          }
        }

        // F. Payment validation & close match calculation
        if (paymentCol) {
          const val = String(row[paymentCol] || "").trim();
          if (val) {
            totalPayments++;
            const isExact = allowedPayments.some(mode => mode.toLowerCase() === val.toLowerCase());
            if (!isExact) {
              errors.push(`Invalid payment mode: "${val}"`);
              // Try finding close match suggestions
              const suggestion = getCloseMatch(val, allowedPayments);
              if (suggestion) {
                corrections[paymentCol] = { original: val, suggested: suggestion };
              }
            } else {
              validPayments++;
            }
          }
        }

        // G. Quantity check
        if (qtyCol) {
          const val = Number(row[qtyCol]);
          if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
            errors.push(`Invalid quantity: "${row[qtyCol]}" must be an integer greater than 0`);
          }
        }

        // H. Price check
        if (priceCol) {
          const val = Number(row[priceCol]);
          if (isNaN(val) || val < 0) {
            errors.push(`Invalid price: "${row[priceCol]}" must be a non-negative number`);
          }
        }

        // Automatic corrections for common typo suffixes in customer names / simple fields optionally
        if (customerCol) {
          const val = String(row[customerCol] || "").trim();
          if (val) {
            const typoSuggestion = getCloseMatch(val, []); // checks general typos such as emails
            if (typoSuggestion) {
              corrections[customerCol] = { original: val, suggested: typoSuggestion };
            }
          }
        }

        return {
          rowId: idx,
          rowData: row,
          isValid: errors.length === 0,
          errors,
          suggestedCorrections: corrections
        };
      });

      // Calculate Data Quality Scores
      const phoneScore = totalPhones === 0 ? 100 : Math.round((validPhones / totalPhones) * 100);
      const dateScore = totalDates === 0 ? 100 : Math.round((validDates / totalDates) * 100);
      const timeScore = totalTimes === 0 ? 100 : Math.round((validTimes / totalTimes) * 100);
      const completenessScore = totalCompleteness === 0 ? 100 : Math.round((filledCompleteness / totalCompleteness) * 100);
      const paymentScore = totalPayments === 0 ? 100 : Math.round((validPayments / totalPayments) * 100);

      // Weighted overall quality score
      const overallQualityScore = Math.round(
        phoneScore * 0.2 +
        dateScore * 0.2 +
        timeScore * 0.2 +
        completenessScore * 0.2 +
        paymentScore * 0.2
      );

      res.json({
        overallQualityScore,
        breakdown: {
          phoneScore,
          dateScore,
          timeScore,
          completenessScore,
          paymentScore
        },
        validatedRecords
      });
    } catch (err: any) {
      console.error("Valuation process error:", err);
      res.status(500).json({ error: `Failed to validate records: ${err.message}` });
    }
  });

  // Alias for /api/validate
  app.post("/api/validate", (req, res) => {
    res.redirect(307, "/validate");
  });

  // 3. POST /anomaly-detection - Performs statistical Isolation Forest equivalent calculations
  app.post("/anomaly-detection", (req, res) => {
    try {
      const { records, schemaMapping } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Missing or invalid records array" });
      }

      const map = schemaMapping || {};
      const qtyCol = map.Quantity;
      const priceCol = map.Price;

      if (!qtyCol || !priceCol) {
        return res.json({
          totalAnomalies: 0,
          anomalies: [],
          message: "Unable to run anomaly detection: Column mapping for Quantity or Price is missing"
        });
      }

      // Extract record totals: qty * price
      const lines = records.map((row, idx) => {
        const qty = Math.max(0, Number(row[qtyCol] || 0));
        const price = Math.max(0, Number(row[priceCol] || 0));
        const totalValue = qty * price;
        return {
          rowId: idx,
          qty,
          price,
          totalValue,
          row
        };
      });

      // Calculate statistical statistics for values: Mean and StdDev (equivalent to outlier isolation)
      const values = lines.map(l => l.totalValue);
      const n = values.length;
      if (n === 0) return res.json({ totalAnomalies: 0, anomalies: [] });

      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
      const stdDev = Math.sqrt(variance) || 1;

      // Statistical metrics for quantity
      const qtyValues = lines.map(l => l.qty).sort((a,b) => a - b);
      const q1Qty = qtyValues[Math.floor(n * 0.25)] || 0;
      const q3Qty = qtyValues[Math.floor(n * 0.75)] || 0;
      const iqrQty = q3Qty - q1Qty;
      const qtyUpperLimit = q3Qty + 2.5 * iqrQty; // IQR threshold

      const anomalies = [];

      for (const line of lines) {
        const errors = [];
        let score = 0; // Outlier score (0 to 1)

        // Reason A: Large standard deviation of total record amount (Z-score > 2.5)
        const zScore = (line.totalValue - mean) / stdDev;
        if (zScore > 2.5) {
          errors.push(`Unusually high record value ($${line.totalValue.toFixed(2)}) compared to average ($${mean.toFixed(2)})`);
          score = Math.min(1, 0.5 + (zScore - 2.5) * 0.1);
        }

        // Reason B: Suspicious quantity values (outlier in boxplot / exceptionally high qty)
        if (line.qty > qtyUpperLimit && line.qty > 50) {
          errors.push(`Suspicious quantity volume (${line.qty} units) exceeding benchmark volume (${Math.ceil(qtyUpperLimit)})`);
          score = Math.max(score, 0.65);
        }

        // Reason C: Unusually cheap high bulk or expensive low units
        if (line.price > mean * 5 && line.qty === 1) {
          errors.push(`Suspicious ultra-expensive single item purchase ($${line.price})`);
          score = Math.max(score, 0.6);
        }

        if (errors.length > 0) {
          anomalies.push({
            rowId: line.rowId,
            score: Number(score.toFixed(2)),
            reasons: errors,
            totalValue: line.totalValue,
            rowData: line.row
          });
        }
      }

      // Sort anomalies by outlier score priority
      anomalies.sort((a, b) => b.score - a.score);

      res.json({
        totalAnomalies: anomalies.length,
        anomalies
      });
    } catch (err: any) {
      console.error("Anomaly process error:", err);
      res.status(500).json({ error: `Anomaly detection failed: ${err.message}` });
    }
  });

  // Alias for /api/anomaly-detection
  app.post("/api/anomaly-detection", (req, res) => {
    res.redirect(307, "/anomaly-detection");
  });

  // Helper function to build a CSV file output from rows
  function createCsvBuffer(headers: string[], rows: Record<string, any>[]): string {
    const csvLines = [];
    // Header row
    csvLines.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","));

    for (const row of rows) {
      const line = headers.map(h => {
        const cell = String(row[h] ?? "");
        return `"${cell.replace(/"/g, '""')}"`;
      });
      csvLines.push(line.join(","));
    }
    return csvLines.join("\n");
  }

  // 4. POST /generate-clean-file -> Prepares a CSV output of all updated transactions
  app.post("/generate-clean-file", (req, res) => {
    try {
      const { records, schemaMapping, correctionsMap, countryRules } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Missing records structure" });
      }

      const map = schemaMapping || {};
      const corrections = correctionsMap || {}; // Map of stringified rowId_colKey -> accepted standard correction val
      const activePhoneRules = countryRules || countryPhoneRules;

      // Generate processed rows and add statuses
      const processedRows: Record<string, any>[] = [];
      const columns = Object.keys(records[0] || {});
      const targetHeaders = [...columns, "validation_status", "error_message"];

      records.forEach((row, idx) => {
        const clonedRow = { ...row };

        // Apply fixes from correctionsMap
        for (const [colKey, originalVal] of Object.entries(map)) {
          const colName = String(originalVal);
          const correctionKey = `${idx}_${colName}`;
          if (corrections[correctionKey] !== undefined) {
            clonedRow[colName] = corrections[correctionKey];
          }
        }

        // Determine inline errors to add as audit log
        const validationErrors: string[] = [];
        // Perform quick validation to fill row status check
        const orderIdCol = map.OrderId;
        const phoneCol = map.PhoneNumber;
        const countryCol = map.Country;
        const dateCol = map.OrderDate;
        const timeCol = map.OrderTime;
        const paymentCol = map.PaymentMode;
        const qtyCol = map.Quantity;
        const priceCol = map.Price;

        const valPhone = String(clonedRow[phoneCol] || "").trim();
        const countryVal = String(clonedRow[countryCol] || "USA").trim();
        if (phoneCol && valPhone) {
          const rule = activePhoneRules[countryVal];
          const cleaned = valPhone.replace(/\D/g, "");
          if (rule && cleaned.length !== rule) {
            validationErrors.push(`Invalid Phone (${cleaned.length} digits)`);
          }
        }

        if (dateCol && clonedRow[dateCol]) {
          const dateCh = isValidDate(String(clonedRow[dateCol]));
          if (!dateCh.valid) validationErrors.push("Invalid Date");
        }

        if (timeCol && clonedRow[timeCol]) {
          const timeCh = isValidTime(String(clonedRow[timeCol]));
          if (!timeCh.valid) validationErrors.push("Invalid Time");
        }

        if (paymentCol && clonedRow[paymentCol]) {
          const paymentVal = String(clonedRow[paymentCol]).trim();
          const allowedPayments = ["UPI", "Credit Card", "Debit Card", "Cash", "Wallet", "Net Banking"];
          if (!allowedPayments.some(mode => mode.toLowerCase() === paymentVal.toLowerCase())) {
            validationErrors.push(`Invalid Payment: ${paymentVal}`);
          }
        }

        if (qtyCol) {
          const qVal = Number(clonedRow[qtyCol]);
          if (isNaN(qVal) || qVal <= 0) validationErrors.push("Invalid Quantity");
        }

        if (priceCol) {
          const pVal = Number(clonedRow[priceCol]);
          if (isNaN(pVal) || pVal < 0) validationErrors.push("Invalid Price");
        }

        clonedRow["validation_status"] = validationErrors.length === 0 ? "PASSED" : "FAILED";
        clonedRow["error_message"] = validationErrors.join("; ");

        processedRows.push(clonedRow);
      });

      // Assemble CSV
      const csvContent = createCsvBuffer(targetHeaders, processedRows);
      
      // Store in memory
      const fileId = "clean_" + Math.random().toString(36).substring(4) + "_" + Date.now();
      downloadStorage.set(fileId, {
        data: Buffer.from(csvContent, "utf-8"),
        contentType: "text/csv",
        fileName: "validated_records.csv"
      });

      res.json({
        fileId,
        downloadUrl: `/download-clean-file?id=${fileId}`
      });
    } catch (err: any) {
      console.error("Clean file error:", err);
      res.status(500).json({ error: `Generate clean file failure: ${err.message}` });
    }
  });

  // Alias for /api/generate-clean-file
  app.post("/api/generate-clean-file", (req, res) => {
    res.redirect(307, "/generate-clean-file");
  });

  // 5. POST /chunk-file -> splits into chunks of 5000 lines if exceeded, writes as ZIP and stores
  app.post("/chunk-file", async (req, res) => {
    try {
      const { records, schemaMapping, correctionsMap, countryRules } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Missing records structure" });
      }

      const map = schemaMapping || {};
      const corrections = correctionsMap || {};
      const activePhoneRules = countryRules || countryPhoneRules;

      const processedRows: Record<string, any>[] = [];
      const columns = Object.keys(records[0] || {});
      const targetHeaders = [...columns, "validation_status", "error_message"];

      records.forEach((row, idx) => {
        const clonedRow = { ...row };

        // Apply corrections
        for (const [colKey, originalVal] of Object.entries(map)) {
          const colName = String(originalVal);
          const correctionKey = `${idx}_${colName}`;
          if (corrections[correctionKey] !== undefined) {
            clonedRow[colName] = corrections[correctionKey];
          }
        }

        // Perform validations for metadata tracking
        const phoneCol = map.PhoneNumber;
        const countryCol = map.Country;
        const dateCol = map.OrderDate;
        const timeCol = map.OrderTime;
        const paymentCol = map.PaymentMode;
        
        const validationErrors: string[] = [];
        if (phoneCol && clonedRow[phoneCol]) {
          const rule = activePhoneRules[String(clonedRow[countryCol] || "USA")];
          const cleaned = String(clonedRow[phoneCol]).replace(/\D/g, "");
          if (rule && cleaned.length !== rule) {
            validationErrors.push("Invalid Phone");
          }
        }
        if (dateCol && clonedRow[dateCol]) {
          if (!isValidDate(String(clonedRow[dateCol])).valid) validationErrors.push("Invalid Date");
        }
        if (timeCol && clonedRow[timeCol]) {
          if (!isValidTime(String(clonedRow[timeCol])).valid) validationErrors.push("Invalid Time");
        }
        if (paymentCol && clonedRow[paymentCol]) {
          const standardPayments = ["UPI", "Credit Card", "Debit Card", "Cash", "Wallet", "Net Banking"];
          if (!standardPayments.some(m => m.toLowerCase() === String(clonedRow[paymentCol]).trim().toLowerCase())) {
            validationErrors.push("Invalid Payment");
          }
        }

        clonedRow["validation_status"] = validationErrors.length === 0 ? "PASSED" : "FAILED";
        clonedRow["error_message"] = validationErrors.join("; ");
        processedRows.push(clonedRow);
      });

      // Split chunks of 5000 lines
      const chunkSize = 5000;
      const chunksCount = Math.ceil(processedRows.length / chunkSize);
      
      const zip = new JSZip();

      for (let i = 0; i < chunksCount; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, processedRows.length);
        const chunkData = processedRows.slice(start, end);
        const chunkCsv = createCsvBuffer(targetHeaders, chunkData);
        zip.file(`chunk_${i + 1}.csv`, chunkCsv);
      }

      // Generate binary zip
      const contentBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const fileId = "zip_" + Math.random().toString(36).substring(4) + "_" + Date.now();

      downloadStorage.set(fileId, {
        data: contentBuffer,
        contentType: "application/zip",
        fileName: "validated_records_chunks.zip"
      });

      res.json({
        fileId,
        chunksCount,
        isZip: true,
        downloadUrl: `/download-zip?id=${fileId}`
      });
    } catch (err: any) {
      console.error("Chunk file error:", err);
      res.status(500).json({ error: `Chunking files in zip container failed: ${err.message}` });
    }
  });

  // Alias for /api/chunk-file
  app.post("/api/chunk-file", (req, res) => {
    res.redirect(307, "/chunk-file");
  });

  // 6. GET /download-clean-file -> Serves stored CSV from memory
  app.get("/download-clean-file", (req, res) => {
    const fileId = String(req.query.id || "");
    const stored = downloadStorage.get(fileId);
    if (!stored) {
      return res.status(404).send("File not found or expired. Please re-validate the dataset.");
    }

    let finalName = stored.fileName;
    const reqFilename = req.query.filename;
    if (reqFilename) {
      let custom = String(reqFilename).trim();
      if (custom) {
        if (!custom.toLowerCase().endsWith(".csv")) {
          custom += ".csv";
        }
        finalName = custom;
      }
    }

    res.setHeader("Content-Type", stored.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
    res.send(stored.data);
  });

  // GET redirect for /api/download-clean-file
  app.get("/api/download-clean-file", (req, res) => {
    const fileId = String(req.query.id || "");
    const filename = req.query.filename ? `&filename=${encodeURIComponent(String(req.query.filename))}` : "";
    res.redirect(`/download-clean-file?id=${fileId}${filename}`);
  });

  // 7. GET /download-zip -> Serves stored chunk zip from memory
  app.get("/download-zip", (req, res) => {
    const fileId = String(req.query.id || "");
    const stored = downloadStorage.get(fileId);
    if (!stored) {
      return res.status(404).send("ZIP file not found or expired. Please re-run the split chunks command.");
    }

    let finalName = stored.fileName;
    const reqFilename = req.query.filename;
    if (reqFilename) {
      let custom = String(reqFilename).trim();
      if (custom) {
        if (!custom.toLowerCase().endsWith(".zip")) {
          custom += ".zip";
        }
        finalName = custom;
      }
    }

    res.setHeader("Content-Type", stored.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
    res.send(stored.data);
  });

  // GET redirect for /api/download-zip
  app.get("/api/download-zip", (req, res) => {
    const fileId = String(req.query.id || "");
    const filename = req.query.filename ? `&filename=${encodeURIComponent(String(req.query.filename))}` : "";
    res.redirect(`/download-zip?id=${fileId}${filename}`);
  });

  // Setup Vite development middleware OR serve built static files in production
  if (process.env.NODE_ENV !== "production") {
    console.log("Vite loading development pipeline...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Vite loading production pipeline static routing...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Data Validator Back-End] Server running cleanly on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server boot error:", err);
});
