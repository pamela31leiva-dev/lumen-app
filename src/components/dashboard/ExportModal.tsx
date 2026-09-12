'use client';

import { useState } from 'react';
import { getExportDataset } from '@/actions/export';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface ExportModalProps {
  spaceId: string;
}

type PeriodPreset = 'this_month' | 'last_3_months' | 'this_year' | 'all';
type ExportFormat = 'xlsx' | 'csv' | 'json';

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_3_months', label: 'Ultimos 3 meses' },
  { value: 'this_year', label: 'Este año' },
  { value: 'all', label: 'Todo el historico' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'xlsx', label: 'Excel', hint: 'Reportes con formulas' },
  { value: 'csv', label: 'CSV', hint: 'Un archivo por tabla' },
  { value: 'json', label: 'JSON', hint: 'Estructurado, para otras apps' },
];

function resolvePeriod(preset: PeriodPreset): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  switch (preset) {
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case 'last_3_months':
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end };
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'all':
      return { start: new Date(2000, 0, 1), end };
  }
}

/**
 * Exportacion a Excel con plantillas fijas (Flujo de Caja, Balance por
 * Categorias, Estado de Resultados) -- deliberadamente NO es una consulta
 * abierta a la IA: el unico parametro es un rango de fechas predefinido, y
 * todos los numeros vienen de Postgres (ver actions/export.ts), nunca
 * inventados por un LLM. `xlsx` solo se descarga cuando el usuario abre este
 * modal (dynamic import en el componente padre), igual que BulkImportModal.
 */
export function ExportModal({ spaceId }: ExportModalProps) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsExporting(true);
    try {
      const { start, end } = resolvePeriod(period);
      const dataset = await getExportDataset(spaceId, start.toISOString(), end.toISOString());
      if ('error' in dataset) {
        setError(dataset.error);
        return;
      }
      if (dataset.transactions.length === 0 && dataset.accounts.length === 0 && dataset.bills.length === 0) {
        setError('No hay datos para exportar en ese periodo.');
        return;
      }

      if (format === 'xlsx') {
        if (dataset.transactions.length === 0) {
          setError('No hay movimientos confirmados en ese periodo.');
          return;
        }
        const [{ buildExportWorkbook, exportFileName }, XLSX] = await Promise.all([
          import('@/lib/export/build-workbook'),
          import('xlsx'),
        ]);
        const workbook = buildExportWorkbook(dataset);
        XLSX.writeFile(workbook, exportFileName(dataset));
      } else if (format === 'csv') {
        const { downloadCsvExport } = await import('@/lib/export/build-portable');
        downloadCsvExport(dataset);
      } else {
        const { downloadJsonExport } = await import('@/lib/export/build-portable');
        downloadJsonExport(dataset);
      }
      setOpen(false);
    } catch (err) {
      console.error('Error al generar el archivo de exportacion:', err);
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 text-xs font-medium text-gold transition hover:bg-gold/20"
      >
        Exportar datos
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-elevated p-6 shadow-xl">
            <h2 className="text-base font-medium text-stone-100">Exportar reporte</h2>
            <p className="mt-1 text-xs text-stone-500">
              {format === 'xlsx'
                ? 'Genera un Excel con Flujo de Caja, Balance por Categorias y Estado de Resultados de los movimientos confirmados en el periodo elegido.'
                : 'Descarga tus movimientos, cuentas y facturas tal cual viven en Lumen -- Portabilidad de Datos, sin encerrarte en un solo formato.'}
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-stone-400">Formato</label>
              <CustomSelect value={format} onChange={(value) => setFormat(value as ExportFormat)} options={FORMAT_OPTIONS} />
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-stone-400">Periodo</label>
              <CustomSelect
                value={period}
                onChange={(value) => setPeriod(value as PeriodPreset)}
                options={PERIOD_OPTIONS}
              />
              {format !== 'xlsx' && (
                <p className="mt-1 text-[11px] text-stone-600">Cuentas y facturas se incluyen completas -- el periodo solo filtra movimientos.</p>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isExporting}
                className="rounded-lg px-3 py-2 text-sm text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-60"
              >
                {isExporting ? 'Generando...' : `Descargar .${format}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
