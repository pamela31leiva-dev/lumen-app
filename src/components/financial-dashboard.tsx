import { useState, type MouseEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Landmark,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  allocation,
  transactions,
  wealthHistory,
  wealthMetrics,
} from "@/lib/finance-data";
import { cn } from "@/lib/utils";

const periods = ["1M", "6M", "1A", "Todo"] as const;

function formatCurrency(value: number, compact = false) {
  if (compact) {
    const absoluteValue = Math.abs(value);
    const divisor = absoluteValue >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
    const suffix = absoluteValue >= 1_000_000_000 ? "MRD" : "M";
    const scaled = value / divisor;
    const decimals = Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2;
    return `$${scaled.toFixed(decimals).replace(".", ",")} ${suffix}`;
  }
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function Header() {
  return (
    <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-5 sm:px-7 lg:px-10">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg border border-primary/30 bg-primary/10 shadow-[inset_0_1px_0_var(--glass-highlight)]">
          <span className="font-display text-lg font-semibold text-primary">L</span>
        </div>
        <div>
          <p className="font-display text-base font-semibold">Lumen</p>
          <p className="hidden text-[11px] text-muted-foreground sm:block">Inteligencia patrimonial</p>
        </div>
      </div>

      <nav className="hidden items-center gap-7 text-sm text-muted-foreground lg:flex" aria-label="Navegación principal">
        <a href="#patrimonio" className="text-foreground transition-colors hover:text-primary">Patrimonio</a>
        <a href="#movimientos" className="transition-colors hover:text-foreground">Movimientos</a>
        <a href="#asignacion" className="transition-colors hover:text-foreground">Portafolio</a>
        <a href="#planeacion" className="transition-colors hover:text-foreground">Planeación</a>
      </nav>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="glass-control relative" aria-label="Notificaciones">
          <Bell />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-gold" />
        </Button>
        <div className="hidden items-center gap-2.5 pl-2 sm:flex">
          <div className="grid size-9 place-items-center rounded-full bg-elev text-xs font-semibold text-primary">PL</div>
          <div className="leading-tight">
            <p className="text-xs font-medium">Pamela Leiva</p>
            <p className="text-[10px] text-muted-foreground">Family Office</p>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </div>
        <Button variant="ghost" size="icon" className="glass-control lg:hidden" aria-label="Abrir menú">
          <Menu />
        </Button>
      </div>
    </header>
  );
}

type CommandCenterProps = {
  onRegister: () => void;
};

function CommandCenter({ onRegister }: CommandCenterProps) {
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);

  return (
    <section aria-label="Centro de comandos" className="sticky top-3 z-30 mx-auto w-[calc(100%-2rem)] max-w-5xl">
      <div className="command-shell overflow-hidden rounded-2xl p-3.5 sm:p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-xl text-muted-foreground hover:bg-foreground/5" aria-label="Adjuntar archivo">
            <Paperclip />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setListening((value) => !value)}
            className={cn("shrink-0 rounded-xl text-muted-foreground hover:bg-foreground/5", listening && "bg-primary/10 text-primary")}
            aria-label={listening ? "Detener micrófono" : "Activar micrófono"}
          >
            <Mic className={cn(listening && "animate-pulse")} />
          </Button>
          <div className="relative min-w-0 flex-1">
            <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setQuery("");
              }}
              className="command-input h-11 rounded-xl border-transparent bg-transparent pl-10 pr-10 text-sm shadow-none"
              placeholder="Pregunta por tu patrimonio…"
              aria-label="Consulta patrimonial"
            />
            <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-9 rounded-lg text-primary" aria-label="Enviar consulta">
              <ArrowRight />
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line/60 pt-3">
          <Button variant="ghost" onClick={onRegister} className="h-10 rounded-xl border border-primary/15 bg-primary/10 px-3 text-[11px] text-primary hover:border-primary/25 hover:bg-primary/15 sm:text-xs">
            <Plus /> <span>Registrar</span>
          </Button>
          <Button variant="ghost" className="h-10 rounded-xl border border-line/60 bg-foreground/[0.02] px-3 text-[11px] text-muted-foreground hover:border-line hover:bg-foreground/5 hover:text-foreground sm:text-xs">
            <FileSpreadsheet /> <span className="truncate">Importar CSV</span>
          </Button>
          <Button variant="ghost" className="h-10 rounded-xl border border-line/60 bg-foreground/[0.02] px-3 text-[11px] text-muted-foreground hover:border-line hover:bg-foreground/5 hover:text-foreground sm:text-xs">
            <FileText /> <span className="truncate">Factura XML</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

function GlowPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  const trackGlow = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div onMouseMove={trackGlow} className={cn("glow-panel", className)}>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

