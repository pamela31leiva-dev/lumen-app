'use client';

import { useState } from 'react';
import { getIdentitySnapshot } from '@/actions/dashboard';
import { IdentitySnapshotCard } from '@/components/dashboard/IdentitySnapshotCard';
import type { IdentitySnapshot } from '@/domain/types/dashboard';

/** Punto de entrada de "Asi te conozco" -- vive en /settings junto a "Tu año en números", mismo patron de fetch-on-open. */
export function IdentitySnapshotModal({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<IdentitySnapshot | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (snapshot) return;
    setLoading(true);
    const result = await getIdentitySnapshot(spaceId);
    setLoading(false);
    setSnapshot(result);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg border border-gold/30 px-3 py-2 text-sm text-gold transition hover:border-gold/50 hover:bg-gold/10"
      >
        Asi te conozco
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto">
            {loading && <p className="py-10 text-center text-sm text-stone-400">Repasando lo que ya se de ti...</p>}
            {snapshot && !loading && <IdentitySnapshotCard snapshot={snapshot} />}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-stone-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
