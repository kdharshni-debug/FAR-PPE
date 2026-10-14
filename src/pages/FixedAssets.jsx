import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, BookOpen, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import SessionToolbar from "@/components/accounting/SessionToolbar";
import AssetForm from "@/components/fixedAssets/AssetForm";
import DisposalDialog from "@/components/fixedAssets/DisposalDialog";
import AssetTable from "@/components/fixedAssets/AssetTable";
import JournalPreview from "@/components/accounting/JournalPreview";
import { newAsset, computeAsset, fixedAssetJournalEntries } from "@/lib/accounting/fixedAssetsEngine";
import { getMonthsInFY, formatMoney } from "@/lib/accounting/utils";
import { exportFixedAssetsExcel } from "@/lib/excel/fixedAssetsExport";
import ImportDialog from "@/components/accounting/ImportDialog";

export default function FixedAssets() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [fyStartYear, setFyStartYear] = useState(2026);
  const [targetMonthIdx, setTargetMonthIdx] = useState(5);
  const [currency, setCurrency] = useState("₹");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [disposalTarget, setDisposalTarget] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const computed = useMemo(
    () => assets.map((a) => computeAsset(a, fyStartYear)),
    [assets, fyStartYear]
  );

  const journal = useMemo(
    () => fixedAssetJournalEntries(computed, fyStartYear, targetMonthIdx, currency),
    [computed, fyStartYear, targetMonthIdx, currency]
  );

  const months = getMonthsInFY(fyStartYear);
  const target = months[targetMonthIdx];

  function handleAddOrUpdate(asset) {
    setAssets((prev) => {
      const exists = prev.some((a) => a.id === asset.id);
      return exists ? prev.map((a) => (a.id === asset.id ? asset : a)) : [...prev, asset];
    });
    setEditing(null);
  }
  function handleEdit(a) {
    setEditing({ ...a });
    setFormOpen(true);
  }
  function handleDelete(id) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }
  function handleDispose(a) {
    setDisposalTarget(a);
  }
  function confirmDisposal(disposal) {
    setAssets((prev) =>
      prev.map((a) => (a.id === disposalTarget.id ? { ...a, disposal } : a))
    );
    setDisposalTarget(null);
  }
  function handleImport(items, fy, monthIdx) {
    setAssets(items);
    if (fy) setFyStartYear(fy);
    if (monthIdx !== null && monthIdx !== undefined) setTargetMonthIdx(monthIdx);
    setImportOpen(false);
  }
  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  // Stateless privacy: purge every record, input and open dialog from memory.
  function clearSession() {
    setAssets([]);
    setEditing(null);
    setDisposalTarget(null);
    setFyStartYear(2026);
    setTargetMonthIdx(5);
    setCurrency("₹");
    setFormOpen(false);
    setImportOpen(false);
    setJournalOpen(false);
    setClearOpen(false);
  }
  async function handleExport() {
    setExporting(true);
    try {
      await exportFixedAssetsExcel(computed, fyStartYear, targetMonthIdx);
    } finally {
      setExporting(false);
    }
  }

  const totalDep = computed.reduce((s, a) => s + a.totalDepFY, 0);
  const totalNet = computed.reduce((s, a) => s + a.netBookValue, 0);
  const monthDep = computed.reduce((s, a) => s + (a.monthlyDep[targetMonthIdx] || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionToolbar
        moduleLabel="Fixed Assets"
        moduleTone="bg-slate-900"
        fyStartYear={fyStartYear}
        onFYChange={setFyStartYear}
        targetMonthIdx={targetMonthIdx}
        onTargetMonthChange={setTargetMonthIdx}
        currency={currency}
        onCurrencyChange={setCurrency}
        onClearSession={() => setClearOpen(true)}
        onBackHome={() => navigate("/")}
      >
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Import Excel
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setJournalOpen(true)}>
          <BookOpen className="h-3.5 w-3.5" /> Journal Entries
        </Button>
        <Button size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={exporting || computed.length === 0}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Excel
        </Button>
      </SessionToolbar>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Assets" value={computed.length} />
          <Stat label={`Depreciation — ${target.label} ${target.year}`} money={formatMoney(monthDep, currency)} />
          <Stat label="Total Dep. (Full FY)" money={formatMoney(totalDep, currency)} />
          <Stat label="Net Book Value (31 Mar)" money={formatMoney(totalNet, currency)} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">Detailed FAR Workings</h2>
            <p className="text-xs text-slate-500">Daily pro-rated straight-line · FY {fyStartYear}-{String(fyStartYear + 1).slice(-2)}</p>
          </div>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Asset
          </Button>
        </div>

        <AssetTable
          computed={computed}
          currency={currency}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDispose={handleDispose}
        />
      </div>

      <AssetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleAddOrUpdate}
        initial={editing}
        fyStartYear={fyStartYear}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="assets"
        currentMonthIdx={targetMonthIdx}
        onImport={handleImport}
      />
      <DisposalDialog
        open={!!disposalTarget}
        onOpenChange={(o) => !o && setDisposalTarget(null)}
        asset={disposalTarget}
        onConfirm={confirmDisposal}
      />
      <JournalPreview
        open={journalOpen}
        onOpenChange={setJournalOpen}
        entries={journal}
        title={`Journal Entries — ${target.fullLabel} ${target.year}`}
        currency={currency}
      />
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear session and switch client?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately purges all assets and inputs from memory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearSession} className="bg-red-600 hover:bg-red-700">
              Clear Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, money }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{money ?? value}</p>
    </div>
  );
}
