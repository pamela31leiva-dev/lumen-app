import * as XLSX from 'xlsx';
import type { ExportDataset, ExportTransactionRow } from '@/actions/export';

const TYPE_LABEL: Record<ExportTransactionRow['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO');
}

interface CategoryTotal {
  categoryName: string;
  kind: 'income' | 'expense';
  total: number;
}

function totalsByCategory(transactions: ExportTransactionRow[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    const categoryName = t.categoryName ?? '(Sin categoria)';
    const key = `${categoryName}__${t.type}`;
    const existing = totals.get(key);
    if (existing) {
      existing.total += t.amountBase;
    } else {
      totals.set(key, { categoryName, kind: t.type, total: t.amountBase });
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}

/**
 * Construye el libro de Excel a partir de un ExportDataset ya resuelto por
 * Postgres (ver actions/export.ts). Todo el calculo aqui es aritmetica
 * simple sobre numeros ya deterministicos -- ninguna cifra la propone la IA.
 * Tres hojas de grado profesional pensadas para un contador o para revision
 * propia: Flujo de Caja (detalle cronologico), Balance por Categorias
 * (totales agrupados) y Estado de Resultados (ingresos - gastos = utilidad).
 */
export function buildExportWorkbook(dataset: ExportDataset): XLSX.WorkBook {
  const { transactions } = dataset;
  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amountBase, 0);
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amountBase, 0);

  const workbook = XLSX.utils.book_new();

  const flujoRows = transactions.map((t) => ({
    Fecha: formatDateOnly(t.transactionDate),
    Tipo: TYPE_LABEL[t.type],
    Categoria: t.categoryName ?? '(Sin categoria)',
    Cuenta: t.accountName ?? '(Sin cuenta)',
    Descripcion: t.description ?? '',
    [`Monto (${dataset.baseCurrency})`]: t.type === 'expense' ? -t.amountBase : t.type === 'income' ? t.amountBase : 0,
  }));
  flujoRows.push({
    Fecha: '',
    Tipo: '',
    Categoria: '',
    Cuenta: '',
    Descripcion: 'Flujo neto del periodo',
    [`Monto (${dataset.baseCurrency})`]: totalIncome - totalExpense,
  });
  const flujoSheet = XLSX.utils.json_to_sheet(flujoRows);
  XLSX.utils.book_append_sheet(workbook, flujoSheet, 'Flujo de Caja');

  const categoryTotals = totalsByCategory(transactions);
  const balanceRows = categoryTotals.map((c) => ({
    Categoria: c.categoryName,
    Tipo: TYPE_LABEL[c.kind],
    [`Total (${dataset.baseCurrency})`]: c.total,
  }));
  const balanceSheet = XLSX.utils.json_to_sheet(balanceRows);
  XLSX.utils.book_append_sheet(workbook, balanceSheet, 'Balance por Categorias');

  const expenseByCategory = categoryTotals.filter((c) => c.kind === 'expense');
  const amountKey = `Monto (${dataset.baseCurrency})`;
  const resultadosRows: Record<string, string | number>[] = [
    { Concepto: 'Total Ingresos', [amountKey]: totalIncome },
    { Concepto: '', [amountKey]: '' },
    { Concepto: 'Gastos por categoria', [amountKey]: '' },
    ...expenseByCategory.map((c) => ({ Concepto: `   ${c.categoryName}`, [amountKey]: -c.total })),
    { Concepto: '', [amountKey]: '' },
    { Concepto: 'Total Gastos', [amountKey]: -totalExpense },
    { Concepto: 'Utilidad Neta', [amountKey]: totalIncome - totalExpense },
  ];
  const resultadosSheet = XLSX.utils.json_to_sheet(resultadosRows);
  XLSX.utils.book_append_sheet(workbook, resultadosSheet, 'Estado de Resultados');

  return workbook;
}

export function exportFileName(dataset: ExportDataset): string {
  const safeSpaceName = dataset.spaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const start = dataset.periodStart.slice(0, 10);
  const end = dataset.periodEnd.slice(0, 10);
  return `lumen-${safeSpaceName}-${start}_a_${end}.xlsx`;
}
