import type { Folder } from '@/domain/folders';

/**
 * Motor de Inferencia Inteligente por Palabras Clave e Historial: red de
 * seguridad determinista para cuando la IA no encuentra una señal clara y
 * clasifica por default en Personal (ver system-prompt.ts) aunque el texto
 * si tenga una pista real -- "desayuno con mi hijo" es exactamente ese caso:
 * ninguna palabra de negocio/salud, pero "hijo" ya deberia bastar para
 * Familiar. Nunca se ejecuta si la IA ya eligio una carpeta distinta de
 * Personal -- esto es un respaldo, no una segunda opinion que pelee con una
 * clasificacion ya segura.
 *
 * Orden jerarquico deliberado: Negocio primero (el contexto de mayor
 * impacto/especificidad si aplica), luego Salud, luego Familiar -- Personal
 * nunca es algo que este motor "detecte", es simplemente lo que queda si
 * ninguna palabra clave ni el historial dicen lo contrario.
 */

const NEGOCIO_KEYWORDS = [
  /\bcliente[s]?\b/i,
  /\bfactur[eé](?:e|a|ado|ada)?\b/i,
  /\bvend[ií]\b/i,
  /\bventa[s]?\b/i,
  /\bnegocio\b/i,
  /\btienda\b/i,
  /\bproveedor(?:es)?\b/i,
  /\binsumo[s]?\b/i,
  /\bmayorista\b/i,
  /\bmercanc[ií]a\b/i,
];

const SALUD_KEYWORDS = [
  /\bm[eé]dic[oa]\b/i,
  /\beps\b/i,
  /\bdroguer[ií]a\b/i,
  /\bfarmacia\b/i,
  /\bcita\b/i,
  /\bexamen(?:es)?\b/i,
  /\bterapia\b/i,
  /\bodont[oó]log[oa]\b/i,
  /\bconsulta\b/i,
  /\bhospital\b/i,
  /\bcl[ií]nica\b/i,
  /\bmedicamento[s]?\b/i,
];

const FAMILIAR_KEYWORDS = [
  /\bhij[oa]s?\b/i,
  /\besposo\b/i,
  /\besposa\b/i,
  /\bc[oó]nyuge\b/i,
  /\bfamilia\b/i,
  /\bcolegio\b/i,
  /\bmatr[ií]cula\b/i,
  /\blonchera\b/i,
  /\bpap[aá]\b/i,
  /\bmam[aá]\b/i,
  /\bmadre\b/i,
  /\bpadre\b/i,
  /\bnieto[a]?s?\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Infiere carpeta por palabras clave del texto crudo. null si no hay ninguna señal reconocible. */
export function inferFolderFromKeywords(text: string): Folder | null {
  if (!text.trim()) return null;
  if (matchesAny(text, NEGOCIO_KEYWORDS)) return 'negocio';
  if (matchesAny(text, SALUD_KEYWORDS)) return 'salud';
  if (matchesAny(text, FAMILIAR_KEYWORDS)) return 'familiar';
  return null;
}

function normalizeText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface FolderHistoryEntry {
  description: string | null;
  folder: Folder;
}

/**
 * Repite la carpeta usada la ultima vez que este espacio confirmo un
 * movimiento con la MISMA descripcion textual -- "e historial" del motor de
 * inferencia. Solo cuenta si esa vez anterior NO fue Personal (Personal es
 * el default silencioso; repetirlo no aporta nada nuevo).
 */
export function inferFolderFromHistory(text: string, history: FolderHistoryEntry[]): Folder | null {
  const key = normalizeText(text);
  if (!key) return null;
  const match = history.find((h) => h.description && h.folder !== 'personal' && normalizeText(h.description) === key);
  return match?.folder ?? null;
}
