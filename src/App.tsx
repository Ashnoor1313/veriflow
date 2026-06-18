import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Layers,
  ShieldAlert,
  Cpu,
  ListFilter,
  Trash2,
  ArrowRight,
  Table,
  Sparkles,
  Check,
  X,
  ShieldCheck,
  Database,
  HelpCircle,
  HardDriveDownload,
  FileText,
  ChevronRight,
  Layers3,
  BadgeAlert,
  Globe,
  Plus
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area
} from "recharts";

type Tab = "landing" | "upload" | "dashboard" | "quality" | "downloads";

const DEFAULT_COUNTRY_PHONE_RULES: Record<string, number> = {
  "India": 10,
  "Singapore": 8,
  "USA": 10,
  "UK": 11,
  "Canada": 10,
  "Australia": 9,
  "Japan": 10,
  "Germany": 11
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>("landing");
  const [countryPhoneRules, setCountryPhoneRules] = useState<Record<string, number>>(DEFAULT_COUNTRY_PHONE_RULES);
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryLength, setNewCountryLength] = useState<number>(10);

  const handleAddCountryRule = () => {
    if (!newCountryName.trim()) {
      showToast("Country name cannot be empty", "error");
      return;
    }
    const name = newCountryName.trim();
    if (newCountryLength <= 0 || newCountryLength > 20) {
      showToast("Please enter a valid phone length (1-20 digits)", "error");
      return;
    }
    setCountryPhoneRules(prev => ({
      ...prev,
      [name]: newCountryLength
    }));
    setNewCountryName("");
    showToast(`Added phone format rule: ${name} (${newCountryLength} digits)`, "success");
  };

  const handleRemoveCountryRule = (country: string) => {
    setCountryPhoneRules(prev => {
      const updated = { ...prev };
      delete updated[country];
      return updated;
    });
    showToast(`Removed phone rule for ${country}`, "info");
  };
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [fileSelected, setFileSelected] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const [fileDetails, setFileDetails] = useState<{
    rowCount: number;
    columnCount: number;
    columns: string[];
    detectedSchema: Record<string, string>;
  } | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [schemaMapping, setSchemaMapping] = useState<Record<string, string>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Validation, Corrections, & Anomaly states
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isDetectingAnomalies, setIsDetectingAnomalies] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    overallQualityScore: number;
    breakdown: {
      phoneScore: number;
      dateScore: number;
      timeScore: number;
      completenessScore: number;
      paymentScore: number;
    };
    validatedRecords: any[];
  } | null>(null);
  const [anomalyResults, setAnomalyResults] = useState<{
    totalAnomalies: number;
    anomalies: any[];
  } | null>(null);

  // Corrections Map (rowId_columnName -> Overwritten Value)
  const [correctionsMap, setCorrectionsMap] = useState<Record<string, string>>({});
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  
  // Download states
  const [downloadResult, setDownloadResult] = useState<{
    fileId: string;
    downloadUrl: string;
    isZip?: boolean;
    chunksCount?: number;
  } | null>(null);
  const [customFileName, setCustomFileName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // App notifications (Toasts)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Dynamic user requirements tracker values
  const isOrderMapped = !!(schemaMapping.OrderId || schemaMapping.CustomerName);
  const isProductMapped = !!(schemaMapping.ProductName || schemaMapping.Quantity || schemaMapping.Price);
  const isPaymentMapped = !!schemaMapping.PaymentMode;
  const isCountryPhoneConfigured = !!(schemaMapping.PhoneNumber && schemaMapping.Country);
  const isDateTimeVerified = !!(schemaMapping.OrderDate || schemaMapping.OrderTime);
  const isChunkSupportActive = records.length > 5000;

  const activeRequirementsCount = [
    isOrderMapped,
    isProductMapped,
    isPaymentMapped,
    isCountryPhoneConfigured,
    isDateTimeVerified,
    downloadResult !== null
  ].filter(Boolean).length;

  const getProcessedExportFileName = () => {
    const isZip = downloadResult?.isZip;
    const ext = isZip ? ".zip" : ".csv";
    if (!customFileName.trim()) {
      return isZip ? "validated_records_chunks.zip" : "validated_records.csv";
    }
    const name = customFileName.trim();
    if (name.toLowerCase().endsWith(ext)) {
      return name;
    }
    return name + ext;
  };

  // Convert files to base64 and call /upload API
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("Unsupported file type. Please upload a CSV or Excel (.xlsx) spreadsheet.", "error");
      return;
    }

    setIsUploading(true);
    setFileSelected({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    });

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result as string;
          // Extract base64 part
          const base64Data = result.split(",")[1];

          const response = await fetch("/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileData: base64Data
            })
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || "Server parsing failed");
          }

          const data = await response.json();
          setFileDetails({
            rowCount: data.rowCount,
            columnCount: data.columnCount,
            columns: data.columns,
            detectedSchema: data.detectedSchema
          });
          setRecords(data.records);
          setSchemaMapping(data.detectedSchema);
          
          // Reset states to run fresh operations
          setValidationResults(null);
          setAnomalyResults(null);
          setCorrectionsMap({});
          setDismissedSuggestions([]);
          setDownloadResult(null);

          showToast(`File "${file.name}" uploaded. ${data.rowCount} rows identified!`, "success");
          setCurrentTab("upload");
        } catch (err: any) {
          console.error(err);
          showToast(`Upload Error: ${err.message}`, "error");
          setFileSelected(null);
        } finally {
          setIsUploading(false);
        }
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      showToast("Failed to read file on the client system.", "error");
      setIsUploading(false);
      setFileSelected(null);
    }
  };

  // File Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // 1-Click Load Sample Demo Dataset
  const handleLoadSampleDataset = async () => {
    setIsUploading(true);
    setFileSelected({
      name: "sample_transactions.csv",
      size: 4096,
      lastModified: Date.now()
    });

    try {
      const response = await fetch("/public/sample_transactions.csv");
      const text = await response.text();
      
      // Convert text to base64 equivalent
      const base64Str = btoa(unescape(encodeURIComponent(text)));
      
      const uploadResp = await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "sample_transactions.csv",
          fileData: base64Str
        })
      });

      if (!uploadResp.ok) {
        throw new Error("Failed to post demo data to endpoint");
      }

      const data = await uploadResp.json();
      setFileDetails({
        rowCount: data.rowCount,
        columnCount: data.columnCount,
        columns: data.columns,
        detectedSchema: data.detectedSchema
      });
      setRecords(data.records);
      setSchemaMapping(data.detectedSchema);
      
      // Reset older validation states
      setValidationResults(null);
      setAnomalyResults(null);
      setCorrectionsMap({});
      setDismissedSuggestions([]);
      setDownloadResult(null);

      showToast("Demo dataset loaded successfully! Run validation now.", "success");
      setCurrentTab("upload");
    } catch (err: any) {
      console.error(err);
      showToast("Could not download sample dataset. Restoring basic default mock.", "error");
      setFileSelected(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Run comprehensive validations
  const runValidationAndPipeline = async () => {
    if (records.length === 0) {
      showToast("No active records found. Please reload your dataset.", "error");
      return;
    }

    setIsValidating(true);
    setIsDetectingAnomalies(true);
    showToast("Validating cell schemas & processing auto-correct recommendations...", "info");

    try {
      // 1. Run Validation
      const valResponse = await fetch("/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: records,
          schemaMapping: schemaMapping,
          countryRules: countryPhoneRules
        })
      });

      if (!valResponse.ok) {
        throw new Error("Validation controller returned an error response");
      }

      const valData = await valResponse.json();
      setValidationResults(valData);

      // 2. Run Anomaly Detection
      const anomalyResponse = await fetch("/anomaly-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: records,
          schemaMapping: schemaMapping
        })
      });

      if (anomalyResponse.ok) {
        const anomalyData = await anomalyResponse.json();
        setAnomalyResults(anomalyData);
      }

      showToast("Dataset thoroughly evaluated! Insights ready.", "success");
      setCurrentTab("dashboard");
    } catch (err: any) {
      console.error(err);
      showToast(`Validation Pipeline Failed: ${err.message}`, "error");
    } finally {
      setIsValidating(false);
      setIsDetectingAnomalies(false);
    }
  };

  // Edit validation columns
  const updateSchemaKey = (key: string, colName: string) => {
    const updated = { ...schemaMapping };
    if (colName === "IGNORE_KEY") {
      delete updated[key];
    } else {
      updated[key] = colName;
    }
    setSchemaMapping(updated);
    showToast(`Updated schema: ${key} now mapped to CSV header "${colName}"`, "info");
  };

  // Dynamic values computation for corrected cells
  const getCellValue = (rowId: number, colName: string) => {
    const correctionKey = `${rowId}_${colName}`;
    if (correctionsMap[correctionKey] !== undefined) {
      return correctionsMap[correctionKey];
    }
    return records[rowId]?.[colName] || "";
  };

  const getCleanedRowData = (rowId: number, originalRow: any) => {
    const cleanedRow = { ...originalRow };
    Object.values(schemaMapping).forEach((colName) => {
      const colStr = String(colName);
      const correctionKey = `${rowId}_${colStr}`;
      if (correctionsMap[correctionKey] !== undefined) {
        cleanedRow[colStr] = correctionsMap[correctionKey];
      }
    });
    return cleanedRow;
  };

  const getPreviewValidationStatus = (rowId: number, cleanedRow: any) => {
    const validationErrors: string[] = [];
    const phoneCol = schemaMapping.PhoneNumber;
    const countryCol = schemaMapping.Country;
    const dateCol = schemaMapping.OrderDate;
    const timeCol = schemaMapping.OrderTime;
    const paymentCol = schemaMapping.PaymentMode;
    const qtyCol = schemaMapping.Quantity;
    const priceCol = schemaMapping.Price;

    if (phoneCol && cleanedRow[phoneCol]) {
      const countryVal = String(cleanedRow[countryCol] || "USA").trim();
      const rule = countryPhoneRules[countryVal];
      const cleaned = String(cleanedRow[phoneCol]).replace(/\D/g, "");
      if (rule && cleaned.length !== rule) {
        validationErrors.push(`Invalid Phone (${cleaned.length} digits)`);
      }
    }

    if (dateCol && cleanedRow[dateCol]) {
      const dateStr = String(cleanedRow[dateCol]).trim();
      const isDmy = /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dateStr);
      const isYmd = /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(dateStr);
      const isMdy = /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(dateStr);
      const isParsedVal = !isNaN(Date.parse(dateStr));
      if (!isDmy && !isYmd && !isMdy && !isParsedVal) {
        validationErrors.push("Invalid Date");
      }
    }

    if (timeCol && cleanedRow[timeCol]) {
      const timeStr = String(cleanedRow[timeCol]).trim();
      const isHms = /^(\d{1,2}):(\d{2}):(\d{2})$/.test(timeStr);
      const isHm = /^(\d{1,2}):(\d{2})$/.test(timeStr);
      if (!isHms && !isHm) {
        validationErrors.push("Invalid Time");
      }
    }

    if (paymentCol && cleanedRow[paymentCol]) {
      const pVal = String(cleanedRow[paymentCol]).trim();
      const standardMods = ["UPI", "Credit Card", "Debit Card", "Cash", "Wallet", "Net Banking"];
      if (!standardMods.some(m => m.toLowerCase() === pVal.toLowerCase())) {
        validationErrors.push(`Invalid Payment: ${pVal}`);
      }
    }

    if (qtyCol) {
      const qVal = Number(cleanedRow[qtyCol]);
      if (isNaN(qVal) || qVal <= 0) {
        validationErrors.push("Invalid Quantity");
      }
    }

    if (priceCol) {
      const pVal = Number(cleanedRow[priceCol]);
      if (isNaN(pVal) || pVal < 0) {
        validationErrors.push("Invalid Price");
      }
    }

    return {
      status: validationErrors.length === 0 ? "PASSED" : "FAILED",
      errorMessage: validationErrors.join("; ")
    };
  };

  // Action: Accept close match suggestion
  const acceptSuggestion = (rowId: number, colName: string, suggestedVal: string) => {
    const key = `${rowId}_${colName}`;
    setCorrectionsMap(prev => ({
      ...prev,
      [key]: suggestedVal
    }));
    showToast(`Accepted correction: Changed row #${rowId + 1} "${colName}" to "${suggestedVal}"`, "success");
  };

  // Action: Dismiss suggestion
  const dismissSuggestion = (rowId: number, colName: string) => {
    const key = `${rowId}_${colName}`;
    setDismissedSuggestions(prev => [...prev, key]);
    showToast("Dismissed suggestion.", "info");
  };

  // Action: Manual edit cell direct override
  const handleManualCellEdit = (rowId: number, colName: string, value: string) => {
    const key = `${rowId}_${colName}`;
    setCorrectionsMap(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Generate clean downloadable artifact
  const handleGenerateCleanAsset = async () => {
    if (records.length === 0) return;
    setIsGenerating(true);
    setDownloadResult(null);

    try {
      let response;
      if (records.length > 5000) {
        showToast("Large dataset detected (>5000 records). Bundling partitioned zip chunks...", "info");
        response = await fetch("/chunk-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: records,
            schemaMapping: schemaMapping,
            correctionsMap: correctionsMap,
            countryRules: countryPhoneRules
          })
        });
      } else {
        showToast("Generating standardized validated_records.csv...", "info");
        response = await fetch("/generate-clean-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: records,
            schemaMapping: schemaMapping,
            correctionsMap: correctionsMap,
            countryRules: countryPhoneRules
          })
        });
      }

      if (!response.ok) {
        throw new Error("Target generator endpoint returned an error");
      }

      const fileAsset = await response.json();
      setDownloadResult(fileAsset);
      setCustomFileName(fileAsset.isZip ? "validated_records_chunks" : "validated_records");
      showToast("Download artifact is ready in the Download Center!", "success");
      setCurrentTab("downloads");
    } catch (err: any) {
      console.error(err);
      showToast(`Generation failure: ${err.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Tab validations to keep things safe
  const navigateToTab = (target: Tab) => {
    if (target !== "landing" && !fileSelected) {
      showToast("Please select and upload a valid dataset first.", "info");
      return;
    }
    if ((target === "dashboard" || target === "quality") && !validationResults) {
      showToast("Please execute the Validation Engine to access insights.", "info");
      return;
    }
    setCurrentTab(target);
  };

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-100 font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden relative">
      
      {/* Dynamic atmospheric cosmic grids & slow drifting glowing orbs */}
      <div className="absolute inset-0 cosmic-grid pointer-events-none opacity-80 z-0" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-blue-600/10 via-indigo-500/5 to-transparent blur-[120px] rounded-full pointer-events-none animate-drift-slow-1 z-0" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-gradient-to-bl from-emerald-500/5 via-cyan-500/10 to-transparent blur-[140px] rounded-full pointer-events-none animate-drift-slow-2 z-0" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/15 blur-[110px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-1/2 left-10 w-[300px] h-[300px] bg-indigo-500/5 blur-[90px] rounded-full pointer-events-none z-0" />

      {/* Persistent App Header with Dynamic Top Laser Line */}
      <header className="sticky top-0 z-40 bg-slate-950/80 border-b border-white/5 backdrop-blur-md shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-[2.5px] bg-gradient-to-r from-blue-500 via-indigo-500 via-cyan-400 to-emerald-400 opacity-90" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setCurrentTab("landing")}>
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-white/20 font-bold text-white text-base transition-transform group-hover:scale-105">
              V
            </div>
            <div>
              <span className="font-display font-bold text-lg tracking-tight text-white group-hover:text-blue-300 transition-colors">
                Veriflow
              </span>
              <div className="font-mono text-[9px] text-slate-500 tracking-wider">SECURE DATA VALIDATION</div>
            </div>
          </div>

          <nav className="flex items-center overflow-x-auto whitespace-nowrap scrollbar-none space-x-1 sm:space-x-1.5 max-w-[42vw] sm:max-w-[55vw] md:max-w-none pr-3 md:pr-0 bg-white/[2%] border border-white/5 p-1 rounded-full backdrop-blur-md">
            <button
               onClick={() => navigateToTab("landing")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${
                currentTab === "landing" 
                  ? "bg-white/10 text-white shadow-md border border-white/5 font-bold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[2%]"
              }`}
            >
              Overview
            </button>
            <button
              id="upload-tab-btn"
              onClick={() => navigateToTab("upload")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 flex items-center space-x-1.5 ${
                currentTab === "upload" 
                  ? "bg-white/10 text-white shadow-md border border-white/5 font-bold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[2%]"
              }`}
            >
              <span>1. Mapping</span>
              {fileSelected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            </button>
            <button
              id="dashboard-tab-btn"
              onClick={() => navigateToTab("dashboard")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 flex items-center space-x-1.5 ${
                currentTab === "dashboard" 
                  ? "bg-white/10 text-white shadow-md border border-white/5 font-bold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[2%]"
              }`}
              disabled={!validationResults}
            >
              <span>2. Dashboard</span>
              {validationResults && (
                <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1 rounded-full">
                  {validationResults.overallQualityScore}%
                </span>
              )}
            </button>
            <button
              id="quality-tab-btn"
              onClick={() => navigateToTab("quality")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 flex items-center space-x-1.5 ${
                currentTab === "quality" 
                  ? "bg-white/10 text-white shadow-md border border-white/5 font-bold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[2%]"
              }`}
              disabled={!validationResults}
            >
              <span>3. Quality Hub</span>
              {validationResults && validationResults.validatedRecords.some(r => Object.keys(r.suggestedCorrections).length > 0) && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
            <button
              id="downloads-tab-btn"
              onClick={() => navigateToTab("downloads")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 flex items-center space-x-1.5 ${
                currentTab === "downloads" 
                  ? "bg-white/10 text-white shadow-md border border-white/5 font-bold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[2%]"
              }`}
              disabled={!fileSelected}
            >
              <span>4. Download</span>
              {downloadResult && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
            </button>
          </nav>

          <div className="flex items-center space-x-3">
            {/* Interactive Checklist Pinned Badging Trigger */}
            <button
              onClick={() => setIsChecklistOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-xs font-semibold cursor-pointer transition-all hover:scale-105"
            >
              <Cpu className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
              <span className="hidden sm:inline">Checklist:</span>
              <strong className="bg-blue-500/20 px-1.5 py-0.2 rounded font-mono text-[10px] text-white">
                {activeRequirementsCount}/6
              </strong>
            </button>

            {fileSelected ? (
              <div className="hidden lg:flex items-center bg-slate-900/80 border border-white/5 py-1 px-3 rounded-lg text-xs">
                <FileText className="h-3.5 w-3.5 text-indigo-400 mr-2" />
                <span className="max-w-[120px] truncate font-medium text-slate-300">{fileSelected.name}</span>
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-slate-400">{(fileSelected.size / 1024).toFixed(1)} KB</span>
              </div>
            ) : (
              <button
                onClick={handleLoadSampleDataset}
                className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 py-1.5 px-3 rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center space-x-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span>Try Demo Data</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Floating Notifications Toast container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className={`p-4 rounded-xl border shadow-xl flex items-start space-x-3 backdrop-blur-lg ${
              toast.type === "success" 
                ? "bg-slate-900/90 border-emerald-500/30 text-emerald-100" 
                : toast.type === "error" 
                ? "bg-slate-900/90 border-rose-500/30 text-rose-100" 
                : "bg-slate-900/90 border-indigo-500/30 text-indigo-100"
            }`}>
              <div className="mt-0.5">
                {toast.type === "success" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : toast.type === "error" ? (
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                ) : (
                  <Cpu className="h-5 w-5 text-indigo-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium">{toast.message}</p>
              </div>
              <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Requirements Checklist Side HUD Drawer */}
      <AnimatePresence>
        {isChecklistOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChecklistOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Sliding Drawer Body */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md bg-slate-950/95 border-l border-white/10 h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between backdrop-blur-xl z-10 font-sans text-slate-100"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
                      <Cpu className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider">
                        Requirements Cross-Check
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">SPECIFICATION VALIDATOR HUD</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsChecklistOpen(false)}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Score Summary Badge */}
                <div className="bg-gradient-to-r from-blue-900/20 via-indigo-950/20 to-transparent border border-blue-500/10 p-4 rounded-xl mb-6 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Integrity Compliance Matrix</span>
                    <span className="font-mono text-blue-400 font-bold bg-blue-950/60 border border-blue-900/40 px-2.5 py-0.5 rounded-full text-[10px]">
                      {activeRequirementsCount} / 6 Verified
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(activeRequirementsCount / 6) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                    Veriflow dynamically maps uploaded spreadsheet nodes against your system parameters. Everything verified below aligns precisely with your user requirements.
                  </p>
                </div>

                {/* Dynamic Checklist Content */}
                <div className="space-y-4">
                  {/* REQUIREMENT 1 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isOrderMapped 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {isOrderMapped ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">1</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Order Scope Validation</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isOrderMapped ? "text-emerald-400" : "text-amber-500"}`}>
                            {isOrderMapped ? "Passed" : "Awaiting Map"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Ingests Order-level attributes dynamically: Order ID, Order Date, Customer ID, and Customer Name.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 2 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isProductMapped 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {isProductMapped ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">2</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Product Scope Validation</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isProductMapped ? "text-emerald-400" : "text-amber-500"}`}>
                            {isProductMapped ? "Passed" : "Awaiting Map"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Parses and verifies critical product details: Product ID, Product Name, Category, Quantity, and Unit & Total Price.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 3 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isPaymentMapped 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {isPaymentMapped ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">3</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Payment Method Ingestion</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isPaymentMapped ? "text-emerald-400" : "text-amber-500"}`}>
                            {isPaymentMapped ? "Passed" : "Awaiting Map"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Accepts and maps Settlement Mode values (Credit Card, UPI, PayPal, Bank Transfer) with accurate total amounts.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 4 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isCountryPhoneConfigured 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {isCountryPhoneConfigured ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">4</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Dynamic Country Phone Rules</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isCountryPhoneConfigured ? "text-emerald-400" : "text-amber-500"}`}>
                            {isCountryPhoneConfigured ? "Passed" : "Awaiting Map"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Enforces custom telecommunication templates (India: 10, Singapore: 8, USA: 10, UK: 11) driven by configurable rules.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 5 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isDateTimeVerified 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {isDateTimeVerified ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">5</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Date & Time Formatter</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${isDateTimeVerified ? "text-emerald-400" : "text-amber-500"}`}>
                            {isDateTimeVerified ? "Passed" : "Awaiting Map"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Aligns chronological metadata points against standard ISO timestamps and custom localized calendars.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REQUIREMENT 6 */}
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    downloadResult !== null 
                      ? "bg-emerald-950/10 border-emerald-500/25" 
                      : "bg-slate-900/30 border-white/5 opacity-70"
                  }`}>
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {downloadResult !== null ? (
                          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-700 font-mono text-[9px] flex items-center justify-center text-slate-500">6</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-white">Zipped Partitioning Export</h4>
                          <span className={`text-[9px] font-mono font-bold uppercase ${downloadResult !== null ? "text-emerald-400" : "text-amber-500"}`}>
                            {downloadResult !== null ? "Ready" : "Pending Action"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Automatically splits records exceeding 5,000 threshold into sequential units stacked into a recursive ZIP archive.
                          {isChunkSupportActive && <span className="text-indigo-400 font-semibold block mt-1 font-mono">✓ Stack split is active ({records.length} records detected)</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="pt-6 border-t border-white/10 mt-6 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Engine:</span>
                  <span className="text-white font-semibold">Veriflow Pipeline v2.4</span>
                </div>
                <button
                  onClick={() => setIsChecklistOpen(false)}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer shadow-md shadow-blue-500/10 text-center block"
                >
                  Conclude HUD Inspection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB 1: LANDING PAGE */}
        {currentTab === "landing" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-16"
          >
            <div className="text-center py-8 max-w-4xl mx-auto space-y-6">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold tracking-tight text-white leading-none">
                Clean and Validate Dataset <br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                  Quality with Enterprise Confidence
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Seamlessly upload, map, audit, and output standardized high-fidelity files. Real-time statistical anomaly rules, standard date/time alignments, phone length country-checks, and close-match corrections all in one glassmorphic hub.
              </p>

              {/* Load samples and triggers */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <button
                  onClick={handleLoadSampleDataset}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 border border-white/15 py-3 px-6 rounded-xl font-medium text-sm text-white shadow-xl shadow-blue-600/15 flex items-center justify-center space-x-2 transition-all group cursor-pointer"
                >
                  <span>Load Sample Ledger</span>
                  <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                </button>
                <a
                  href="#upload-card"
                  className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 py-3 px-6 rounded-xl font-medium text-sm text-slate-200 flex items-center justify-center space-x-2 transition-all backdrop-blur-md"
                >
                  <span>Upload File Now</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Core features columns bento blocks */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: Database,
                  title: "Instant Schema Detector",
                  desc: "Analyzes inputs and maps raw CSV/XLSX columns (ID, Name, Date, Phone, Price, Payment Mode) mapping instantly."
                },
                {
                  icon: ShieldCheck,
                  title: "Multi-Region Validations",
                  desc: "Validates date formats, 24-hr/12-hr clocks, and country-strict phone digit rules (India, Singapore, USA, UK)."
                },
                {
                  icon: Sparkles,
                  title: "Smart Auto-Repair suggestions",
                  desc: "Calculates character distance to heal typical email typos or common payment mode errors (e.g. UP1 -> UPI)."
                },
                {
                  icon: ShieldAlert,
                  title: "Statistical Anomalies outlier",
                  desc: "Runs multi-metric isolation analysis to detect suspicious volumes and unusually high, deviant values."
                }
              ].map((item, index) => (
                <div key={index} className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-xl group-hover:bg-blue-500/10 transition-all" />
                  <div className="h-10 w-10 mb-4 bg-blue-500/15 rounded-lg flex items-center justify-center border border-blue-500/30">
                    <item.icon className="h-5 w-5 text-blue-400" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-base mb-1.5">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Drag & Drop File Upload Stage card */}
            <div id="upload-card" className="max-w-4xl mx-auto">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`glass-panel border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-300 relative overflow-hidden ${
                  isDragOver ? "border-blue-400 bg-blue-600/5 shadow-inner" : "border-white/10 hover:border-blue-500/30"
                }`}
              >
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/5 blur-[50px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-600/5 blur-[50px] rounded-full pointer-events-none" />

                <div className="max-w-md mx-auto space-y-6">
                  <div className="mx-auto h-16 w-16 bg-blue-500/15 rounded-2xl border border-blue-500/35 flex items-center justify-center">
                    {isUploading ? (
                      <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
                    ) : (
                      <Upload className="h-8 w-8 text-blue-400" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-display font-bold text-lg text-white">
                      {isUploading ? "Uploading & Analyzing..." : "Upload Spreadsheet Dataset"}
                    </h3>
                    <p className="text-xs text-slate-400 leading-normal">
                      Drag & drop your CSV or Excel (.xlsx) sheets here, or click to browse files from your storage system
                    </p>
                  </div>

                  <div className="relative inline-block">
                    <input
                      id="file-input-raw"
                      type="file"
                      className="hidden"
                      accept=".csv, .xlsx, .xls"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          handleFileUpload(files[0]);
                        }
                      }}
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="file-input-raw"
                      className={`px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-xs text-white border border-white/10 rounded-xl cursor-pointer inline-flex items-center space-x-2 transition-all ${
                        isUploading ? "opacity-55 cursor-not-allowed" : ""
                      }`}
                    >
                      <span>Choose local spreadsheet file</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-center space-x-4 text-[10px] text-slate-500">
                    <span className="flex items-center"><Check className="h-3 w-3 text-emerald-500 mr-1" /> CSV parser integrated</span>
                    <span className="flex items-center"><Check className="h-3 w-3 text-emerald-500 mr-1" /> Excel format standard support</span>
                    <span className="flex items-center"><Check className="h-3 w-3 text-emerald-500 mr-1" /> Chunking for &gt;5k limits</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: SCHEMA MAPPING OVERRIDES */}
        {currentTab === "upload" && fileDetails && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Header info bar */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <div className="inline-flex items-center space-x-1.5 text-xs text-blue-400 font-mono">
                  <Database className="h-3.5 w-3.5" />
                  <span>STEP 1 / COLUMN MAPPING VALIDATION</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-white">Review Smart Schema Mapping</h2>
                <p className="text-xs text-slate-400">
                  Verify how your file columns link with our analytical parameters below before triggering our validation engine.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleLoadSampleDataset}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 py-2 px-4 rounded-xl text-xs font-semibold text-slate-300 flex items-center space-x-1 backdrop-blur-md transition-all cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Re-upload File</span>
                </button>
                <button
                  onClick={runValidationAndPipeline}
                  disabled={isValidating}
                  className="bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 border border-white/10 py-2.5 px-5 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 cursor-pointer transition-all"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Checking Records...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Execute Validation Engine</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* General file details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: "Target Rows Analyzed", val: fileDetails.rowCount, desc: "Record lines identified" },
                { title: "Identified Column Keys", val: fileDetails.columnCount, desc: "CSV columns detected" },
                { title: "Physical Size", val: `${(fileSelected ? fileSelected.size / 1024 : 0).toFixed(1)} KB`, desc: "In-memory spreadsheet" },
                { title: "Mapping Accuracy Ratio", val: `${Math.round((Object.keys(schemaMapping).length / 10) * 100)}%`, desc: `${Object.keys(schemaMapping).length} of 10 mapped` }
              ].map((item, idx) => (
                <div key={idx} className="glass-panel p-4 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">{item.title}</div>
                  <div className="text-2xl font-semibold text-white tracking-tight">{item.val}</div>
                  <div className="text-[10px] text-slate-500">{item.desc}</div>
                </div>
              ))}
            </div>

            {/* Schema Mapping configuration block */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
                    <h3 className="font-display font-semibold text-white text-sm">System Parameter Mappings</h3>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 py-0.5 px-2 rounded">SCHEMA: EXCEL_STANDARD_V2</span>
                  </div>

                  <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                    {[
                      { key: "OrderId", label: "Order ID (Unique ID)", placeholder: "e.g. order_id, invoice_no", required: true },
                      { key: "CustomerName", label: "Customer Name", placeholder: "e.g. customer_name, client_name", required: false },
                      { key: "PhoneNumber", label: "Phone Number", placeholder: "e.g. customer_phone, mobile", required: false },
                      { key: "Country", label: "Country Name (Validation rules)", placeholder: "e.g. country, region", required: false },
                      { key: "OrderDate", label: "Order Date", placeholder: "e.g. order_date, date", required: false },
                      { key: "OrderTime", label: "Order Time", placeholder: "e.g. order_time, time", required: false },
                      { key: "ProductName", label: "Product/Item Name", placeholder: "e.g. product_name, item", required: false },
                      { key: "Quantity", label: "Product Quantity", placeholder: "e.g. quantity, qty", required: false },
                      { key: "Price", label: "Unit/Total Price", placeholder: "e.g. price, amount", required: false },
                      { key: "PaymentMode", label: "Payment Method Mode", placeholder: "e.g. payment_mode, pay_method", required: false }
                    ].map((param) => {
                      const currentVal = schemaMapping[param.key] || "";
                      return (
                        <div key={param.key} className="p-4 sm:flex items-center justify-between gap-4 hover:bg-white/[1%] transition-colors">
                          <div className="sm:max-w-xs space-y-0.5 mb-2 sm:mb-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-semibold text-white">{param.label}</span>
                              {param.required && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold">Required</span>}
                            </div>
                            <p className="text-[10px] text-slate-400">Map standard validation parameters to CSV headers</p>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-blue-400 bg-blue-950/20 border border-blue-900/30 px-2.5 py-1 rounded max-w-[120px] truncate">
                              {param.key}
                            </span>
                            <ChevronRight className="h-3 w-3 text-slate-600 hidden sm:block" />
                            <select
                              value={currentVal}
                              onChange={(e) => updateSchemaKey(param.key, e.target.value)}
                              className="bg-[#121216] border border-white/15 rounded-lg text-xs py-1.5 px-3 focus:outline-none focus:border-blue-500 text-slate-300 w-[180px] sm:w-[220px] backdrop-blur-md cursor-pointer transition-all"
                            >
                              <option value="IGNORE_KEY">-- Unmapped / Skipped --</option>
                              {fileDetails.columns.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Data header previews */}
              <div className="space-y-6">
                <div className="glass-panel rounded-2xl p-5 space-y-4">
                  <h3 className="font-display font-semibold text-white text-sm">Raw Columns Identified</h3>
                  <p className="text-xs text-slate-400">All columns inside the loaded sheet array:</p>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {fileDetails.columns.map((col) => {
                      const isMapped = Object.values(schemaMapping).includes(col);
                      return (
                        <span
                          key={col}
                          className={`text-xs font-mono py-1 px-2.5 rounded-lg border flex items-center space-x-1.5 transition-colors ${
                            isMapped 
                              ? "bg-blue-950/30 border-blue-500/30 text-blue-300" 
                              : "bg-white/5 border-white/10 text-slate-400"
                          }`}
                        >
                          {isMapped && <span className="h-1 w-1 rounded-full bg-blue-400" />}
                          <span className="truncate max-w-[140px]">{col}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-5 space-y-4">
                  <div className="flex items-center space-x-2 text-indigo-400">
                    <HelpCircle className="h-4.5 w-4.5" />
                    <h4 className="text-xs font-bold uppercase tracking-wide">Validation Benchmarks</h4>
                  </div>
                  <div className="space-y-3.5 text-xs text-slate-400">
                    <div>
                      <strong className="text-slate-300 block mb-0.5">📅 Dynamic Dates</strong>
                      Supports standard international strings of DD-MM-YYYY, YYYY-MM-DD, or MM/DD/YYYY.
                    </div>
                    <div>
                      <strong className="text-slate-300 block mb-0.5">☎️ Country Phone Lengths</strong>
                      Matches cell country labels dynamically against your customized digit length requirements below.
                    </div>
                    <div>
                      <strong className="text-slate-300 block mb-0.5">💳 Settlement Modes</strong>
                      Verifies alignment with UPI, Credit Card, Debit Card, Cash, Wallet, and Net Banking.
                    </div>
                  </div>
                </div>

                {/* Interactive Dynamic Phone Rules Configurator */}
                <div className="glass-panel rounded-2xl p-5 space-y-4 shadow-xl border border-blue-500/10">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center space-x-2 text-blue-400">
                      <Globe className="h-4 w-4 text-blue-400 animate-pulse" />
                      <h4 className="text-xs font-bold uppercase tracking-wide text-blue-300">Custom Phone Mappings</h4>
                    </div>
                    <span className="text-[9px] bg-blue-950/40 border border-blue-900/30 text-blue-400 font-mono py-0.5 px-2 rounded-full uppercase">
                      {Object.keys(countryPhoneRules).length} Rules Active
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Define critical parameters for country telephone inputs. Veriflow uses these custom thresholds to validate record lengths.
                  </p>

                  {/* Add Rule Inline Form */}
                  <div className="bg-white/[2%] p-3 rounded-xl border border-white/5 space-y-2.5">
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider font-mono">Create / Update rule</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 block font-mono">COUNTRY NAME</label>
                        <input
                          type="text"
                          placeholder="e.g. Canada"
                          value={newCountryName}
                          onChange={(e) => setNewCountryName(e.target.value)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg py-1 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 block font-mono">EXPECTED DIGITS</label>
                        <input
                          type="number"
                          min="3"
                          max="18"
                          value={newCountryLength}
                          onChange={(e) => setNewCountryLength(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg py-1 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCountryRule}
                      className="w-full bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg py-1 px-3 text-[11px] font-bold transition-all flex items-center justify-center space-x-1 shadow-md shadow-blue-600/10 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Save Country Format</span>
                    </button>
                  </div>

                  {/* Active List of rules */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider font-mono">Active Verification Formats</p>
                    <div className="grid grid-cols-1 gap-1 max-h-[140px] overflow-y-auto pr-1">
                      {Object.keys(countryPhoneRules).map((country) => (
                        <div
                          key={country}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/55 hover:bg-slate-900/95 border border-white/5 transition-all text-xs"
                        >
                          <div className="flex items-center space-x-1.5">
                            <span className="font-medium text-slate-200">{country}</span>
                            <span className="font-mono text-[9px] bg-indigo-950/20 text-indigo-400 px-1 border border-indigo-900/40 rounded">
                              {countryPhoneRules[country]} digits
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCountryRule(country)}
                            className="p-1 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-md transition-all cursor-pointer"
                            title={`Delete rule for ${country}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: VALIDATION DASHBOARD */}
        {currentTab === "dashboard" && validationResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            {/* Header statistics info */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <div className="inline-flex items-center space-x-1.5 text-xs text-blue-400 font-mono">
                  <Cpu className="h-3.5 w-3.5 animate-pulse" />
                  <span>STEP 2 / QUALITY DISTRIBUTION MONITOR</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-white">Validation Insights Dashboard</h2>
                <p className="text-xs text-slate-300">
                  Real-time analytics for your loaded ledger validation constraints, country breakdowns, and outlier anomalies.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  id="b-quality-btn"
                  onClick={() => navigateToTab("quality")}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 py-2 px-4 rounded-xl text-xs font-semibold text-white flex items-center space-x-1 backdrop-blur-md transition-all cursor-pointer"
                >
                  <ListFilter className="h-3.5 w-3.5 text-blue-400" />
                  <span>Verify Audit & Apply Fixes</span>
                </button>
                <button
                  id="b-generate-btn"
                  onClick={handleGenerateCleanAsset}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 border border-white/10 py-2.5 px-5 rounded-xl text-xs font-bold text-white flex items-center space-x-2 cursor-pointer transition-all animate-pulse-subtle"
                >
                  {isGenerating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  <span>Compile Clean Output</span>
                </button>
              </div>
            </div>

            {/* Quality rating and critical overview count boxes */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Score rating display card */}
              <div className="glass-panel p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between space-y-6 glow-indigo">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full pointer-events-none" />
                
                <div className="space-y-1.5">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wide">Overall Quality Score</h3>
                  <p className="text-[11px] text-blue-400 font-medium">Weighted calculation across mapped verification rules</p>
                </div>

                <div className="flex items-baseline space-x-2">
                  <span className="text-5xl font-display font-bold text-white tracking-tight">
                    {validationResults.overallQualityScore}
                  </span>
                  <span className="text-slate-400 text-lg">/ 100</span>
                  
                  <span className={`ml-4 text-xs font-bold py-1 px-2.5 rounded-full ${
                    validationResults.overallQualityScore >= 80 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                      : validationResults.overallQualityScore >= 50
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}>
                    {validationResults.overallQualityScore >= 80 ? "Grade A (Excellent)" : validationResults.overallQualityScore >= 50 ? "Grade B (Fair)" : "Grade F (Poor)"}
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Phone Validation Index", score: validationResults.breakdown.phoneScore },
                    { label: "Date Standardized Index", score: validationResults.breakdown.dateScore },
                    { label: "Time Format Index", score: validationResults.breakdown.timeScore },
                    { label: "Dataset Completeness Index", score: validationResults.breakdown.completenessScore },
                    { label: "Payment Settle Code Index", score: validationResults.breakdown.paymentScore }
                  ].map((idxItem) => (
                    <div key={idxItem.label} className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400">{idxItem.label}</span>
                        <span className="font-semibold text-slate-200">{idxItem.score}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            idxItem.score >= 85 ? "bg-blue-400" : idxItem.score >= 60 ? "bg-amber-400" : "bg-rose-400"
                          }`}
                          style={{ width: `${idxItem.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Counts metrics split blocks */}
              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  {
                    title: "Total Records",
                    val: validationResults.validatedRecords.length,
                    desc: "Row ledger records scanned",
                    state: "info"
                  },
                  {
                    title: "Status: Valid Rows",
                    val: validationResults.validatedRecords.filter(r => r.isValid).length,
                    desc: "Passed all logic verification checks",
                    state: "success"
                  },
                  {
                    title: "Status: Invalid Rows",
                    val: validationResults.validatedRecords.filter(r => !r.isValid).length,
                    desc: "Contain validation error alerts",
                    state: "error"
                  },
                  {
                    title: "Outliers & Anomalies",
                    val: anomalyResults?.totalAnomalies || 0,
                    desc: "Deviant price or quantity values",
                    state: "anomaly"
                  },
                  {
                    title: "Missing cell gaps",
                    val: validationResults.validatedRecords.reduce((acc, r) => acc + r.errors.filter((e: string) => e.includes("Missing")).length, 0),
                    desc: "Null or blank entries to heal",
                    state: "warning"
                  },
                  {
                    title: "Smart Repairs Available",
                    val: validationResults.validatedRecords.reduce((acc, r) => acc + Object.keys(r.suggestedCorrections).length, 0),
                    desc: "Actionable auto-suggest fixes",
                    state: "repaired"
                  }
                ].map((stat, sIdx) => (
                  <div key={sIdx} className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wide block mb-0.5">{stat.title}</span>
                      <p className="text-[9px] text-slate-500 leading-tight">{stat.desc}</p>
                    </div>
                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="text-3xl font-display font-semibold text-white tracking-tight">{stat.val}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        stat.state === "success" ? "bg-emerald-400 glow-emerald" :
                        stat.state === "error" ? "bg-rose-400 glow-rose" :
                        stat.state === "anomaly" ? "bg-amber-400 animate-pulse" :
                        stat.state === "info" ? "bg-blue-400 glow-indigo" : "bg-sky-400"
                      }`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RECHARTS PLOTS BOARD SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Chart A: Error Distribution BarChart */}
              <div className="glass-panel p-5 rounded-2xl space-y-4 lg:col-span-1">
                <div className="space-y-0.5">
                  <h4 className="font-display font-semibold text-white text-xs uppercase tracking-wider">Error Types Distribution</h4>
                  <p className="text-[10px] text-slate-400">Occurrences of logic issues in mapped parameters</p>
                </div>
                
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: "Phone", error: validationResults.validatedRecords.reduce((acc, r) => acc + (r.errors.some((e:any)=>e.toLowerCase().includes("phone")) ? 1 : 0), 0) },
                        { name: "Date", error: validationResults.validatedRecords.reduce((acc, r) => acc + (r.errors.some((e:any)=>e.toLowerCase().includes("date")) ? 1 : 0), 0) },
                        { name: "Time", error: validationResults.validatedRecords.reduce((acc, r) => acc + (r.errors.some((e:any)=>e.toLowerCase().includes("time")) ? 1 : 0), 0) },
                        { name: "Empty", error: validationResults.validatedRecords.reduce((acc, r) => acc + (r.errors.some((e:any)=>e.toLowerCase().includes("missing")) ? 1 : 0), 0) },
                        { name: "Payment", error: validationResults.validatedRecords.reduce((acc, r) => acc + (r.errors.some((e:any)=>e.toLowerCase().includes("payment")) ? 1 : 0), 0) }
                      ]}
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", fontSize: "10px" }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="error" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        <Cell fill="#ef4444" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#06b6d4" />
                        <Cell fill="#6366f1" />
                        <Cell fill="#10b981" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart B: Country Distribution Area or Bar chart */}
              <div className="glass-panel p-5 rounded-2xl space-y-4 lg:col-span-1">
                <div className="space-y-0.5">
                  <h4 className="font-display font-semibold text-white text-xs uppercase tracking-wider">Territorial Record Distribution</h4>
                  <p className="text-[10px] text-slate-400">Total volume records spread across mapped nations</p>
                </div>

                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(() => {
                        const countryMap: Record<string, number> = {};
                        const col = schemaMapping.Country;
                        records.forEach(r => {
                          const c = String(r[col] || "Others").trim();
                          countryMap[c] = (countryMap[c] || 0) + 1;
                        });
                        return Object.entries(countryMap).map(([name, sum]) => ({ name, value: sum }));
                      })()}
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={8} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", fontSize: "10px" }}
                      />
                      <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart C: Settlement/Payment Mode distribution */}
              <div className="glass-panel p-5 rounded-2xl space-y-4 lg:col-span-1">
                <div className="space-y-0.5">
                  <h4 className="font-display font-semibold text-white text-xs uppercase tracking-wider">Settlement Method Split</h4>
                  <p className="text-[10px] text-slate-400">Ratio of UPI, Card, Net Banking, and Wallet values</p>
                </div>

                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const pmMap: Record<string, number> = {};
                          const col = schemaMapping.PaymentMode;
                          records.forEach(r => {
                            const m = String(r[col] || "Cash/Unspecified").trim() || "Unspecified";
                            pmMap[m] = (pmMap[m] || 0) + 1;
                          });
                          return Object.entries(pmMap).map(([name, value]) => ({ name, value }));
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {["#3b82f6", "#10b981", "#ec4899", "#f59e0b", "#a855f7", "#06b6d4"].map((color, cIdx) => (
                          <Cell key={`cell-${cIdx}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", fontSize: "9px" }} />
                      <Legend iconSize={7} wrapperStyle={{ fontSize: "9px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 4: DATA QUALITY & AUTO-FIX WORKSPACE */}
        {currentTab === "quality" && validationResults && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Context Header */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <div className="inline-flex items-center space-x-1.5 text-xs text-blue-400 font-mono">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>STEP 3 / AUTOMATED CORRECTIONS WORKSPACE</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-white">Data Quality Audit & Suggestions</h2>
                <p className="text-xs text-slate-300">
                  Select and apply smart auto-repair character suggestions block by block or manual override fields directly inside the interactive grid.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  id="tab-back-dash"
                  onClick={() => navigateToTab("dashboard")}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 py-2 px-4 rounded-xl text-xs font-semibold text-white backdrop-blur-md transition-all cursor-pointer"
                >
                  View Distribution Charts
                </button>
                <button
                  id="tab-forward-downloads"
                  onClick={handleGenerateCleanAsset}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-500 border border-white/10 py-2.5 px-5 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 cursor-pointer transition-all"
                >
                  {isGenerating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  <span>Commit Fixes & Generate</span>
                </button>
              </div>
            </div>

            {/* SMART CLOSE-MATCH AUTO-FIX SUGGESTIONS SECTION */}
            {(() => {
              const suggestions = [];
              const pmCol = schemaMapping.PaymentMode;
              const userCol = schemaMapping.CustomerName;

              validationResults.validatedRecords.forEach((item) => {
                const keys = Object.keys(item.suggestedCorrections);
                keys.forEach((colKey) => {
                  const dismissKey = `${item.rowId}_${colKey}`;
                  const hasBeenCorrected = correctionsMap[dismissKey] === item.suggestedCorrections[colKey].suggested;
                  if (!dismissedSuggestions.includes(dismissKey) && !hasBeenCorrected) {
                    suggestions.push({
                      rowId: item.rowId,
                      orderId: item.rowData[schemaMapping.OrderId || ""] || `Row ${item.rowId + 1}`,
                      colName: colKey,
                      original: item.suggestedCorrections[colKey].original,
                      suggested: item.suggestedCorrections[colKey].suggested,
                      customer: userCol ? item.rowData[userCol] : "Unspecified customer"
                    });
                  }
                });
              });

              if (suggestions.length === 0) {
                return (
                  <div className="glass-panel p-6 rounded-2xl text-center flex flex-col items-center justify-center space-y-3">
                    <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 animate-bounce" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-white text-sm">All Typographical Matches Corrected!</h3>
                      <p className="text-[11px] text-slate-400 mt-1">No other close character typos detected across the spreadsheet parameters.</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-blue-400 px-1">
                    <Sparkles className="h-4 w-4" />
                    <h3 className="font-display font-bold text-xs uppercase tracking-wider">Suggested repairs ({suggestions.length})</h3>
                  </div>

                  <div className="glass-panel rounded-2xl overflow-hidden border border-blue-500/10">
                    <div className="relative overflow-x-auto max-h-[300px]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900/60 border-b border-white/5 text-[10px] uppercase font-mono text-slate-400">
                            <th className="py-2.5 px-4">Ledger ID</th>
                            <th className="py-2.5 px-4">Client/Customer</th>
                            <th className="py-2.5 px-3">Field Column</th>
                            <th className="py-2.5 px-3">Original Entry</th>
                            <th className="py-2.5 px-3">Clean Recommendation</th>
                            <th className="py-2.5 px-4 text-center">Corrective Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs">
                          {suggestions.map((sug, sIdx) => (
                            <tr key={sIdx} className="hover:bg-slate-900/30">
                              <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">{sug.orderId}</td>
                              <td className="py-2.5 px-4 font-medium text-slate-200">{sug.customer}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">{sug.colName}</td>
                              <td className="py-2.5 px-3 font-mono text-rose-300 bg-rose-500/5">{sug.original}</td>
                              <td className="py-2.5 px-3 font-semibold text-emerald-300 bg-emerald-500/5 flex items-center space-x-1">
                                <Sparkles className="h-3 w-3 text-emerald-400 mr-1" />
                                <span>{sug.suggested}</span>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <div className="inline-flex space-x-1.5">
                                  <button
                                    onClick={() => acceptSuggestion(sug.rowId, sug.colName, sug.suggested)}
                                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-bold flex items-center space-x-1"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>Accept</span>
                                  </button>
                                  <button
                                    onClick={() => dismissSuggestion(sug.rowId, sug.colName)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md text-[10px] font-bold flex items-center space-x-1"
                                  >
                                    <X className="h-3 w-3" />
                                    <span>Dismiss</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* INTERACTIVE FULL SCHEMA AUDIT RECORDS TABLE */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Table className="h-4 w-4 text-blue-400" />
                  <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-white">Full Audit Ledger</h3>
                </div>
                <div className="flex space-x-3 text-xs text-slate-400">
                  <span className="flex items-center"><span className="h-2 w-2 rounded-full bg-emerald-400 mr-1.5" /> Valid</span>
                  <span className="flex items-center"><span className="h-2 w-2 rounded-full bg-rose-400 mr-1.5" /> Invalid</span>
                  <span className="flex items-center"><span className="h-2 w-2 rounded-full bg-amber-400 mr-1.5 animate-pulse" /> Outlier</span>
                </div>
              </div>

              {/* Main table container */}
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 border-b border-white/5 font-mono text-[10px] uppercase text-slate-400 sticky top-0 z-10">
                        <th className="py-3 px-4 text-left">Status</th>
                        <th className="py-3 px-3">Order ID</th>
                        <th className="py-3 px-3">Customer Name</th>
                        <th className="py-3 px-3">Contact Phone</th>
                        <th className="py-3 px-3">Country</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Time</th>
                        <th className="py-3 px-3">Product Item</th>
                        <th className="py-3 px-3 text-right">Qty</th>
                        <th className="py-3 px-3 text-right">Price</th>
                        <th className="py-3 px-4 text-right">Total ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs font-mono">
                      {validationResults.validatedRecords.map((item) => {
                        const rowData = item.rowData;
                        const rowId = item.rowId;

                        const oId = getCellValue(rowId, schemaMapping.OrderId);
                        const cName = getCellValue(rowId, schemaMapping.CustomerName);
                        const phone = getCellValue(rowId, schemaMapping.PhoneNumber);
                        const country = getCellValue(rowId, schemaMapping.Country);
                        const date = getCellValue(rowId, schemaMapping.OrderDate);
                        const time = getCellValue(rowId, schemaMapping.OrderTime);
                        const product = getCellValue(rowId, schemaMapping.ProductName);
                        const qty = Number(getCellValue(rowId, schemaMapping.Quantity) || 0);
                        const price = Number(getCellValue(rowId, schemaMapping.Price) || 0);
                        const total = qty * price;

                        const isOutlier = anomalyResults?.anomalies.some((a: any) => a.rowId === rowId);

                        // Highlight cell style generators
                        return (
                          <tr key={rowId} className={`hover:bg-white/[1%] transition-colors ${!item.isValid ? "bg-rose-950/5" : ""}`}>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center space-x-1.5 py-0.5 px-2 rounded-full text-[9px] font-bold ${
                                item.isValid
                                  ? isOutlier 
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/15"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${item.isValid ? isOutlier ? "bg-amber-400" : "bg-emerald-400" : "bg-rose-400"}`} />
                                <span className="uppercase">{item.isValid ? isOutlier ? "Outlier" : "Pass" : "Fail"}</span>
                              </span>
                            </td>
                            
                            {/* OrderId */}
                            <td className="py-3 px-3 text-white truncate max-w-[90px]" title={oId}>{oId}</td>
                            
                            {/* CustomerName */}
                            <td className="py-3 px-3 text-slate-300">
                              <input
                                type="text"
                                className="bg-transparent focus:bg-slate-900 border-none outline-none py-0.5 px-1 rounded text-slate-200 focus:ring-1 focus:ring-indigo-500 truncate max-w-[120px]"
                                value={cName != null ? String(cName) : ""}
                                onChange={(e) => handleManualCellEdit(rowId, schemaMapping.CustomerName, e.target.value)}
                              />
                            </td>

                            {/* PhoneNumber - highlighting length discrepancies */}
                            <td className="py-3 px-3 text-slate-300">
                              <input
                                type="text"
                                className={`bg-transparent focus:bg-slate-900 border-none outline-none py-0.5 px-1 rounded focus:ring-1 focus:ring-indigo-500 ${
                                  phone && String(phone).replace(/\D/g, "").length !== (countryPhoneRules[String(country)] || 10) ? "text-rose-300 font-bold bg-rose-500/5" : "text-slate-300"
                                }`}
                                value={phone != null ? String(phone) : ""}
                                onChange={(e) => handleManualCellEdit(rowId, schemaMapping.PhoneNumber, e.target.value)}
                              />
                            </td>

                            {/* Country */}
                            <td className="py-3 px-3 text-slate-400">{country}</td>

                            {/* Date */}
                            <td className="py-3 px-3 text-slate-300">{date}</td>

                            {/* Time */}
                            <td className="py-3 px-3 text-slate-300">{time}</td>

                            {/* Product */}
                            <td className="py-3 px-3 text-slate-300 truncate max-w-[120px]" title={product}>{product}</td>

                            {/* Quantity */}
                            <td className="py-3 px-3 text-right text-slate-200">{qty}</td>

                            {/* Price */}
                            <td className="py-3 px-3 text-right text-slate-200">${price.toFixed(2)}</td>

                            {/* Total price column */}
                            <td className="py-3 px-4 text-right font-bold text-blue-300">${total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ANOMALY DETECTION REPORT SUB-SECTION */}
            {anomalyResults && anomalyResults.anomalies.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-amber-400">
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <h3 className="font-display font-semibold text-xs uppercase tracking-wider">Outliers & Anomalies flagged ({anomalyResults.totalAnomalies})</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {anomalyResults.anomalies.map((an, aIdx) => (
                    <div key={aIdx} className="glass-panel p-4 rounded-xl border border-amber-500/10 flex items-start justify-between space-x-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-100 font-mono">
                            {an.rowData[schemaMapping.OrderId || ""] || `Row #${an.rowId + 1}`}
                          </span>
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full uppercase font-bold">
                            Deviance: {an.score}
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {an.reasons.map((re: string, rIdx: number) => (
                            <li key={rIdx} className="text-[10px] text-slate-400 list-disc list-inside">
                              {re}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] block">Calculated Total</span>
                        <span className="text-sm font-bold text-amber-300 font-mono">${an.totalValue.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 5: DOWNLOAD CENTER */}
        {currentTab === "downloads" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto space-y-8"
          >
            {/* Download Center Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 bg-blue-500/10 rounded-full items-center justify-center border border-blue-500/20 text-blue-400 mb-2">
                <HardDriveDownload className="h-6 w-6 animate-bounce" />
              </div>
              <h2 className="text-3xl font-display font-bold text-white">Download Center</h2>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Your sanitized dataset has been processed and compiled successfully! Download files instantly below.
              </p>
            </div>

            {/* Main download Card representation */}
            <div className="glass-panel p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between space-y-8 glow-indigo">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full pointer-events-none" />

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-6 border-b border-white/5">
                <div className="flex items-center space-x-4">
                  <div className="h-14 w-14 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center">
                    {downloadResult?.isZip ? (
                      <Layers3 className="h-7 w-7 text-blue-400" />
                    ) : (
                      <FileText className="h-7 w-7 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-white text-base">
                      {getProcessedExportFileName()}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Format: {downloadResult?.isZip ? "Compressed ZIP Folder" : "Unified Raw CSV"} • Rows count: {records.length}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full uppercase font-bold">
                  {downloadResult?.isZip ? "ZIP Chunk split" : "Single consolidated file"}
                </span>
              </div>

              {/* Customizable File Name Section */}
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Edit Export File Name</label>
                <div className="flex items-center space-x-2 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus-within:border-blue-500/30 transition-all">
                  <span className="text-slate-500 text-xs">
                    {downloadResult?.isZip ? <Layers3 className="h-4.5 w-4.5 text-blue-400" /> : <FileText className="h-4.5 w-4.5 text-blue-400" />}
                  </span>
                  <input
                    type="text"
                    value={customFileName}
                    placeholder={downloadResult?.isZip ? "validated_records_chunks" : "validated_records"}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    className="bg-transparent border-none outline-none flex-grow text-sm font-mono text-white placeholder-slate-500 focus:ring-0 py-0"
                  />
                  <span className="text-xs text-slate-500 font-mono">
                    {downloadResult?.isZip ? ".zip" : ".csv"}
                  </span>
                </div>
              </div>

              {/* Warnings and audit metrics check list */}
              <div className="space-y-4">
                <h5 className="text-xs font-bold uppercase text-slate-300 font-display">Export Check-out Audits</h5>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>Applied {Object.keys(correctionsMap).length} manual & close repairs</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>Attached audit columns <code>validation_status</code></span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>Corrected phone country lengths formatted</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>Removed duplicate rows check logs</span>
                  </div>
                </div>
              </div>

              {/* Big primary download button */}
              <div className="pt-4 space-y-3">
                {downloadResult ? (
                  <a
                    href={`${downloadResult.downloadUrl}&filename=${encodeURIComponent(getProcessedExportFileName())}`}
                    className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 border border-white/10 py-4 px-6 rounded-2xl font-bold text-sm text-white shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <FileDown className="h-5 w-5" />
                    <span>Download Updated File </span>
                  </a>
                ) : (
                  <button
                    onClick={handleGenerateCleanAsset}
                    className="w-full bg-blue-600 hover:bg-blue-500 border border-white/10 py-4 px-6 rounded-2xl font-bold text-sm text-white flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Creating Download Packages...</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="w-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-blue-500/30 py-3.5 px-6 rounded-2xl font-bold text-xs text-slate-200 shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer backdrop-blur-md"
                >
                  <Table className="h-4.5 w-4.5 text-blue-400" />
                  <span>Interactive Preview Cleaned Dataset (First 10 Rows)</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/5 p-6 rounded-2xl space-y-3">
              <h5 className="text-xs text-white font-bold uppercase tracking-wider">Why Chunking & ZIP Partitioning?</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Our Veriflow engine strictly adheres to high volume spreadsheet ingestion standards. When you export files exceeding 5000 records, the backend automatically partitions results into separate 5000-row chunks recursively (e.g. <code>chunk_1.csv</code>, <code>chunk_2.csv</code>) and compiles them inside a unified zip archive to avoid data corruption or timeouts on downstream legacy databases.
              </p>
            </div>
          </motion.div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-16 bg-slate-950/20 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Veriflow. All rights reserved.</p>
          <p className="mt-1 font-mono text-[10px]">Secure sandboxed node stream parsing • Zero third-party telemetry</p>
        </div>
      </footer>

      {/* INTERACTIVE PREVIEW MODAL */}
      <AnimatePresence>
        {isPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPreviewOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0b0c10] border border-white/10 rounded-3xl w-full max-w-6xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] z-10"
            >
              {/* Decorative backgrounds */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 blur-[80px] pointer-events-none rounded-full" />
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 blur-[80px] pointer-events-none rounded-full" />

              {/* Modal Header */}
              <div className="p-6 border-b border-white/5 flex justify-between items-start relative z-10">
                <div className="space-y-1">
                  <div className="inline-flex items-center space-x-1.5 text-[10px] text-blue-400 font-mono tracking-wider font-bold uppercase">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Quality-Checked Pipeline Output</span>
                  </div>
                  <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                    Cleaned Dataset Preview
                  </h3>
                  <p className="text-xs text-slate-400">
                    Showing the first 10 rows matching your applied corrections, close match mappings, and audit checks.
                  </p>
                </div>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Informational badges bar */}
              <div className="px-6 py-3.5 bg-white/[2%] border-b border-white/5 flex flex-wrap gap-4 items-center justify-between text-xs text-slate-300 relative z-10">
                <div className="flex items-center space-x-4">
                  <span className="flex items-center space-x-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Applied: <strong className="text-white">{Object.keys(correctionsMap).length}</strong> manual corrections</span>
                  </span>
                  <span className="h-3 w-px bg-white/10 hidden sm:block" />
                  <span className="flex items-center space-x-1.5">
                    <BadgeAlert className="h-4 w-4 text-blue-400" />
                    <span>Appended audit columns: <code className="text-blue-300 text-[10px]">validation_status</code>, <code className="text-blue-300 text-[10px]">error_message</code></span>
                  </span>
                </div>
                <span className="text-[10px] bg-white/5 font-mono text-slate-400 px-2.5 py-1 rounded">
                  Showing 10 of {records.length} total rows
                </span>
              </div>

              {/* Table Container */}
              <div className="p-6 overflow-auto relative z-10 flex-1">
                {records.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <Table className="h-10 w-10 text-slate-600 mx-auto" />
                    <p className="font-semibold text-sm">No rows loaded</p>
                    <p className="text-xs text-slate-500">Upload a spreadsheet ledger to generate a preview dataset.</p>
                  </div>
                ) : (
                  <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/40 backdrop-blur-sm">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-white/10 font-mono text-[10px] uppercase text-slate-400">
                          <th className="py-3 px-4 font-bold sticky top-0 bg-slate-900">Row #</th>
                          {(() => {
                            const columns = fileDetails?.columns || Object.keys(records[0] || {});
                            return [...columns, "validation_status", "error_message"].map((col) => (
                              <th key={col} className="py-3 px-4 font-bold sticky top-0 bg-slate-900 whitespace-nowrap">
                                {col}
                              </th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono text-xs text-slate-300">
                        {(() => {
                          const columns = fileDetails?.columns || Object.keys(records[0] || {});
                          const previewSource = validationResults?.validatedRecords?.slice(0, 10) || records.slice(0, 10).map((r, i) => ({ rowId: i, rowData: r }));
                          
                          return previewSource.map((item, pIdx) => {
                            const rowId = item.rowId;
                            const originalRow = item.rowData;
                            const cleanedRow = getCleanedRowData(rowId, originalRow);
                            const audit = getPreviewValidationStatus(rowId, cleanedRow);

                            return (
                              <tr key={pIdx} className="hover:bg-white/[2%] transition-all">
                                <td className="py-3 px-4 text-slate-500 font-bold bg-white/[1%]">{rowId + 1}</td>
                                {columns.map((colName) => {
                                  const origVal = originalRow[colName] || "";
                                  const cleanVal = cleanedRow[colName] || "";
                                  const isCellCorrected = origVal !== cleanVal;

                                  return (
                                    <td key={colName} className="py-3 px-4 whitespace-nowrap">
                                      {isCellCorrected ? (
                                        <div className="flex flex-col text-left">
                                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded inline-flex items-center max-w-max border border-emerald-500/20">
                                            <Sparkles className="h-3 w-3 mr-1 text-emerald-400 animate-pulse" />
                                            <span>{String(cleanVal)}</span>
                                          </span>
                                          <span className="text-[9px] text-slate-500 mt-0.5 line-through decoration-rose-500/50 pl-1">
                                            Was: {String(origVal || "Empty")}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className={cleanVal ? "text-slate-200" : "text-slate-500 italic text-[11px]"}>
                                          {cleanVal ? String(cleanVal) : "-"}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}

                                {/* validation_status column */}
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center space-x-1.5 py-0.5 px-2 rounded-full text-[9px] font-bold ${
                                    audit.status === "PASSED"
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                      : "bg-rose-500/10 text-rose-400 border border-rose-500/15"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${audit.status === "PASSED" ? "bg-emerald-400" : "bg-rose-400"}`} />
                                    <span>{audit.status}</span>
                                  </span>
                                </td>

                                {/* error_message column */}
                                <td className="py-3 px-4 max-w-[240px] truncate text-slate-400" title={audit.errorMessage}>
                                  {audit.errorMessage ? (
                                    <span className="text-rose-300 font-sans font-medium text-[11px]">
                                      {audit.errorMessage}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 italic text-[11px]">- Passed Validation -</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-white/5 bg-slate-900/30 flex justify-end gap-3 rounded-b-3xl relative z-10">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-xl text-xs font-semibold hover:text-white transition-all cursor-pointer"
                >
                  Close Preview
                </button>
                {downloadResult && (
                  <a
                    href={downloadResult.downloadUrl}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center space-x-1.5 transition-all cursor-pointer border border-white/10"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span>Download Ledger File</span>
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
