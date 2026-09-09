'use client';

import { useEffect, useState } from 'react';
import { readStoredSessionMode, type SessionMode } from '@/lib/session-preference';

const LABEL: Record<SessionMode, string> = {
  persistent: 'Mantener sesion iniciada (cero friccion)',
  ephemeral: 'Cerrar sesion al salir de este navegador',
};

/**
 * Esto es una preferencia por navegador/dispositivo, no de la cuenta: se
 * elige en cada login (ver /login), no vive en tu perfil. Aqui solo se
 * muestra cual quedo activa la ultima vez que iniciaste sesion en ESTE navegador.
 */
export function SessionPreferenceInfo() {
  const [mode, setMode] = useState<SessionMode | null>(null);

  useEffect(() => {
    setMode(readStoredSessionMode());
  }, []);

  return (
    <div className="rounded-lg border border-white/10 bg-obsidian p-4 text-xs text-stone-400">
      <p className="text-stone-300">
        Preferencia activa en <span className="text-stone-100">este navegador</span>:{' '}
        <span className="font-medium text-gold">{mode ? LABEL[mode] : 'cargando...'}</span>
      </p>
      <p className="mt-1">
        Es una eleccion por dispositivo, no de tu cuenta — cambiala la proxima vez que inicies sesion en{' '}
        <span className="text-stone-300">/login</span>. Cada navegador/dispositivo recuerda su propia preferencia.
      </p>
    </div>
  );
}
