import { useState, type MouseEvent } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { allocation, transactions, wealthHistory, wealthMetrics } from "@/lib/finance-data";
import { cn } from "@/lib/utils";

const periods = ["1M", "6M", "1A", "Todo"] as const;

function formatCurrency(value: number, compact = false) {
  if (compact) {
    const absoluteValue = Math.abs(value);
    const divisor = absoluteValue >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
    const suffix = absoluteValue >= 1_000_000_000 ? "MRD" : "M";
    const scaled = value / divisor;
    return `$${scaled.toFixed(Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2).replace(".", ",")} ${suffix}`;
  }
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

function Header() {
  return (
    <header className="relative z-40 mx-auto flex w-full max-w-[1500px] items-center justify-between px-5 py-6 sm:px-10 lg:px-14">
      <div className="flex items-center gap-4">
        <div className="brand-sigil"><span>L</span></div>
        <div>
          <p className="font-display text-2xl leading-none">Lumen</p>
          <p className="mt-1 text-[10px] uppercase text-muted-foreground">Private wealth intelligence</p>
        </div>
      </div>
      <nav className="hidden items-center gap-8 text-xs text-muted-foreground lg:flex" aria-label="Navegación principal">
        <a href="#patrimonio" className="text-foreground transition-colors hover:text-primary">Patrimonio</a>
        <a href="#trayectoria" className="transition-colors hover:text-foreground">Trayectoria</a>
        <a href="#movimientos" className="transition-colors hover:text-foreground">Movimientos</a>
      </nav>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="glass-control relative rounded-full" aria-label="Notificaciones">
          <Bell /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-gold" />
        </Button>
        <div className="hidden items-center gap-3 pl-2 sm:flex">
          <div className="grid size-9 place-items-center rounded-full border border-line bg-elev text-[11px] text-primary">PL</div>
          <div className="leading-tight"><p className="text-xs">Pamela Leiva</p><p className="text-[10px] text-muted-foreground">Family Office</p></div>
          <ChevronDown className="size-3 text-muted-foreground" />
        </div>
        <Button variant="ghost" size="icon" className="glass-control rounded-full lg:hidden" aria-label="Abrir menú"><Menu /></Button>
      </div>
    </header>
  );
}

function CommandCenter({ onRegister }: { onRegister: () => void }) {
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  return (
    <section aria-label="Centro de comandos" className="command-dock sticky top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-4xl">
      <div className="command-aura" />
      <div className="command-shell relative overflow-hidden rounded-[2rem] p-2.5 sm:p-3">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:bg-foreground/5" aria-label="Adjuntar archivo"><Paperclip /></Button>
          <Button variant="ghost" size="icon" onClick={() => setListening((v) => !v)} className={cn("shrink-0 rounded-full text-muted-foreground hover:bg-foreground/5", listening && "bg-primary/10 text-primary")} aria-label={listening ? "Detener micrófono" : "Activar micrófono"}><Mic className={cn(listening && "animate-pulse")} /></Button>
          <div className="relative min-w-0 flex-1">
            <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery("")} className="command-input h-12 rounded-full border-transparent bg-transparent pl-10 pr-11 shadow-none" placeholder="Pregunta por tu patrimonio…" aria-label="Consulta patrimonial" />
            <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-10 rounded-full text-primary" aria-label="Enviar consulta"><ArrowRight /></Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-line/50 pt-2">
          <Button variant="ghost" onClick={onRegister} className="quick-action text-primary"><Plus />Registrar</Button>
          <Button variant="ghost" className="quick-action"><FileSpreadsheet />Importar CSV</Button>
          <Button variant="ghost" className="quick-action"><FileText />Factura XML</Button>
        </div>
      </div>
    </section>
  );
}

function GlowSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  const move = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  };
  return <div onMouseMove={move} className={cn("spatial-surface", className)}><div className="relative z-10 h-full">{children}</div></div>;
}