function HeroMetrics() {
  return (
    <section id="patrimonio" className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <GlowPanel className="min-h-[290px] p-6 sm:p-8">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                <p className="text-xs font-medium uppercase text-muted-foreground">Patrimonio neto consolidado</p>
              </div>
              <h1 className="font-display text-[clamp(2rem,6vw,4.4rem)] font-semibold leading-none tabular-nums">
                {formatCurrency(wealthMetrics.netWorth, true)}
              </h1>
              <p className="mt-3 text-xs text-muted-foreground">Actualizado hoy, 11:03 · COP</p>
            </div>
            <Badge className="border border-positive/20 bg-positive/10 text-positive shadow-none hover:bg-positive/10">
              <TrendingUp className="mr-1 size-3" /> +{wealthMetrics.twelveMonthReturn}%
            </Badge>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line/70 pt-5 sm:grid-cols-3">
            <Metric label="Activos" value="$15.920 M" />
            <Metric label="Pasivos" value="$2.434 M" />
            <Metric label="Variación 30d" value="+$182,6 M" positive />
          </div>
        </div>
      </GlowPanel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <GlowPanel className="p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Liquidez del mes</p>
              <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{formatCurrency(wealthMetrics.monthlyLiquidity, true)}</p>
            </div>
            <div className="grid size-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><WalletCards className="size-5" /></div>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full w-[69%] rounded-full bg-primary shadow-[0_0_16px_var(--primary)]" />
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
            <span>Ingresos {formatCurrency(wealthMetrics.monthlyIncome, true)}</span>
            <span>69% disponible</span>
          </div>
        </GlowPanel>
        <GlowPanel className="p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cobertura de caja</p>
              <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{wealthMetrics.cashCoverage} meses</p>
            </div>
            <div className="grid size-10 place-items-center rounded-lg border border-gold/20 bg-gold/10 text-gold"><ShieldCheck className="size-5" /></div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Liquidez suficiente para cubrir obligaciones recurrentes, sin considerar venta de activos.</p>
        </GlowPanel>
      </div>
    </section>
  );
}

function Metric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 font-mono text-sm font-medium tabular-nums sm:text-base", positive && "text-positive")}>{value}</p>
    </div>
  );
}

