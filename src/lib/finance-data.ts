export const wealthHistory = [
  { month: "Oct", value: 11380 },
  { month: "Nov", value: 11520 },
  { month: "Dic", value: 11470 },
  { month: "Ene", value: 11760 },
  { month: "Feb", value: 11910 },
  { month: "Mar", value: 12180 },
  { month: "Abr", value: 12090 },
  { month: "May", value: 12440 },
  { month: "Jun", value: 12620 },
  { month: "Jul", value: 12890 },
  { month: "Ago", value: 13140 },
  { month: "Sep", value: 13486 },
];

export const wealthMetrics = {
  netWorth: 13_486_290_000,
  monthlyLiquidity: 286_420_000,
  monthlyIncome: 412_800_000,
  monthlyOutflow: 126_380_000,
  twelveMonthReturn: 8.42,
  cashCoverage: 18.6,
};

export const allocation = [
  { name: "Mercados públicos", value: 38, token: "bg-positive" },
  { name: "Activos privados", value: 27, token: "bg-chart-2" },
  { name: "Bienes raíces", value: 21, token: "bg-gold" },
  { name: "Liquidez", value: 14, token: "bg-chart-5" },
];

export type Transaction = {
  id: string;
  counterparty: string;
  detail: string;
  category: string;
  date: string;
  status: "Conciliado" | "Pendiente" | "Programado";
  amount: number;
  type: "credit" | "debit";
  initials: string;
};

export const transactions: Transaction[] = [
  {
    id: "tx-8041",
    counterparty: "Fondo BlackRock Global Allocation",
    detail: "Distribución trimestral · Portafolio 0821",
    category: "Inversiones",
    date: "Hoy, 09:42",
    status: "Conciliado",
    amount: 48_920_000,
    type: "credit",
    initials: "BR",
  },
  {
    id: "tx-8038",
    counterparty: "Administración Torre 93",
    detail: "Cuota de administración · Septiembre",
    category: "Inmuebles",
    date: "Hoy, 07:18",
    status: "Conciliado",
    amount: -8_740_000,
    type: "debit",
    initials: "T9",
  },
  {
    id: "tx-8034",
    counterparty: "Bancolombia Fiduciaria",
    detail: "Rendimientos FIC Renta Liquidez",
    category: "Rendimientos",
    date: "Ayer, 16:05",
    status: "Conciliado",
    amount: 16_380_000,
    type: "credit",
    initials: "BF",
  },
  {
    id: "tx-8029",
    counterparty: "Cardif Colombia Seguros",
    detail: "Prima anual · Póliza patrimonial",
    category: "Protección",
    date: "21 sep, 11:30",
    status: "Pendiente",
    amount: -12_460_000,
    type: "debit",
    initials: "CS",
  },
  {
    id: "tx-8022",
    counterparty: "Tributi Private Advisory",
    detail: "Planeación fiscal · Q3 2026",
    category: "Honorarios",
    date: "20 sep, 14:12",
    status: "Programado",
    amount: -6_850_000,
    type: "debit",
    initials: "TP",
  },
];