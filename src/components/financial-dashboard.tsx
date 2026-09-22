import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PieChart as PieIcon,
  TrendingUp,
  Settings,
  Search,
  Bell,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  kpis,
  monthlyData,
  budgets,
  allocation,
  transactions,
} from "@/lib/finance-data";

const navItems = [
  { label: "Resumen", icon: LayoutDashboard, active: true },
  { label: "Transacciones", icon: ArrowLeftRight, active: false },
  { label: "Presupuestos", icon: Wallet, active: false },
  { label: "Cartera", icon: PieIcon, active: false },
  { label: "Informes", icon: TrendingUp, active: false },
  { label: "Ajustes", icon: Settings, active: false },
];

const periods = ["7D", "30D", "90D", "1A"] as const;

function formatCurrency(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-5 lg:flex">
      <div className="flex items-center gap-2.5 px-2 pb-8">
        <div className="grid size-9 place-items-center rounded-lg bg-gold font-display text-lg font-bold text-background">
          V
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold">Vantage</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Finance OS
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <a
            key={item.label}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              item.active
                ? "nav-item-active font-medium"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <item.icon className="size-4" />
            {item.label}
          </a>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-elev p-4">
        <p className="text-[11px] text-muted-foreground">Salud de cartera</p>
        <p className="font-display text-xl font-semibold text-positive">Fuerte</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-positive"
            style={{ width: "82%" }}
          />
        </div>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          82% diversificación
        </p>
      </div>
    </aside>
  );
}

function TopBar() {
  const [activePeriod, setActivePeriod] = useState<(typeof periods)[number]>(
    "90D",
  );
  return (
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs text-muted-foreground">
          Lunes, 22 de septiembre de 2026
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Buenos días, Pamela
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted-foreground md:flex">
          <Search className="size-4" />
          <span>Buscar cuentas, movimientos…</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setActivePeriod(p)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                activePeriod === p
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <button className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted-foreground hover:text-foreground">
          <Bell className="size-4" />
        </button>
        <div className="grid size-9 place-items-center rounded-full bg-chart-2 font-display text-sm font-semibold text-background">
          PL
        </div>
      </div>
    </div>
  );
}

function KpiCards() {
  const cards = [
    {
      label: "Ingresos",
      value: formatCurrency(kpis.income, true),
      change: kpis.incomeChange,
      positive: true,
    },
    {
      label: "Gastos",
      value: formatCurrency(kpis.expenses, true),
      change: kpis.expenseChange,
      positive: false,
    },
    {
      label: "Balance neto",
      value: formatCurrency(kpis.netBalance, true),
      change: kpis.netChange,
      positive: true,
    },
    {
      label: "Tasa de ahorro",
      value: `${kpis.savingsRate}%`,
      change: kpis.savingsChange,
      positive: true,
      suffix: "pts",
    },
  ];

  return (
    <section className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="kpi-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {card.label}
            </p>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[10px] font-medium ${
                card.positive ? "text-positive" : "text-negative"
              }`}
            >
              {card.positive ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {card.change}
              {card.suffix ?? "%"}
            </span>
          </div>
          <p className="mt-3 font-mono text-2xl font-medium tracking-tight tabular">
            {card.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function RevenueChart() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">
            Ingresos vs. Gastos
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            Últimos 12 meses · USD (miles)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-positive" />
            Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-negative/50" />
            Gastos
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5ee0a0" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#5ee0a0" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#262E44"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            stroke="#8a93a8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#8a93a8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1A2135",
              border: "1px solid #262E44",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#f8fafc",
            }}
            labelStyle={{ color: "#8a93a8" }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#5ee0a0"
            strokeWidth={2}
            fill="url(#revGrad)"
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke="#f87171"
            strokeWidth={2}
            fill="url(#expGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BudgetProgress() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-display text-base font-semibold">Presupuestos</h2>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        Comprometido vs. asignado · este trimestre
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {budgets.map((b) => {
          const over = b.pct > 85;
          return (
            <div key={b.name}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  ${b.spent}K{" "}
                  <span className="text-muted-foreground/60">/ ${b.allocated}K</span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${
                    over ? "bg-negative" : "bg-positive"
                  }`}
                  style={{ width: `${b.pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioDonut() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-display text-base font-semibold">Asignación</h2>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        Por clase de activo
      </p>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
        <div
          className="relative grid size-40 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#5ee0a0 0 42%, #5b9bff 42% 71%, #e7c56b 71% 88%, #8a93a8 88% 100%)`,
          }}
        >
          <div className="grid size-24 place-items-center rounded-full bg-surface text-center">
            <div>
              <p className="font-mono text-lg font-semibold">$2.4M</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Patrimonio
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 text-sm">
          {allocation.map((a) => (
            <div key={a.name} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: a.color }}
                />
                {a.name}
              </span>
              <span className="font-mono text-xs">{a.value}%</span>
            </div>
          ))}
          <div className="mt-2 border-t border-line pt-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Patrimonio
            </p>
            <p className="font-mono text-lg font-semibold">$2.4M</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionsTable() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">
            Movimientos recientes
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {transactions.length} movimientos
          </p>
        </div>
        <a className="flex cursor-pointer items-center gap-1 text-xs font-medium text-gold">
          Ver todo <ChevronRight className="size-3" />
        </a>
      </div>

      <div className="hidden grid-cols-12 gap-3 border-b border-line px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:grid">
        <div className="col-span-4">Contraparte</div>
        <div className="col-span-3">Categoría</div>
        <div className="col-span-2">Fecha</div>
        <div className="col-span-1">Estado</div>
        <div className="col-span-2 text-right">Monto</div>
      </div>

      <div className="divide-y divide-line">
        {transactions.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-12 items-center gap-3 px-3 py-3 text-sm transition-colors hover:bg-white/5"
          >
            <div className="col-span-12 font-medium sm:col-span-4">
              {t.counterparty}
            </div>
            <div className="col-span-6 text-muted-foreground sm:col-span-3">
              {t.category}
            </div>
            <div className="col-span-3 font-mono text-xs text-muted-foreground sm:col-span-2">
              {t.date}
            </div>
            <div className="col-span-3 sm:col-span-1">
              <span
                className={`text-[11px] font-medium ${
                  t.status === "Pagado" ? "text-positive" : "text-muted-foreground"
                }`}
              >
                {t.status}
              </span>
            </div>
            <div
              className={`col-span-12 text-right font-mono font-medium sm:col-span-2 ${
                t.type === "credit" ? "text-positive" : "text-foreground"
              }`}
            >
              {t.amount > 0 ? "+" : "−"}
              {formatCurrency(Math.abs(t.amount))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialDashboard() {
  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden p-6 lg:p-8">
        <TopBar />
        <KpiCards />
        <div className="mb-5">
          <RevenueChart />
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BudgetProgress />
          </div>
          <PortfolioDonut />
        </div>
        <div className="mt-5">
          <TransactionsTable />
        </div>
      </main>
    </div>
  );
}