function WealthChart() {
  const [period, setPeriod] = useState<(typeof periods)[number]>("1A");
  return (
    <section className="glass-panel p-5 sm:p-6 lg:col-span-2" aria-labelledby="evolucion-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Evolución consolidada</p>
          <h2 id="evolucion-title" className="mt-1 font-display text-xl font-semibold">Trayectoria patrimonial</h2>
        </div>
        <div className="flex rounded-lg border border-line/80 bg-background/30 p-1">
          {periods.map((item) => (
            <Button key={item} variant="ghost" size="sm" onClick={() => setPeriod(item)} className={cn("h-7 rounded-md px-2.5 text-[11px] text-muted-foreground", period === item && "bg-foreground/10 text-foreground shadow-sm")}>
              {item}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-[250px] w-full sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={wealthHistory} margin={{ top: 8, right: 5, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={10} />
            <YAxis domain={[11000, 13800]} tickFormatter={(value) => `$${(value / 1000).toFixed(1)}B`} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={10} />
            <Tooltip
              formatter={(value) => [`$${Number(value).toLocaleString("es-CO")} M`, "Patrimonio"]}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#wealthFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function AllocationPanel() {
  return (
    <section id="asignacion" className="glass-panel p-5 sm:p-6" aria-labelledby="allocation-title">
      <p className="section-kicker">Asignación estratégica</p>
      <h2 id="allocation-title" className="mt-1 font-display text-xl font-semibold">Composición</h2>
      <div className="relative mx-auto my-7 grid size-44 place-items-center rounded-full p-4 allocation-ring">
        <div className="grid size-full place-items-center rounded-full border border-line/70 bg-surface/90 text-center backdrop-blur-xl">
          <div><p className="font-display text-2xl font-semibold">4</p><p className="text-[10px] uppercase text-muted-foreground">clases</p></div>
        </div>
      </div>
      <div className="space-y-3">
        {allocation.map((item) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2.5 text-muted-foreground"><span className={cn("size-2 rounded-full", item.token)} />{item.name}</span>
            <span className="font-mono font-medium tabular-nums">{item.value}%</span>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-5 w-full rounded-lg border border-line/70 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
        Ver portafolio <ArrowUpRight />
      </Button>
    </section>
  );
}

function Transactions() {
  const [search, setSearch] = useState("");
  const visible = transactions.filter((item) => `${item.counterparty} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section id="movimientos" className="glass-panel overflow-hidden" aria-labelledby="transactions-title">
      <div className="flex flex-col gap-4 border-b border-line/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="section-kicker">Actividad financiera</p>
          <h2 id="transactions-title" className="mt-1 font-display text-xl font-semibold">Movimientos recientes</h2>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar movimiento" className="glass-input h-9 rounded-xl pl-9 text-xs" />
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {visible.map((transaction) => (
          <div key={transaction.id} className="transaction-row grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 sm:grid-cols-[auto_1fr_140px_120px_150px] sm:px-6">
            <div className="grid size-10 place-items-center rounded-lg border border-line bg-elev/70 font-mono text-[11px] text-muted-foreground">{transaction.initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{transaction.counterparty}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{transaction.detail}</p>
            </div>
            <Badge variant="outline" className="hidden w-fit border-line/70 bg-foreground/[0.04] text-[10px] font-medium text-muted-foreground sm:flex">{transaction.category}</Badge>
            <div className="hidden sm:block">
              <p className="text-[11px] text-muted-foreground">{transaction.date}</p>
              <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                transaction.status === "Conciliado" ? "border-positive/25 bg-positive/10 text-positive" : transaction.status === "Pendiente" ? "border-gold/25 bg-gold/10 text-gold" : "border-line/70 bg-foreground/[0.04] text-muted-foreground")}>
                <span className={cn("size-1.5 rounded-full", transaction.status === "Conciliado" ? "bg-positive" : transaction.status === "Pendiente" ? "bg-gold" : "bg-muted-foreground")} />
                {transaction.status}
              </span>
            </div>
            <div className={cn("text-right font-mono text-sm font-medium tabular-nums", transaction.type === "credit" && "text-positive")}>{transaction.type === "credit" ? "+" : "−"}{formatCurrency(Math.abs(transaction.amount), true)}</div>
          </div>
        ))}
        {visible.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No encontramos movimientos con ese criterio.</p>}
      </div>
      <div className="border-t border-line/70 p-3 text-center">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">Ver todos los movimientos <ArrowRight /></Button>
      </div>
    </section>
  );
}

function RegisterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [type, setType] = useState<"Ingreso" | "Egreso">("Egreso");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal-glass max-w-md rounded-2xl border-line/80 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Registrar movimiento</DialogTitle>
          <DialogDescription>Agrega un movimiento manual a tu consolidado patrimonial.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-background/30 p-1.5">
            {(["Ingreso", "Egreso"] as const).map((item) => (
              <Button key={item} variant="ghost" onClick={() => setType(item)} className={cn("rounded-lg text-xs text-muted-foreground", type === item && "bg-primary/10 text-primary shadow-sm")}>
                {item === "Ingreso" ? <ArrowDownLeft /> : <ArrowUpRight />}{item}
              </Button>
            ))}
          </div>
          <Field label="Valor" id="amount" placeholder="$ 0 COP" inputMode="numeric" />
          <Field label="Descripción" id="description" placeholder="Ej. Honorarios de asesoría" />
          <div className="grid gap-2">
            <Label htmlFor="category" className="text-xs text-muted-foreground">Categoría</Label>
            <select id="category" className="glass-input h-12 w-full rounded-xl px-3 text-sm outline-none">
              <option>Inversiones</option><option>Inmuebles</option><option>Honorarios</option><option>Protección</option><option>Otros</option>
            </select>
          </div>
          <Field label="Fecha" id="date" type="date" defaultValue="2026-09-22" />
        </div>
        <DialogFooter className="mt-3 gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl text-muted-foreground">Cancelar</Button>
          <Button onClick={() => onOpenChange(false)} className="h-10 rounded-xl bg-primary px-6 text-primary-foreground shadow-[0_0_22px_var(--primary-glow)] hover:bg-primary/90">Guardar movimiento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, ...props }: React.ComponentProps<typeof Input> & { label: string; id: string }) {
  return <div className="grid gap-2"><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><Input id={id} className="glass-input h-12 rounded-xl" {...props} /></div>;
}

export function FinancialDashboard() {
  const [registerOpen, setRegisterOpen] = useState(false);
  return (
    <div className="lumen-atmosphere min-h-screen bg-background font-sans text-foreground">
      <Header />
      <CommandCenter onRegister={() => setRegisterOpen(true)} />
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-8 sm:px-7 sm:pt-10 lg:px-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="section-kicker">Martes, 22 de septiembre</p>
            <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Buenos días, Pamela.</h2>
          </div>
          <p className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-positive" /> Datos consolidados y conciliados</p>
        </div>
        <HeroMetrics />
        <div className="mt-4 grid gap-4 lg:grid-cols-3"><WealthChart /><AllocationPanel /></div>
        <div className="mt-4"><Transactions /></div>
        <footer className="mt-8 flex flex-col gap-3 border-t border-line/50 pt-5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><Landmark className="size-3.5" /> Lumen Private Wealth · Consolidado familiar</p>
          <p>Última sincronización 11:03 · Cifras en pesos colombianos</p>
        </footer>
      </main>
      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  );
}