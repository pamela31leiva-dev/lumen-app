import type { ExportDataset } from '@/actions/export';

/**
 * Portabilidad de Datos: CSV y JSON estructurado, complementando el Excel de
 * grado profesional (build-workbook.ts). A diferencia del Excel (pensado
 * para un contador, con hojas resumen calculadas), esto es el dato crudo tal
 * cual vive en Lumen -- transacciones, cuentas y facturas -- para que la
 * persona pueda llevarselo a cualquier otra herramienta sin perder nada.
 */

function safeSpaceSlug(spaceName: string): string {
  return spaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // RFC 4180: si el valor trae coma, comilla o salto de linea, se envuelve en
  // comillas dobles y las comillas internas se escapan duplicandolas.
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function toCsv(headers: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  // BOM UTF-8 al inicio: sin esto, Excel en Windows muestra tildes/eñes rotas al abrir el CSV.
  return '﻿' + lines.join('\r\n');
}

export function buildTransactionsCsv(dataset: ExportDataset): string {
  return toCsv(
    ['Fecha', 'Tipo', 'Categoria', 'Cuenta', 'Descripcion', `Monto (${dataset.baseCurrency})`],
    dataset.transactions.map((t) => [
      t.transactionDate.slice(0, 10),
      t.type,
      t.categoryName ?? '',
      t.accountName ?? '',
      t.description ?? '',
      t.amountBase,
    ]),
  );
}

export function buildAccountsCsv(dataset: ExportDataset): string {
  return toCsv(
    ['Nombre', 'Tipo', 'Moneda', 'Activa', 'Saldo inicial', 'Saldo actual'],
    dataset.accounts.map((a) => [a.name, a.type, a.currency, a.isActive ? 'si' : 'no', a.openingBalance, a.currentBalance]),
  );
}

export function buildBillsCsv(dataset: ExportDataset): string {
  return toCsv(
    ['Descripcion', 'Monto', 'Moneda', 'Fecha limite', 'Estado'],
    dataset.bills.map((b) => [b.description, b.amount, b.currency, b.dueDate, b.status === 'paid' ? 'pagada' : 'pendiente']),
  );
}

export function buildJsonExport(dataset: ExportDataset): string {
  return JSON.stringify(
    {
      espacio: dataset.spaceName,
      monedaBase: dataset.baseCurrency,
      periodo: { desde: dataset.periodStart, hasta: dataset.periodEnd },
      generadoEl: new Date().toISOString(),
      cuentas: dataset.accounts,
      transacciones: dataset.transactions,
      facturas: dataset.bills,
    },
    null,
    2,
  );
}

function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Un archivo CSV por entidad (transacciones/cuentas/facturas): cada uno tiene columnas distintas, mezclarlas en un solo CSV perderia la estructura tabular. */
export function downloadCsvExport(dataset: ExportDataset): void {
  const slug = safeSpaceSlug(dataset.spaceName);
  const start = dataset.periodStart.slice(0, 10);
  const end = dataset.periodEnd.slice(0, 10);
  const suffix = `${slug}-${start}_a_${end}.csv`;

  if (dataset.transactions.length > 0) downloadTextFile(`lumen-transacciones-${suffix}`, buildTransactionsCsv(dataset), 'text/csv;charset=utf-8');
  if (dataset.accounts.length > 0) downloadTextFile(`lumen-cuentas-${suffix}`, buildAccountsCsv(dataset), 'text/csv;charset=utf-8');
  if (dataset.bills.length > 0) downloadTextFile(`lumen-facturas-${suffix}`, buildBillsCsv(dataset), 'text/csv;charset=utf-8');
}

export function downloadJsonExport(dataset: ExportDataset): void {
  const slug = safeSpaceSlug(dataset.spaceName);
  const start = dataset.periodStart.slice(0, 10);
  const end = dataset.periodEnd.slice(0, 10);
  downloadTextFile(`lumen-${slug}-${start}_a_${end}.json`, buildJsonExport(dataset), 'application/json;charset=utf-8');
}
