'use client';

import { Fragment, useRef, useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { processUblInvoiceUpload, type UblInvoiceUploadResult } from '@/actions/invoices';
import { cn } from '@/lib/utils';

interface XmlInvoiceUploadModalProps {
  spaceId: string;
}

const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function formatAmount(amount: number, currency: string) {
  if (currency === 'COP') return currencyFormatter.format(amount);
  return `${amount.toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${currency}`;
}

export function XmlInvoiceUploadModal({ spaceId }: XmlInvoiceUploadModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<UblInvoiceUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setResult(null);
  }

  function handleClose() {
    setOpen(false);
    resetState();
  }

  function uploadFile(file: File) {
    if (!/\.xml$/i.test(file.name)) {
      setResult({ success: false, error: 'Sube un archivo .xml (factura electronica UBL de la DIAN).' });
      return;
    }

    setResult(null);
    startTransition(async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const path = `${spaceId}/${crypto.randomUUID()}-${file.name}`;

        const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, { upsert: false });
        if (uploadError) {
          console.error('Error al subir el XML de la factura:', uploadError);
          setResult({ success: false, error: 'No se pudo subir el archivo. Intenta de nuevo.' });
          return;
        }

        const outcome = await processUblInvoiceUpload(spaceId, path, file.name);
        setResult(outcome);
        if (outcome.success) router.refresh();
      } catch (err) {
        console.error('Error de red al procesar la factura XML:', err);
        setResult({ success: false, error: 'Se perdio la conexion antes de terminar. Intenta de nuevo.' });
      }
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-xs font-medium text-sky-400 transition hover:bg-sky-600/20"
      >
        Importar factura (XML)
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-base font-medium text-stone-100">Importar factura electronica</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  XML UBL de la DIAN. Se lee de forma exacta (sin IA) y queda como obligacion en &quot;Facturas&quot;
                  hasta que la pagues.
                </p>
              </div>
              <button type="button" onClick={handleClose} className="text-sm text-stone-400 hover:text-stone-200">
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!result && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition',
                    isDragging ? 'border-sky-500 bg-sky-500/5' : 'border-white/10',
                  )}
                >
                  {isPending ? (
                    <p className="text-sm text-stone-300">Leyendo la factura...</p>
                  ) : (
                    <>
                      <p className="text-sm text-stone-300">Arrastra el archivo XML aqui, o</p>
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
                        accept=".xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadFile(file);
                        }}
                      />
                      <p className="text-xs text-stone-600">Formato soportado: .xml (UBL 2.1)</p>
                    </>
                  )}
                </div>
              )}

              {result && !result.success && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                    {result.error}
                    {result.receiptId && (
                      <p className="mt-1 text-stone-500">
                        El archivo quedo guardado en el Centro de Ingesta para revisarlo manualmente.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={resetState} className="text-sm text-stone-400 hover:text-stone-200">
                      Intentar con otro archivo
                    </button>
                  </div>
                </div>
              )}

              {result && result.success && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-xs text-emerald-400">
                    Factura leida y agregada a &quot;Facturas&quot; como pendiente de pago.
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt className="text-stone-500">Numero</dt>
                    <dd className="text-stone-200">{result.invoice.invoiceNumber}</dd>
                    <dt className="text-stone-500">Emisor</dt>
                    <dd className="text-stone-200">
                      {result.invoice.supplier.name ?? '—'} ({result.invoice.supplier.nit})
                    </dd>
                    <dt className="text-stone-500">Fecha emision</dt>
                    <dd className="text-stone-200">
                      {new Date(result.invoice.issueDate).toLocaleDateString('es-CO')}
                    </dd>
                    {result.invoice.dueDate && (
                      <>
                        <dt className="text-stone-500">Fecha limite</dt>
                        <dd className="text-stone-200">{new Date(result.invoice.dueDate).toLocaleDateString('es-CO')}</dd>
                      </>
                    )}
                    {result.invoice.taxExclusiveAmount !== null && (
                      <>
                        <dt className="text-stone-500">Base gravable</dt>
                        <dd className="text-stone-200">{formatAmount(result.invoice.taxExclusiveAmount, result.invoice.currency)}</dd>
                      </>
                    )}
                    {result.invoice.taxes.map((tax, i) => (
                      <Fragment key={`tax-${i}`}>
                        <dt className="text-stone-500">
                          {tax.schemeName ?? tax.schemeCode ?? 'Impuesto'}
                          {tax.percent !== null ? ` (${tax.percent}%)` : ''}
                        </dt>
                        <dd className="text-stone-200">{formatAmount(tax.taxAmount, result.invoice.currency)}</dd>
                      </Fragment>
                    ))}
                    <dt className="font-medium text-stone-300">Total factura</dt>
                    <dd className="font-medium text-stone-100">{formatAmount(result.invoice.payableAmount, result.invoice.currency)}</dd>
                  </dl>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
                    >
                      Listo
                    </button>
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
