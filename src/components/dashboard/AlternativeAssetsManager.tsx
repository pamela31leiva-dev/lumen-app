'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAlternativeAsset, deleteAlternativeAsset } from '@/actions/assets';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CURRENCY_OPTIONS } from '@/domain/currency';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/utils';
import type { AlternativeAssetSummary, AlternativeAssetType } from '@/domain/types/dashboard';

const TYPE_LABEL: Record<AlternativeAssetType, string> = {
  crypto: 'Criptoactivo',
  stock: 'Accion / fondo',
  real_estate: 'Bien raiz',
  vehicle: 'Vehiculo',
  other: 'Otro',
};

const TYPE_OPTIONS = (Object.entries(TYPE_LABEL) as [AlternativeAssetType, string][]).map(([value, label]) => ({ value, label }));

interface AlternativeAssetsManagerProps {
  spaceId: string;
  assets: AlternativeAssetSummary[];
  totalBase: number;
  baseCurrency: string;
  /** RBAC (Bloque P4): owner/admin/editor -- crear (mismo umbral que alternative_assets_insert_editor). */
  canEdit: boolean;
  /** RBAC (Bloque P4): owner/admin -- eliminar (alternative_assets_delete_admin). */
  canManage: boolean;
}

/**
 * Activos Alternativos (Bloque P7): inversiones, cripto y bienes
 * patrimoniales que no son una "cuenta" transaccional -- se declara cuanto se
 * TIENE y cuanto vale la unidad, Postgres calcula el total (current_value,
 * columna generada). El total en moneda base se muestra aparte del
 * Patrimonio Neto de las cuentas por ahora (no se fusionan todavia) para no
 * mezclar un saldo transaccional deterministico con una valuacion que la
 * persona actualiza a mano cuando quiere.
 */
export function AlternativeAssetsManager({ spaceId, assets, totalBase, baseCurrency, canEdit, canManage }: AlternativeAssetsManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<AlternativeAssetType>('crypto');
  const [currency, setCurrency] = useState(baseCurrency);
  const [quantity, setQuantity] = useState('1');
  const [unitValue, setUnitValue] = useState('');
  const [notes, setNotes] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setName('');
    setAssetType('crypto');
    setCurrency(baseCurrency);
    setQuantity('1');
    setUnitValue('');
    setNotes('');
    setShowForm(false);
  }

  function handleCreate() {
    setError(null);
    const parsedQuantity = Number(quantity);
    const parsedUnitValue = Number(unitValue);

    startTransition(async () => {
      try {
        const result = await createAlternativeAsset(spaceId, {
          name,
          assetType,
          currency,
          quantity: parsedQuantity,
          unitValue: parsedUnitValue,
          notes,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        resetForm();
        router.refresh();
      } catch (err) {
        console.error('Error de red al guardar el activo:', err);
        setError('Se perdio la conexion antes de guardar. Intenta de nuevo.');
      }
    });
  }

  function handleDelete(assetId: string) {
    setError(null);
    setDeletingId(assetId);
    deleteAlternativeAsset(assetId, spaceId)
      .then((result) => {
        setDeletingId(null);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      })
      .catch((err) => {
        console.error('Error de red al eliminar el activo:', err);
        setDeletingId(null);
        setError('Se perdio la conexion antes de eliminar. Intenta de nuevo.');
      });
  }

  return (
    <div className="flex flex-col gap-3">
      {assets.length === 0 &&
        !showForm &&
        (canEdit ? (
          <EmptyState
            title="Sin activos alternativos todavia"
            description="Registra tu primera inversion, criptoactivo o bien patrimonial y sigue su valor por separado de tus cuentas."
            actionLabel="+ Registrar el primero"
            onAction={() => setShowForm(true)}
          />
        ) : (
          <p className="text-xs text-stone-500">Sin activos alternativos todavia.</p>
        ))}

      {assets.map((asset) => (
        <div key={asset.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-stone-200">
              {asset.name} <span className="text-xs text-stone-500">· {TYPE_LABEL[asset.assetType]}</span>
            </p>
            <p className="text-xs text-stone-500">
              {asset.quantity} x {formatMoney(asset.unitValue, asset.currency)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="amount text-sm text-stone-200">{formatMoney(asset.currentValue, asset.currency)}</p>
              {asset.currentValueBase !== null && asset.currency !== baseCurrency && (
                <p className="amount text-xs text-gold">{formatMoney(asset.currentValueBase, baseCurrency)}</p>
              )}
            </div>
            {canManage && (
              <button
                type="button"
                disabled={deletingId === asset.id}
                onClick={() => handleDelete(asset.id)}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {deletingId === asset.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
          </div>
        </div>
      ))}

      {assets.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/10 px-1 pt-2">
          <span className="text-xs font-medium text-stone-400">Total (aprox., moneda base)</span>
          <span className="amount text-sm font-semibold text-gold">{formatMoney(totalBase, baseCurrency)}</span>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {canEdit &&
        (showForm ? (
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-obsidian p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Nombre</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. Bitcoin, Apartamento Chapinero"
                  className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Tipo</label>
                <CustomSelect value={assetType} onChange={(v) => setAssetType(v as AlternativeAssetType)} options={TYPE_OPTIONS} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Cantidad</label>
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 amount text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Valor por unidad</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitValue}
                    onChange={(e) => setUnitValue(e.target.value)}
                    className="w-full min-w-0 rounded-lg border border-white/10 bg-elevated px-3 py-2 amount text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <div className="w-28 shrink-0">
                    <CustomSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-stone-300">Notas (opcional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ej. wallet fria, escritura #123"
                  className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-400 hover:text-stone-200">
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCreate}
                className="rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? 'Guardando...' : 'Guardar activo'}
              </button>
            </div>
          </div>
        ) : (
          assets.length > 0 && (
            <button type="button" onClick={() => setShowForm(true)} className="self-start text-xs font-medium text-gold hover:underline">
              + Nuevo activo
            </button>
          )
        ))}
    </div>
  );
}
