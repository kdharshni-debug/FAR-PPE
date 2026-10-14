import {
  getMonthsInFY,
  parseDate,
  activeDaysInRange,
  fyBounds,
  round2,
  num,
  formatDate,
  formatMoney,
  fyOfDate,
  uuid,
} from "./utils";

export const ASSET_GROUPS = [
  "Leasehold Improvements",
  "Plant & Machinery",
  "Furniture and Fixtures",
  "Office Equipments",
  "Computer",
  "Software",
];

export const GROUP_DEFAULTS = {
  "Leasehold Improvements": { lifeYears: 10, salvagePct: 5 },
  "Plant & Machinery": { lifeYears: 10, salvagePct: 5 },
  "Furniture and Fixtures": { lifeYears: 10, salvagePct: 5 },
  "Office Equipments": { lifeYears: 5, salvagePct: 5 },
  Computer: { lifeYears: 3, salvagePct: 5 },
  Software: { lifeYears: 3, salvagePct: 5 },
};

export function newAsset(group) {
  const g = group || "Computer";
  const def = GROUP_DEFAULTS[g] || GROUP_DEFAULTS.Computer;
  return {
    id: uuid(),
    assetName: "",
    assetGroup: g,
    vendorName: "",
    amount: 0,
    dateOfInvoice: "",
    dateOfCapitalisation: "",
    salvagePct: def.salvagePct,
    salvageValue: null,
    usefulLifeDays: def.lifeYears * 365,
    openingAccDep: 0,
    disposal: null,
    remarks: "",
  };
}

// Core daily pro-rated straight-line depreciation engine.
//
// Multi-FY rollover: for any FY after the asset's tracked origin FY, the opening
// accumulated depreciation is the prior year's closing balance, chain-computed from
// the asset's own data (recorded actuals included). Assets disposed — or fully
// depreciated — in a prior FY roll into the new year at a zero net book value.
function rolledAssetForFY(asset, fyStartYear) {
  const origin = asset.originFy ?? fyOfDate(asset.dateOfCapitalisation);
  if (origin !== null && fyStartYear > origin) {
    const prior = computeAsset(asset, fyStartYear - 1);
    return {
      ...asset,
      openingAccDep: round2(prior.openingAccDep + prior.totalDepFY),
      priorFyDisposal: prior.disposal
        ? {
            accDepAtDisposal: prior.accDepAtDisposal,
            carryingValueAtDisposal: prior.carryingValueAtDisposal,
            gainLoss: prior.gainLoss,
          }
        : null,
    };
  }
  return asset;
}

export function computeAsset(asset, fyStartYear) {
  return computeAssetFY(rolledAssetForFY(asset, fyStartYear), fyStartYear);
}

