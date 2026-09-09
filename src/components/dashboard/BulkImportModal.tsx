'use client';

import { useMemo, useRef, useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { processBulkImport } from '@/actions/import';
import { buildImportPreview } from '@/domain/import/parse-row';
import type { ColumnMapping, RawImportRow } from '@/domain/types/import';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'mapping' | 'preview';

const NONE_OPTION = '__none__';

interface BulkImportModalProps {
  spaceId: string;
}

export function BulkImportModal({ spaceId }: BulkImportModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateColumn: '',
    amountColumn: '',
    descriptionColumn: null,
    typeColumn: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (step !== 'preview' || !mapping.dateColumn || !mapping.amountColumn) return null;
    return buildImportPreview(rawRows, mapping);
  }, [step, rawRows, mapping]);

  function resetState() {
    setStep('upload');
    setFileName(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({ dateColumn: '', amountColumn: '', descriptionColumn: null, typeColumn: null });
    setError(null);
    setSuccessMessage(null);
  }

  function handleClose() {
    setOpen(false);
    resetState();
  }

  async function loadFile(file: File) {
    setError(null);
    const validExtension = /\.(csv|xlsx|xls)$/i.test(file.name);
    if (!validExtension) {
      setError('Sube un archivo .csv, .xlsx o .xls.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json<RawImportRow>(sheet, { defval: '', raw: false });

      if (json.length === 0) {
        setError('No se encontraron filas en el archivo.');
        return;
      }

      const detectedHeaders = Object.keys(json[0]);
      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRawRows(json);
      setMapping({
        dateColumn: detectedHeaders[0] ?? '',
        amountColumn: detectedHeaders[1] ?? '',
        descriptionColumn: detectedHeaders[2] ?? null,
        typeColumn: null,
      });
      setStep('mapping');
    } catch (err) {
      console.error('Error al leer el archivo:', err);
      setError('No se pudo leer el archivo. Verifica que sea un CSV o Excel valido.');
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  }

  function handleSubmitImport() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await processBulkImport(spaceId, rawRows, mapping);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccessMessage(
        `Se importaron ${result.importedCount} movimientos a "Por confirmar"${
          result.skippedCount > 0 ? ` (se omitieron ${result.skippedCount} filas con datos incompletos)` : ''
        }.`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/20"
      >
        Importar extracto (CSV)
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-base font-medium text-stone-100">Importar extracto</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  CSV o Excel de tu banco. Cada fila entra como pendiente por confirmar; nada afecta tus saldos hasta
                  que la revises.
                </p>
              </div>
              <button type="button" onClick={handleClose} className="text-sm text-stone-400 hover:text-stone-200">
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 'upload' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition',
                    isDragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/10',
                  )}
                >
                  <p className="text-sm text-stone-300">Arrastra tu archivo aqui, o</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
                  >
                    Elegir archivo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadFile(file);
                    }}
                  />
                  <p className="text-xs text-stone-600">Formatos soportados: .csv, .xlsx, .xls</p>
                </div>
              )}

              {step === 'mapping' && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-stone-500">
                    Archivo <span className="text-stone-300">{fileName}</span> · {rawRows.length} filas detectadas.
                    Indica que columna corresponde a cada campo.
                  </p>

                  <MappingSelect
                    label="Fecha"
                    required
                    headers={headers}
                    value={mapping.dateColumn}
                    onChange={(value) => setMapping((m) => ({ ...m, dateColumn: value }))}
                  />
                  <MappingSelect
                    label="Monto"
                    required
                    headers={headers}
                    value={mapping.amountColumn}
                    onChange={(value) => setMapping((m) => ({ ...m, amountColumn: value }))}
                  />
                  <MappingSelect
                    label="Descripcion"
                    headers={headers}
                    value={mapping.descriptionColumn ?? ''}
                    allowNone
                    onChange={(value) => setMapping((m) => ({ ...m, descriptionColumn: value || null }))}
                  />
                  <MappingSelect
                    label="Tipo (ingreso/gasto)"
                    headers={headers}
                    value={mapping.typeColumn ?? ''}
                    allowNone
                    noneLabel="Sin columna: asumir 'Gasto' para todas"
                    onChange={(value) => setMapping((m) => ({ ...m, typeColumn: value || null }))}
                  />

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <div className="mt-2 flex justify-between">
                    <button type="button" onClick={resetState} className="text-sm text-stone-400 hover:text-stone-200">
                      Elegir otro archivo
                    </button>
                    <button
                      type="button"
                      disabled={!mapping.dateColumn || !mapping.amountColumn}
                      onClick={() => setStep('preview')}
                      className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Ver vista previa
                    </button>
                  </div>
                </div>
              )}

              {step === 'preview' && preview && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="rounded-full bg-emerald-600/15 px-3 py-1 font-medium text-emerald-400">
                      {preview.validRows.length} filas listas para importar
                    </span>
                    {preview.invalidRows.length > 0 && (
                      <span className="rounded-full bg-gold/15 px-3 py-1 font-medium text-gold">
                        {preview.invalidRows.length} filas con datos incompletos (se omiten)
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-obsidian text-stone-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Monto</th>
                          <th className="px-3 py-2 font-medium">Tipo</th>
                          <th className="px-3 py-2 font-medium">Descripcion</th>
                          <th className="px-3 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {[...preview.validRows.slice(0, 8), ...preview.invalidRows.slice(0, 4)].map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'text-stone-500' : 'text-stone-200'}>
                            <td className="px-3 py-2">
                              {row.transactionDate ? new Date(row.transactionDate).toLocaleDateString('es-CO') : '—'}
                            </td>
                            <td className="px-3 py-2">{row.amountOriginal ?? '—'}</td>
                            <td className="px-3 py-2 capitalize">{row.type}</td>
                            <td className="max-w-[160px] truncate px-3 py-2">{row.description ?? '—'}</td>
                            <td className="px-3 py-2">
                              {row.errors.length > 0 ? (
                                <span className="text-gold">Revisar: {row.errors.join(', ')}</span>
                              ) : (
                                <span className="text-emerald-400">Lista</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {error && <p className="text-xs text-red-400">{error}</p>}
                  {successMessage && <p className="text-xs text-emerald-400">{successMessage}</p>}

                  <div className="mt-2 flex justify-between">
                    <button type="button" onClick={() => setStep('mapping')} className="text-sm text-stone-400 hover:text-stone-200">
                      Ajustar mapeo
                    </button>
                    {successMessage ? (
                      <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
                      >
                        Listo
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending || preview.validRows.length === 0}
                        onClick={handleSubmitImport}
                        className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isPending ? 'Importando...' : `Importar ${preview.validRows.length} filas`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface MappingSelectProps {
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
}

function MappingSelect({ label, headers, value, onChange, required, allowNone, noneLabel }: MappingSelectProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-300">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <select
        value={value || NONE_OPTION}
        onChange={(e) => onChange(e.target.value === NONE_OPTION ? '' : e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      >
        {(allowNone || !required) && <option value={NONE_OPTION}>{noneLabel ?? 'Ninguna'}</option>}
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );
}
