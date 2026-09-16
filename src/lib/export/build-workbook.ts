import * as XLSX from 'xlsx';
import type { ExportDataset, ExportTransactionRow } from '@/actions/export';
import { TAX_TREATMENT_LABEL, type TaxTreatment } from '@/domain/types/fiscal';

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
    'Clasificacion Fiscal': t.taxTreatment ? (TAX_TREATMENT_LABEL[t.taxTreatment as TaxTreatment] ?? t.taxTreatment) : '',
    Cuenta: t.accountName ?? '(Sin cuenta)',
    Descripcion: t.description ?? '',
    [`Monto (${dataset.baseCurrency})`]: t.type === 'expense' ? -t.amountBase : t.type === 'income' ? t.amountBase : 0,
    [`Retencion (${dataset.baseCurrency})`]: t.withholdingTaxAmount ?? '',
    CUFE: t.cufe ?? '',
  }));
  flujoRows.push({
    Fecha: '',
    Tipo: '',
    Categoria: '',
    'Clasificacion Fiscal': '',
    Cuenta: '',
    Descripcion: 'Flujo neto del periodo',
    [`Monto (${dataset.baseCurrency})`]: totalIncome - totalExpense,
    [`Retencion (${dataset.baseCurrency})`]: '',
    CUFE: '',
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

  // Resumen Fiscal (Bloque P5): suma por tratamiento fiscal YA declarado
  // (Ajustes > Clasificacion Tributaria) -- nunca calcula impuesto, solo
  // agrupa lo que la persona ya clasifico. "Sin clasificar" queda visible a
  // proposito: un consolidado incompleto no deberia verse igual de limpio
  // que uno completo.
  const fiscalTotals = new Map<string, number>();
  let withholdingTotal = 0;
  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    const key = t.taxTreatment ?? (t.type === 'income' ? 'income_sin_clasificar' : 'expense_sin_clasificar');
    fiscalTotals.set(key, (fiscalTotals.get(key) ?? 0) + t.amountBase);
    withholdingTotal += t.withholdingTaxAmount ?? 0;
  }
  const fiscalLabel: Record<string, string> = {
    ...TAX_TREATMENT_LABEL,
    income_sin_clasificar: 'Ingresos sin clasificar',
    expense_sin_clasificar: 'Gastos sin clasificar',
  };
  const fiscalAmountKey = `Total (${dataset.baseCurrency})`;
  const fiscalRows: Record<string, string | number>[] = Array.from(fiscalTotals.entries())
    .filter(([, total]) => total !== 0)
    .map(([key, total]) => ({ Rubro: fiscalLabel[key] ?? key, [fiscalAmountKey]: total }));
  fiscalRows.push({ Rubro: '', [fiscalAmountKey]: '' });
  fiscalRows.push({ Rubro: 'Retenciones en la fuente declaradas', [fiscalAmountKey]: withholdingTotal });
  const fiscalSheet = XLSX.utils.json_to_sheet(fiscalRows);
  XLSX.utils.book_append_sheet(workbook, fiscalSheet, 'Resumen Fiscal');

  return workbook;
}

export function exportFileName(dataset: ExportDataset): string {
  const safeSpaceName = dataset.spaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const start = dataset.periodStart.slice(0, 10);
  const end = dataset.periodEnd.slice(0, 10);
  return `lumen-${safeSpaceName}-${start}_a_${end}.xlsx`;
}