function computeAssetFY(asset, fyStartYear) {
  const capDate = parseDate(asset.dateOfCapitalisation);
  const dispDate = asset.disposal ? parseDate(asset.disposal.date) : null;
  const originalCost = round2(num(asset.amount));
  const def = GROUP_DEFAULTS[asset.assetGroup] || {};
  const salvagePct = num(asset.salvagePct ?? def.salvagePct ?? 5);
  const salvageValue =
    asset.salvageValue !== null && asset.salvageValue !== undefined && asset.salvageValue !== ""
      ? round2(num(asset.salvageValue))
      : round2((originalCost * salvagePct) / 100);
  const usefulLifeDays = num(asset.usefulLifeDays || def.lifeYears * 365 || 365);
  const depreciableValue = round2(originalCost - salvageValue);
  const openingAccDep = round2(num(asset.openingAccDep));

  // Opening Balance priority: an asset capitalised before 01-Apr is depreciated from
  // what is left at 01-Apr (cost - opening acc. dep. - salvage) over its remaining
  // life, not from the original cost. New additions use the full depreciable value.
  const { fyStart } = fyBounds(fyStartYear);
  let dailyRate = 0;
  if (capDate && capDate < fyStart) {
    const remainingLifeDays = usefulLifeDays - Math.round((fyStart - capDate) / 86400000);
    dailyRate =
      remainingLifeDays > 0
        ? Math.max(0, originalCost - openingAccDep - salvageValue) / remainingLifeDays
        : 0;
  } else if (capDate) {
    dailyRate = usefulLifeDays > 0 ? depreciableValue / usefulLifeDays : 0;
  }

  const months = getMonthsInFY(fyStartYear);
  // Re-imported registers carry recorded Apr-Mar figures that must be preserved
  // exactly; only months after the import anchor month are recalculated.
  const imported = Array.isArray(asset.importedMonthly) ? asset.importedMonthly : null;
  const importedThrough = imported
    ? imported.reduce((last, v, i) => (v !== null && v !== undefined ? i : last), -1)
    : -1;
  const monthlyDep = months.map((m, i) =>
    imported && i <= importedThrough && imported[i] !== null && imported[i] !== undefined
      ? round2(num(imported[i]))
      : round2(dailyRate * activeDaysInRange(capDate, dispDate, m.year, m.month))
  );
  const activeDaysFY = months.reduce(
    (sum, m) => sum + activeDaysInRange(capDate, dispDate, m.year, m.month),
    0
  );
  const totalDepFY = round2(monthlyDep.reduce((a, b) => a + b, 0));

  let netBookValue;
  let deletion = 0;
  let gainLoss = null;
  let remarks = asset.remarks || "";
  let accDepAtDisposal = 0;
  let carryingValueAtDisposal = 0;
  let depUpToDisposal = 0;
  let daysRemaining = Math.max(0, usefulLifeDays - activeDaysFY);

  if (asset.disposal && dispDate && dispDate < fyStart) {
    // Removed from the books in a prior FY: retained at a zero balance; the disposal
    // facts (proceeds, book value, gain/loss) stay exactly as last computed.
    const f = asset.priorFyDisposal || {};
    deletion = 0;
    netBookValue = 0;
    daysRemaining = 0;
    depUpToDisposal = 0;
    accDepAtDisposal = f.accDepAtDisposal ?? openingAccDep;
    carryingValueAtDisposal = f.carryingValueAtDisposal ?? round2(originalCost - openingAccDep);
    gainLoss = f.gainLoss ?? null;
  } else if (asset.disposal && dispDate) {
    const dispMonthIdx = months.findIndex(
      (m) => dispDate.getFullYear() === m.year && dispDate.getMonth() === m.month
    );
    const idx = dispMonthIdx >= 0 ? dispMonthIdx : months.length - 1;
    depUpToDisposal = round2(monthlyDep.slice(0, idx + 1).reduce((a, b) => a + b, 0));
    accDepAtDisposal = round2(openingAccDep + depUpToDisposal);
    carryingValueAtDisposal = round2(originalCost - accDepAtDisposal);
    const saleProceeds = round2(num(asset.disposal.saleProceeds));
    gainLoss = round2(saleProceeds - carryingValueAtDisposal);
    deletion = originalCost;
    netBookValue = 0;
    daysRemaining = 0;
    remarks = `Disposed on ${formatDate(dispDate)} | Sale Price: ${formatMoney(
      saleProceeds
    )} | Book Value: ${formatMoney(carryingValueAtDisposal)} | Gain/Loss: ${formatMoney(gainLoss)}`;
  } else {
    netBookValue = round2(originalCost - openingAccDep - totalDepFY);
  }

  return {
    ...asset,
    capDate,
    dispDate,
    originalCost,
    salvageValue,
    usefulLifeDays,
    depreciableValue,
    dailyRate,
    monthlyDep,
    activeDaysFY,
    daysApplicableFY: activeDaysFY,
    daysRemaining,
    totalDepFY,
    openingAccDep,
    netBookValue,
    deletion,
    gainLoss,
    accDepAtDisposal,
    carryingValueAtDisposal,
    depUpToDisposal,
    remarks,
  };
}

