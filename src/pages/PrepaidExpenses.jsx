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
import PrepaidForm from "@/components/prepaid/PrepaidForm";
import PrepaidTable from "@/components/prepaid/PrepaidTable";
import JournalPreview from "@/components/accounting/JournalPreview";
import { newPrepaid, computePrepaid, prepaidJournalEntries, computePrepaidSummary } from "@/lib/accounting/prepaidEngine";
import { getMonthsInFY, formatMoney } from "@/lib/accounting/utils";
import { exportPrepaidExcel } from "@/lib/excel/prepaidExport";
import ImportDialog from "@/components/accounting/ImportDialog";

export default function PrepaidExpenses() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [fyStartYear, setFyStartYear] = useState(2026);
  const [targetMonthIdx, setTargetMonthIdx] = useState(5);
  const [currency, setCurrency] = useState("₹");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const computed = useMemo(
    () => items.map((it) => computePrepaid(it, fyStartYear)),
    [items, fyStartYear]
  );

  const summary = useMemo(
    () => computePrepaidSummary(computed, targetMonthIdx),
    [computed, targetMonthIdx]
  );
  const journal = useMemo(
    () => prepaidJournalEntries(computed, targetMonthIdx),
    [computed, targetMonthIdx]
  );

  const months = getMonthsInFY(fyStartYear);
  const target = months[targetMonthIdx];

  const totalAmount = computed.reduce((s, it) => s + it.totalAmount, 0);
  const monthExpense = Object.values(summary).reduce((s, v) => s + v.monthExpense, 0);
  const remaining = Object.values(summary).reduce((s, v) => s + v.remaining, 0);

  function handleAddOrUpdate(item) {
    setItems((prev) => {
      const exists = prev.some((a) => a.id === item.id);
      return exists ? prev.map((a) => (a.id === item.id ? item : a)) : [...prev, item];
    });
    setEditing(null);
  }
  function handleEdit(it) {
    setEditing({ ...it });
    setFormOpen(true);
  }
  function handleDelete(id) {
    setItems((prev) => prev.filter((a) => a.id !== id));
  }
  function handleImport(items, fy, monthIdx) {
    setItems(items);
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
    setItems([]);
    setEditing(null);
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
      await exportPrepaidExcel(computed, fyStartYear, targetMonthIdx);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionToolbar
        moduleLabel="Prepaid Expenses"
        moduleTone="bg-indigo-700"
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
          <Stat label="Prepaid Items" value={computed.length} />
          <Stat label={`Expense — ${target.label} ${target.year}`} money={formatMoney(monthExpense, currency)} />
          <Stat label="Total Invoice Value" money={formatMoney(totalAmount, currency)} />
          <Stat label="Unamortized Balance" money={formatMoney(remaining, currency)} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">Detailed Prepaid Workings</h2>
            <p className="text-xs text-slate-500">Exact-day amortization · FY {fyStartYear}-{String(fyStartYear + 1).slice(-2)}</p>
          </div>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Prepaid
          </Button>
        </div>

        <PrepaidTable computed={computed} currency={currency} onEdit={handleEdit} onDelete={handleDelete} />
      </div>

      <PrepaidForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleAddOrUpdate}
        initial={editing}
        ledgers={Array.from(new Set(items.map((i) => i.expenseLedger).filter(Boolean)))}
        fyStartYear={fyStartYear}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="prepaid"
        currentMonthIdx={targetMonthIdx}
        onImport={handleImport}
      />
      <JournalPreview
        open={journalOpen}
        onOpenChange={setJournalOpen}
        entries={journal}
        title={`Reversal Journal Entries — ${target.fullLabel} ${target.year}`}
        currency={currency}
      />
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear session and switch client?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately purges all prepaid expenses and inputs from memory. This action cannot be undone.
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
