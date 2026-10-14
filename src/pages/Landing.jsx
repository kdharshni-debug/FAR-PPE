import { useNavigate } from "react-router-dom";
import { Building2, Wallet, ShieldCheck, FileSpreadsheet, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function Landing() {
  const navigate = useNavigate();

  const modules = [
    {
      title: "Fixed Asset Register",
      tag: "Module A",
      desc: "Daily pro-rated straight-line depreciation, mid-month disposals with gain/loss, and a 3-sheet FAR workbook.",
      icon: Building2,
      tone: "from-slate-800 to-slate-600",
      route: "/fixed-assets",
    },
    {
      title: "Prepaid Expenses Register",
      tag: "Module B",
      desc: "Exact-day service-period coverage, daily pro-rated expense recognition, and monthly reversal tracking.",
      icon: Wallet,
      tone: "from-indigo-700 to-indigo-500",
      route: "/prepaid-expenses",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Privacy-first · In-memory · Zero data retention
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Accounting Engine
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500">
            A high-precision, stateless workspace for fixed-asset depreciation and prepaid-expense
            amortization. Choose a module to begin — nothing is saved to a database.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.route}
                onClick={() => navigate(m.route)}
                className="group text-left"
              >
                <Card className="h-full overflow-hidden border-slate-200 p-0 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl">
                  <div className={`bg-gradient-to-br ${m.tone} p-6 text-white`}>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
                        {m.tag}
                      </span>
                      <Icon className="h-7 w-7 opacity-90" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold">{m.title}</h2>
                  </div>
                  <div className="p-6">
                    <p className="text-sm leading-relaxed text-slate-600">{m.desc}</p>
                    <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-900 group-hover:gap-3 transition-all">
                      Open module
                      <span aria-hidden>→</span>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Lock, title: "No persistence", desc: "Every session lives in memory only. Clear it instantly." },
            { icon: FileSpreadsheet, title: "Excel source of truth", desc: "Export styled 3-sheet workbooks per module." },
            { icon: ShieldCheck, title: "Audit-grade precision", desc: "Daily pro-rated math, no rounding drift." },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
                <Icon className="h-5 w-5 text-slate-700" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