export function computeFARSummary(computedAssets, fyStartYear, targetMonthIdx) {
  const months = getMonthsInFY(fyStartYear);
  const fyStart = new Date(fyStartYear, 3, 1);

  const summary = {};
  for (const g of ASSET_GROUPS) {
    summary[g] = {
      grossOpening: 0,
      additionsToDate: 0,
      disposalsToDate: 0,
      grossBalance: 0,
      accDepOpening: 0,
      eliminatedOnDisposals: 0,
      depExpense: 0,
      monthCharge: 0,
      accDepBalance: 0,
      netCarrying: 0,
      disposalPnL: 0,
    };
  }

  for (const a of computedAssets) {
    const g = summary[a.assetGroup] || summary.Computer;
    const capDate = a.capDate;
    if (capDate && capDate < fyStart) g.grossOpening += a.originalCost;

    if (capDate && capDate >= fyStart) {
      const capMonthIdx = months.findIndex(
        (m) => capDate.getFullYear() === m.year && capDate.getMonth() === m.month
      );
      if (capMonthIdx >= 0 && capMonthIdx <= targetMonthIdx) g.additionsToDate += a.originalCost;
    }

    g.accDepOpening += a.openingAccDep;

    if (a.disposal && a.dispDate) {
      const dispMonthIdx = months.findIndex(
        (m) => a.dispDate.getFullYear() === m.year && a.dispDate.getMonth() === m.month
      );
      if (dispMonthIdx >= 0 && dispMonthIdx <= targetMonthIdx) {
        g.disposalsToDate += a.originalCost;
        g.eliminatedOnDisposals += round2(a.openingAccDep + a.depUpToDisposal);
        g.disposalPnL += a.gainLoss || 0;
      }
    }

    const depUpTo = round2(a.monthlyDep.slice(0, targetMonthIdx + 1).reduce((s, v) => s + v, 0));
    g.depExpense += depUpTo;
    g.monthCharge += a.monthlyDep[targetMonthIdx] || 0;
  }

  for (const g of ASSET_GROUPS) {
    const s = summary[g];
    s.grossBalance = round2(s.grossOpening + s.additionsToDate - s.disposalsToDate);
    s.accDepBalance = round2(s.accDepOpening + s.depExpense - s.eliminatedOnDisposals);
    s.netCarrying = round2(s.grossBalance - s.accDepBalance);
    s.disposalPnL = round2(s.disposalPnL);
    s.monthCharge = round2(s.monthCharge);
    s.depExpense = round2(s.depExpense);
  }

  return summary;
}

const TOTAL_KEYS = [
  "grossOpening",
  "additionsToDate",
  "disposalsToDate",
  "grossBalance",
  "accDepOpening",
  "eliminatedOnDisposals",
  "depExpense",
  "monthCharge",
  "accDepBalance",
  "netCarrying",
  "disposalPnL",
];

export function grandTotals(summary) {
  const t = {};
  for (const k of TOTAL_KEYS) {
    t[k] = round2(ASSET_GROUPS.reduce((s, g) => s + (summary[g]?.[k] || 0), 0));
  }
  return t;
}

// Journal entries for the selected target month.
export function fixedAssetJournalEntries(computedAssets, fyStartYear, targetMonthIdx, symbol = "₹") {
  const entries = [];
  const months = getMonthsInFY(fyStartYear);
  // Depreciation entries by group
  for (const g of ASSET_GROUPS) {
    const dep = round2(
      computedAssets
        .filter((a) => a.assetGroup === g)
        .reduce((s, a) => s + (a.monthlyDep[targetMonthIdx] || 0), 0)
    );
    if (dep > 0) {
      entries.push({
        narration: `Depreciation for ${months[targetMonthIdx].fullLabel} ${months[targetMonthIdx].year} - ${g}`,
        debit: [{ account: `Depreciation Expense - ${g}`, amount: dep }],
        credit: [{ account: `Accumulated Depreciation - ${g}`, amount: dep }],
      });
    }
  }
  // Disposal entries for assets disposed in the target month
  for (const a of computedAssets) {
    if (!a.disposal || !a.dispDate) continue;
    const dispMonthIdx = months.findIndex(
      (m) => a.dispDate.getFullYear() === m.year && a.dispDate.getMonth() === m.month
    );
    if (dispMonthIdx !== targetMonthIdx) continue;
    const debit = [
      { account: `Bank / Cash`, amount: a.disposal.saleProceeds || 0 },
      { account: `Accumulated Depreciation - ${a.assetGroup}`, amount: a.accDepAtDisposal },
    ];
    const credit = [{ account: `${a.assetGroup} Asset`, amount: a.originalCost }];
    if ((a.gainLoss || 0) > 0) {
      credit.push({ account: `Gain on Sale of Asset`, amount: a.gainLoss });
    } else if ((a.gainLoss || 0) < 0) {
      debit.push({ account: `Loss on Sale of Asset`, amount: Math.abs(a.gainLoss) });
    }
    entries.push({
      narration: `Disposal of ${a.assetName} on ${formatDate(a.dispDate)}`,
      debit,
      credit,
    });
  }
  return entries;
}
