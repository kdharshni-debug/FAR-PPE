import {
  getMonthsInFY,
  parseDate,
  activeDaysInRange,
  daysApplicableInFY,
  fyBounds,
  fyOfDate,
  round2,
  num,
  uuid,
} from "./utils";

export const EXPENSE_LEDGERS = [
  "Telephone Expense",
  "Insurance Expense",
  "Rent Expense",
  "Software License Expense",
  "AMC Expense",
  "Subscription Expense",
  "Maintenance Expense",
  "Other Expense",
];

export function newPrepaid() {
  return {
    id: uuid(),
    vendorName: "",
    expenseLedger: "Insurance Expense",
    invoiceDate: "",
    periodStart: "",
    periodEnd: "",
    totalAmount: 0,
    openingPrepaid: 0,
    remarks: "",
  };
}

// Exact-day daily pro-rated amortization engine.
//
// Opening Balance priority: an item that started before 01-Apr is driven by its
// recorded Opening Balance (01-Apr) over the days it is applicable in the current FY —
// never by the original invoice amount. Items starting on/after 01-Apr are additions
// and use Invoice Amount / Total Coverage Days.
// Multi-FY rollover: for any FY after the item's tracked origin FY, the 01-Apr
// opening balance is the prior year's closing balance, chain-computed from the
// item's own data (recorded actuals included). Fully amortized items roll in at 0.
function rolledForFY(item, fyStartYear) {
  const origin = item.originFy ?? fyOfDate(item.periodStart);
  if (origin !== null && fyStartYear > origin) {
    const prior = computePrepaid(item, fyStartYear - 1);
    return { ...item, openingPrepaid: prior.closingPrepaid };
  }
  return item;
}

export function computePrepaid(item, fyStartYear) {
  return computePrepaidFY(rolledForFY(item, fyStartYear), fyStartYear);
}

function computePrepaidFY(item, fyStartYear) {
  const start = parseDate(item.periodStart);
  const end = parseDate(item.periodEnd);
  const totalAmount = round2(num(item.totalAmount));
  const coverageDays = start && end ? Math.round((end - start) / 86400000) + 1 : 0;
  const daysApplicableFY = daysApplicableInFY(start, end, fyStartYear);
  const isExisting = !start || start < fyBounds(fyStartYear).fyStart;
  const openingPrepaid = isExisting ? round2(num(item.openingPrepaid)) : 0;
  const dailyRate = isExisting
    ? daysApplicableFY > 0
      ? openingPrepaid / daysApplicableFY
      : 0
    : coverageDays > 0
    ? totalAmount / coverageDays
    : 0;
  const months = getMonthsInFY(fyStartYear);
  // Re-imported registers carry recorded Apr-Mar figures that must be preserved
  // exactly; only months after the import anchor month are recalculated.
  // Recorded history belongs to the FY it was imported for — prior-year actuals
  // must never leak into a later financial year's months.
  const imported =
    Array.isArray(item.importedMonthly) && (item.importedFy == null || item.importedFy === fyStartYear)
      ? item.importedMonthly
      : null;
  const importedThrough = imported
    ? imported.reduce((last, v, i) => (v !== null && v !== undefined ? i : last), -1)
    : -1;
  const monthlyAmort = months.map((m, i) =>
    imported && i <= importedThrough && imported[i] !== null && imported[i] !== undefined
      ? round2(num(imported[i]))
      : round2(dailyRate * activeDaysInRange(start, end, m.year, m.month))
  );
  const totalRecognized = round2(monthlyAmort.reduce((a, b) => a + b, 0));
  // Existing items arrive through the opening balance; only items starting in the
  // current FY are additions.
  const additionsFY = isExisting ? 0 : totalAmount;
  const closingPrepaid = round2(openingPrepaid + additionsFY - totalRecognized);
  return {
    ...item,
    start,
    end,
    totalAmount,
    coverageDays,
    daysApplicableFY,
    dailyRate,
    monthlyAmort,
    totalRecognized,
    openingPrepaid,
    additionsFY,
    closingPrepaid,
  };
}

export function computePrepaidSummary(computedItems, targetMonthIdx) {
  const byCategory = {};
  for (const it of computedItems) {
    const cat = it.expenseLedger || "Other Expense";
    if (!byCategory[cat]) {
      byCategory[cat] = { additions: 0, opening: 0, monthExpense: 0, cumulative: 0, remaining: 0 };
    }
    const monthExpense = round2(it.monthlyAmort[targetMonthIdx] || 0);
    const cumulative = round2(it.monthlyAmort.slice(0, targetMonthIdx + 1).reduce((s, v) => s + v, 0));
    const remaining = round2(it.additionsFY + it.openingPrepaid - cumulative);
    byCategory[cat].additions += it.additionsFY;
    byCategory[cat].opening += it.openingPrepaid;
    byCategory[cat].monthExpense += monthExpense;
    byCategory[cat].cumulative += cumulative;
    byCategory[cat].remaining += remaining;
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].additions = round2(byCategory[cat].additions);
    byCategory[cat].opening = round2(byCategory[cat].opening);
    byCategory[cat].monthExpense = round2(byCategory[cat].monthExpense);
    byCategory[cat].cumulative = round2(byCategory[cat].cumulative);
    byCategory[cat].remaining = round2(byCategory[cat].remaining);
  }
  return byCategory;
}

export function prepaidJournalEntries(computedItems, targetMonthIdx) {
  const summary = computePrepaidSummary(computedItems, targetMonthIdx);
  const entries = [];
  for (const [cat, v] of Object.entries(summary)) {
    if (v.monthExpense > 0) {
      entries.push({
        narration: `Prepaid amortization - ${cat}`,
        debit: [{ account: cat, amount: v.monthExpense }],
        credit: [{ account: "Prepaid Expenses", amount: v.monthExpense }],
      });
    }
  }
  return entries;
}