function WealthStage() {
  return (
    <section id="patrimonio" className="wealth-stage relative min-h-[630px] pt-10 lg:min-h-[680px]">
      <div className="absolute left-0 top-28 hidden h-px w-24 bg-gradient-to-r from-transparent to-primary/60 lg:block" />
      <div className="relative z-10 max-w-5xl">
        <p className="section-kicker mb-5">Consolidado familiar · COP</p>
        <h1 className="wealth-number font-display tabular-nums">{formatCurrency(wealthMetrics.netWorth, true)}</h1>
        <div className="mt-5 flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Patrimonio neto</span>
          <Badge className="rounded-full border border-positive/25 bg-positive/10 text-positive shadow-none hover:bg-positive/10">+{wealthMetrics.twelveMonthReturn}% · 12 meses</Badge>
        </div>
      </div>

      <GlowSurface className="liquidity-island absolute right-0 top-12 w-[min(36vw,430px)] p-7 max-lg:relative max-lg:mt-12 max-lg:w-full">
        <p className="section-kicker">Liquidez inmediata</p>
        <p className="mt-4 font-display text-5xl tabular-nums">{formatCurrency(wealthMetrics.monthlyLiquidity, true)}</p>
        <div className="mt-8 flex items-end justify-between border-t border-line/60 pt-5">
          <div><p className="text-[10px] text-muted-foreground">Disponible este mes</p><p className="mt-1 font-mono text-xs text-primary">69% de ingresos</p></div>
          <div className="liquidity-orbit"><span /></div>
        </div>
      </GlowSurface>

      <GlowSurface className="coverage-orb absolute bottom-8 left-[8%] grid size-56 place-items-center rounded-full p-7 text-center max-lg:relative max-lg:bottom-auto max-lg:left-auto max-lg:mt-5 max-lg:size-48">
        <div><ShieldCheck className="mx-auto mb-3 size-5 text-gold" /><p className="font-display text-4xl">{wealthMetrics.cashCoverage}</p><p className="mt-1 text-[10px] uppercase text-muted-foreground">meses de cobertura</p></div>
      </GlowSurface>

      <div className="absolute bottom-14 right-[12%] hidden w-72 lg:block">
        <p className="font-display text-3xl leading-tight text-foreground/90">Claridad suficiente para decidir sin ruido.</p>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Actualizado hoy, 11:03. Datos consolidados y conciliados.</p>
      </div>
    </section>
  );
}

function WealthChart() {
  const [period, setPeriod] = useState<(typeof periods)[number]>("1A");
  return (
    <section id="trayectoria" className="chart-field relative py-10 lg:py-16" aria-labelledby="evolucion-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 px-1 lg:px-8">
        <div><p className="section-kicker">Evolución consolidada</p><h2 id="evolucion-title" className="mt-2 font-display text-5xl">Trayectoria</h2></div>
        <div className="flex rounded-full border border-line bg-background/40 p-1 backdrop-blur-xl">{periods.map((item) => <Button key={item} variant="ghost" size="sm" onClick={() => setPeriod(item)} className={cn("h-8 rounded-full px-3 text-[10px] text-muted-foreground", period === item && "bg-foreground/10 text-foreground")}>{item}</Button>)}</div>
      </div>
      <div className="h-[360px] w-full sm:h-[430px]">
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={wealthHistory} margin={{ top: 30, right: 8, left: -25, bottom: 0 }}>
          <defs><linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs>
          <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={11}/><YAxis domain={[11000,13800]} tickFormatter={(v) => `$${(v/1000).toFixed(1)}B`} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={10}/>
          <Tooltip formatter={(value) => [`$${Number(value).toLocaleString("es-CO")} M`, "Patrimonio"]} contentStyle={{background:"var(--popover)",border:"1px solid var(--line)",borderRadius:"18px",color:"var(--foreground)",backdropFilter:"blur(24px)"}} labelStyle={{color:"var(--muted-foreground)"}}/>
          <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="url(#wealthFill)" isAnimationActive={false}/>
        </AreaChart></ResponsiveContainer>
      </div>
    </section>
  );
}

