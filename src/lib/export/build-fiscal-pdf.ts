import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ExportDataset } from '@/actions/export';
import { TAX_TREATMENT_LABEL } from '@/domain/types/fiscal';

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO');
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

/**
 * Certificado PDF con trazabilidad de CUFE (Bloque P5): un resumen fiscal
 * ya sumado por Postgres (nunca calculado aqui) mas la lista de movimientos
 * que tienen una factura electronica XML detras (CUFE verificable ante la
 * DIAN). Pensado para entregar a un contador o guardar como respaldo -- NO
 * es una declaracion tributaria ni reemplaza asesoria profesional, por eso
 * el aviso es lo primero que se ve despues del encabezado.
 */
export function buildFiscalCertificatePdf(dataset: ExportDataset): jsPDF {
  const doc = new jsPDF();
  const { transactions, baseCurrency, spaceName, periodStart, periodEnd } = dataset;

  doc.setFontSize(16);
  doc.text('Certificado de Movimientos Fiscales', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${spaceName} · ${formatDateOnly(periodStart)} a ${formatDateOnly(periodEnd)}`, 14, 25);
  doc.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 14, 30);

  doc.setFontSize(8);
  doc.setTextColor(140);
  const disclaimer =
    'Este documento resume la clasificacion fiscal que TU declaraste en Lumen (gravado/exento/no gravado/deducible) y las retenciones que registraste. No es una declaracion tributaria, no calcula impuesto a pagar y no reemplaza la revision de un contador -- verifica cada cifra antes de usarla en un tramite oficial.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, 182);
  doc.text(disclaimerLines, 14, 37);

  let cursorY = 37 + disclaimerLines.length * 4 + 6;

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

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text('Resumen Fiscal', 14, cursorY);
  cursorY += 4;

  autoTable(doc, {
    startY: cursorY,
    head: [['Rubro', `Monto (${baseCurrency})`]],
    body: [
      ...Array.from(fiscalTotals.entries())
        .filter(([, total]) => total !== 0)
        .map(([key, total]) => [fiscalLabel[key] ?? key, formatAmount(total, baseCurrency)]),
      ['Retenciones en la fuente declaradas', formatAmount(withholdingTotal, baseCurrency)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 9 },
  });

  const cufeRows = transactions.filter((t) => t.cufe);
  if (cufeRows.length > 0) {
    // @ts-expect-error -- lastAutoTable se agrega en runtime por el plugin, no esta en los tipos base de jsPDF.
    const afterFiscalY = doc.lastAutoTable.finalY as number;
    doc.setFontSize(12);
    doc.text('Trazabilidad de Facturas Electronicas (CUFE)', 14, afterFiscalY + 10);

    autoTable(doc, {
      startY: afterFiscalY + 14,
      head: [['Fecha', 'Descripcion', `Monto (${baseCurrency})`, 'CUFE']],
      body: cufeRows.map((t) => [formatDateOnly(t.transactionDate), t.description ?? '', formatAmount(t.amountBase, baseCurrency), t.cufe ?? '']),
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30] },
      styles: { fontSize: 7, overflow: 'linebreak' },
      columnStyles: { 3: { cellWidth: 70 } },
    });
  }

  return doc;
}

export function fiscalCertificateFileName(dataset: ExportDataset): string {
  const safeSpaceName = dataset.spaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const start = dataset.periodStart.slice(0, 10);
  const end = dataset.periodEnd.slice(0, 10);
  return `lumen-certificado-fiscal-${safeSpaceName}-${start}_a_${end}.pdf`;
}
