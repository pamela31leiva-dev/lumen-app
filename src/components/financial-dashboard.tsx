import { useState } from "react";
import {
  Bell,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Mic,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const assetGroups = [
  {
    id: "variable",
    index: "01",
    label: "Renta Variable",
    value: "$5,12 MRD",
    share: "38,0%",
    change: "+11,4%",
    tone: "emerald",
  },
  {
    id: "fixed",
    index: "02",
    label: "Renta Fija",
    value: "$3,64 MRD",
    share: "27,0%",
    change: "+6,2%",
    tone: "gold",
  },
  {
    id: "liquidity",
    index: "03",
    label: "Liquidez",
    value: "$1,89 MRD",
    share: "14,0%",
    change: "+2,8%",
    tone: "mist",
  },
] as const;

function Header() {
  return (
    <header className="lumen-header">
      <div className="flex items-center gap-3">
        <div className="brand-sigil" aria-hidden="true">L</div>
        <div>
          <p className="font-display text-[1.15rem] font-semibold leading-none">Lumen</p>
          <p className="mt-1 text-[9px] uppercase text-muted-foreground">Private Wealth</p>
        </div>
      </div>
      <nav className="hidden items-center gap-7 text-[11px] text-muted-foreground md:flex" aria-label="Navegación principal">
        <a className="text-foreground" href="#patrimonio">Patrimonio</a>
        <a className="transition-colors hover:text-foreground" href="#activos">Activos</a>
        <a className="transition-colors hover:text-foreground" href="#actividad">Actividad</a>
      </nav>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="glass-control relative size-9 rounded-full" aria-label="Notificaciones">
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-1 rounded-full bg-gold" />
        </Button>
        <div className="hidden items-center gap-2.5 sm:flex">
          <div className="grid size-8 place-items-center rounded-full border border-line bg-elev/60 text-[10px] text-primary">PL</div>
          <div className="leading-tight">
            <p className="text-[11px] font-medium">Pamela Leiva</p>
            <p className="text-[9px] text-muted-foreground">Family Office</p>
          </div>
          <ChevronDown className="size-3 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}

function CommandCenter() {
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);

  const submit = () => setQuery("");

  return (
    <section className="compact-command" aria-label="Centro de comandos">
      <div className="compact-command-aura" />
      <div className="compact-command-shell">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Sparkles className="ml-2 size-4 shrink-0 text-primary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            className="h-10 min-w-0 border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
            placeholder="Pregunta por tu patrimonio…"
            aria-label="Consulta patrimonial"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l border-line/70 pl-1.5">
          <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground" aria-label="Adjuntar archivo"><Paperclip className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setListening((value) => !value)} className={cn("size-8 rounded-full text-muted-foreground", listening && "bg-primary/10 text-primary")} aria-label={listening ? "Detener micrófono" : "Activar micrófono"}><Mic className={cn("size-3.5", listening && "animate-pulse")} /></Button>
          <Button size="icon" onClick={submit} className="size-8 rounded-full" aria-label="Enviar consulta"><Send className="size-3.5" /></Button>
        </div>
      </div>
      <div className="command-shortcuts">
        <Button variant="ghost" size="sm"><Plus />Registrar</Button>
        <Button variant="ghost" size="sm"><FileSpreadsheet />Importar CSV</Button>
        <Button variant="ghost" size="sm"><FileText />Factura XML</Button>
      </div>
    </section>
  );
}

function WealthBlob() {
  return (
    <section id="patrimonio" className="wealth-blob" aria-labelledby="wealth-title">
      <div className="blob-ring blob-ring-one" />
      <div className="blob-ring blob-ring-two" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Patrimonio total</p>
          <span className="flex items-center gap-1.5 text-[10px] text-positive"><span className="size-1.5 rounded-full bg-positive" />En línea</span>
        </div>
        <div>
          <p id="wealth-title" className="wealth-total font-display">$13,49</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <span className="font-display text-xl font-medium text-foreground/80 sm:text-2xl">mil millones COP</span>
            <div className="flex items-center gap-1.5 rounded-full border border-positive/20 bg-positive/10 px-2.5 py-1 text-[10px] font-medium text-positive">
              <TrendingUp className="size-3" />+8,42%
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 border-t border-line/70 pt-4">
          <div><p className="text-[9px] uppercase text-muted-foreground">Variación anual</p><p className="mt-1.5 font-display text-base font-medium">+$1,05 MRD</p></div>
          <div><p className="text-[9px] uppercase text-muted-foreground">Última actualización</p><p className="mt-1.5 text-xs font-medium">Hoy · 11:03</p></div>
        </div>
      </div>
    </section>
  );
}

function AssetStack() {
  const [active, setActive] = useState("variable");
  return (
    <section id="activos" className="asset-stack" aria-label="Distribución de activos">
      <div className="mb-2 flex items-end justify-between px-1">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Arquitectura patrimonial</p>
          <h2 className="mt-1 font-display text-xl font-medium">Activos</h2>
        </div>
        <p className="text-[10px] text-muted-foreground">Total consolidado</p>
      </div>
      {assetGroups.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => setActive(asset.id)}
          className={cn("asset-module", `asset-${asset.tone}`, active === asset.id && "is-active")}
        >
          <span className="asset-index">{asset.index}</span>
          <span className="min-w-0">
            <span className="block text-[10px] text-muted-foreground">{asset.label}</span>
            <span className="mt-1 block truncate font-display text-xl font-medium sm:text-2xl">{asset.value}</span>
          </span>
          <span className="ml-auto text-right">
            <span className="block font-mono text-[11px] font-medium">{asset.share}</span>
            <span className="mt-1 block text-[9px] text-positive">{asset.change} anual</span>
          </span>
        </button>
      ))}
    </section>
  );
}

function ActivityRail() {
  return (
    <section id="actividad" className="activity-rail" aria-label="Resumen de actividad">
      <div className="flex items-center gap-2"><WalletCards className="size-3.5 text-primary" /><span className="text-[10px] text-muted-foreground">Liquidez disponible</span><strong className="font-display text-sm font-medium">$286,4 M</strong></div>
      <div className="hidden h-3 w-px bg-line sm:block" />
      <div className="hidden items-center gap-2 sm:flex"><span className="text-[10px] text-muted-foreground">Cobertura</span><strong className="font-display text-sm font-medium">18,6 meses</strong></div>
      <div className="ml-auto flex items-center gap-2"><span className="size-1.5 rounded-full bg-positive" /><span className="text-[10px] text-muted-foreground">Cuentas conciliadas</span></div>
    </section>
  );
}

export function FinancialDashboard() {
  return (
    <div className="lumen-atmosphere min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="single-screen-shell">
        <Header />
        <CommandCenter />
        <main className="portfolio-scene">
          <WealthBlob />
          <AssetStack />
        </main>
        <ActivityRail />
      </div>
    </div>
  );
}