function AllocationPanel() {
  return (
    <section id="asignacion" className="allocation-float relative px-6 py-9 sm:px-9" aria-labelledby="allocation-title">
      <div className="flex items-end justify-between"><div><p className="section-kicker">Arquitectura de activos</p><h2 id="allocation-title" className="mt-2 font-display text-4xl">Composición</h2></div><span className="font-display text-5xl text-primary">4</span></div>
      <div className="mt-10 space-y-6">{allocation.map((item) => <div key={item.name} className="group"><div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-3 text-muted-foreground"><span className={cn("size-2 rounded-full", item.token)}/>{item.name}</span><span className="font-mono text-foreground">{item.value}%</span></div><div className="h-px bg-line"><div className={cn("h-px transition-all duration-700", item.token)} style={{width:`${item.value}%`}}/></div></div>)}</div>
    </section>
  );
}

function Transactions() {
  const [search, setSearch] = useState("");
  const visible = transactions.filter((item) => `${item.counterparty} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section id="movimientos" className="transactions-sheet relative" aria-labelledby="transactions-title">
      <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-9"><div><p className="section-kicker">Actividad financiera</p><h2 id="transactions-title" className="mt-2 font-display text-5xl">Movimientos</h2></div><div className="relative sm:w-64"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar movimiento" className="glass-input h-10 rounded-full pl-9 text-xs"/></div></div>
      <div className="border-y border-line/70">{visible.map((transaction,index)=><div key={transaction.id} className={cn("transaction-row grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-5 sm:grid-cols-[auto_1fr_140px_120px_150px] sm:px-9",index>0&&"border-t border-line/50")}>
        <div className="grid size-10 place-items-center rounded-full border border-line bg-elev/60 font-mono text-[10px] text-muted-foreground">{transaction.initials}</div><div className="min-w-0"><p className="truncate text-sm">{transaction.counterparty}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{transaction.detail}</p></div>
        <Badge variant="outline" className="hidden w-fit rounded-full border-line/70 bg-foreground/[0.04] text-[10px] text-muted-foreground sm:flex">{transaction.category}</Badge><div className="hidden sm:block"><p className="text-[10px] text-muted-foreground">{transaction.date}</p><span className={cn("mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]",transaction.status==="Conciliado"?"border-positive/25 bg-positive/10 text-positive":transaction.status==="Pendiente"?"border-gold/25 bg-gold/10 text-gold":"border-line bg-foreground/[0.04] text-muted-foreground")}><span className={cn("size-1 rounded-full",transaction.status==="Conciliado"?"bg-positive":transaction.status==="Pendiente"?"bg-gold":"bg-muted-foreground")}/>{transaction.status}</span></div><div className={cn("text-right font-mono text-sm tabular-nums",transaction.type==="credit"&&"text-positive")}>{transaction.type==="credit"?"+":"−"}{formatCurrency(Math.abs(transaction.amount),true)}</div>
      </div>)}{visible.length===0&&<p className="py-12 text-center text-sm text-muted-foreground">No encontramos movimientos con ese criterio.</p>}</div>
      <div className="px-5 pt-4 text-right sm:px-9"><Button variant="ghost" size="sm" className="rounded-full text-xs text-muted-foreground hover:text-foreground">Ver todos <ArrowRight/></Button></div>
    </section>
  );
}

function Field({label,id,...props}:React.ComponentProps<typeof Input>&{label:string;id:string}){return <div className="grid gap-2"><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><Input id={id} className="glass-input h-12 rounded-xl" {...props}/></div>}
function RegisterDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const [type,setType]=useState<"Ingreso"|"Egreso">("Egreso");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="modal-glass max-w-md rounded-[2rem] border-line/80 p-7"><DialogHeader><DialogTitle className="font-display text-4xl">Registrar movimiento</DialogTitle><DialogDescription>Agrega un movimiento manual a tu consolidado patrimonial.</DialogDescription></DialogHeader><div className="mt-3 grid gap-5"><div className="grid grid-cols-2 gap-2 rounded-full border border-line bg-background/30 p-1.5">{(["Ingreso","Egreso"] as const).map((item)=><Button key={item} variant="ghost" onClick={()=>setType(item)} className={cn("rounded-full text-xs text-muted-foreground",type===item&&"bg-primary/10 text-primary")}>{item==="Ingreso"?<ArrowDownLeft/>:<ArrowUpRight/>}{item}</Button>)}</div><Field label="Valor" id="amount" placeholder="$ 0 COP" inputMode="numeric"/><Field label="Descripción" id="description" placeholder="Ej. Honorarios de asesoría"/><div className="grid gap-2"><Label htmlFor="category" className="text-xs text-muted-foreground">Categoría</Label><select id="category" className="glass-input h-12 w-full rounded-xl px-3 text-sm outline-none"><option>Inversiones</option><option>Inmuebles</option><option>Honorarios</option><option>Protección</option><option>Otros</option></select></div><Field label="Fecha" id="date" type="date" defaultValue="2026-09-22"/></div><DialogFooter className="mt-3 gap-2"><Button variant="ghost" onClick={()=>onOpenChange(false)} className="rounded-full text-muted-foreground">Cancelar</Button><Button onClick={()=>onOpenChange(false)} className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">Guardar movimiento</Button></DialogFooter></DialogContent></Dialog>;
}

export function FinancialDashboard(){
  const [registerOpen,setRegisterOpen]=useState(false);
  return <div className="lumen-atmosphere min-h-screen overflow-hidden bg-background font-sans text-foreground"><Header/><CommandCenter onRegister={()=>setRegisterOpen(true)}/><main className="relative mx-auto w-full max-w-[1500px] px-5 pb-20 sm:px-10 lg:px-14"><WealthStage/><div className="editorial-divider"/><WealthChart/><div className="relative mt-4 lg:min-h-[560px]"><div className="lg:w-[72%]"><Transactions/></div><div className="mt-8 lg:absolute lg:-right-3 lg:top-10 lg:mt-0 lg:w-[36%]"><AllocationPanel/></div></div><footer className="mt-24 flex flex-col gap-3 border-t border-line/50 pt-6 text-[10px] uppercase text-muted-foreground sm:flex-row sm:justify-between"><p className="flex items-center gap-2"><Landmark className="size-3.5"/>Lumen Private Wealth</p><p>Última sincronización 11:03 · Cifras en pesos colombianos</p></footer></main><RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen}/></div>;
}
