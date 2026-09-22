// Demo data for the financial dashboard — all values are illustrative.

export const kpis = {
  totalBalance: 482940.57,
  income: 1284000,
  expenses: 842000,
  netBalance: 438000,
  savingsRate: 34.2,
  available: 128310,
  invested: 354630,
  incomeChange: 12.4,
  expenseChange: 3.1,
  netChange: 8.9,
  savingsChange: 2.3,
};

export const monthlyData = [
  { month: "Dic", revenue: 92, expense: 58 },
  { month: "Ene", revenue: 98, expense: 62 },
  { month: "Feb", revenue: 85, expense: 55 },
  { month: "Mar", revenue: 104, expense: 63 },
  { month: "Abr", revenue: 96, expense: 60 },
  { month: "May", revenue: 112, expense: 66 },
  { month: "Jun", revenue: 108, expense: 64 },
  { month: "Jul", revenue: 122, expense: 68 },
  { month: "Ago", revenue: 118, expense: 66 },
  { month: "Sep", revenue: 135, expense: 72 },
  { month: "Oct", revenue: 128, expense: 70 },
  { month: "Nov", revenue: 142, expense: 75 },
];

export const budgets = [
  { name: "Nómina", spent: 318, allocated: 400, pct: 79.5 },
  { name: "Nube e infra", spent: 96, allocated: 120, pct: 80 },
  { name: "Marketing", spent: 41, allocated: 80, pct: 51.3 },
  { name: "I+D", spent: 58, allocated: 70, pct: 82.9 },
  { name: "Operaciones", spent: 34, allocated: 50, pct: 68 },
];

export const allocation = [
  { name: "Renta variable", value: 42, color: "#5ee0a0" },
  { name: "Renta fija", value: 29, color: "#5b9bff" },
  { name: "Efectivo", value: 17, color: "#e7c56b" },
  { name: "Alternativos", value: 12, color: "#8a93a8" },
];

export type Transaction = {
  id: string;
  counterparty: string;
  category: string;
  date: string;
  status: "Pagado" | "Pendiente";
  amount: number;
  type: "credit" | "debit";
};

export const transactions: Transaction[] = [
  {
    id: "1",
    counterparty: "Northwind Logistics",
    category: "Factura",
    date: "24 Nov",
    status: "Pagado",
    amount: -18420,
    type: "debit",
  },
  {
    id: "2",
    counterparty: "Meridian Trust Co.",
    category: "Ingresos",
    date: "24 Nov",
    status: "Pagado",
    amount: 64900,
    type: "credit",
  },
  {
    id: "3",
    counterparty: "Atlas Cloud Services",
    category: "Infraestructura",
    date: "23 Nov",
    status: "Pendiente",
    amount: -4210,
    type: "debit",
  },
  {
    id: "4",
    counterparty: "Dividendo trimestral",
    category: "Cartera",
    date: "22 Nov",
    status: "Pagado",
    amount: 9750,
    type: "credit",
  },
  {
    id: "5",
    counterparty: "Payload Staffing",
    category: "Nómina",
    date: "21 Nov",
    status: "Pagado",
    amount: -38600,
    type: "debit",
  },
  {
    id: "6",
    counterparty: "Cascade Legal",
    category: "Servicios",
    date: "20 Nov",
    status: "Pagado",
    amount: 2750,
    type: "credit",
  },
];
