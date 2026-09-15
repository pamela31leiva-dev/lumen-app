import type { Folder } from '@/domain/folders';

/**
 * Regla configurable por comercio (ver migracion 0027): si la descripcion de
 * una captura nueva contiene "pattern" (substring, case-insensitive), se
 * aplican automaticamente categoria/cuenta/etiquetas/carpeta por defecto.
 * Pura y sin dependencias de framework -- el fetch a Supabase vive en
 * actions/merchant-rules-core.ts, esto solo decide "cual regla aplica".
 */
export interface MerchantRule {
  id: string;
  pattern: string;
  categoryId: string | null;
  accountId: string | null;
  tags: string[];
  folder: Folder | null;
}

export interface MerchantRuleMatch {
  ruleId: string;
  categoryId: string | null;
  accountId: string | null;
  tags: string[];
  folder: Folder | null;
}

/** Reglas mas especificas (patron mas largo) primero, para que "NETFLIX.COM" gane sobre "NETFLIX" si ambas existen. Empate: la mas reciente. */
export function sortRulesBySpecificity(rules: MerchantRule[]): MerchantRule[] {
  return [...rules].sort((a, b) => b.pattern.trim().length - a.pattern.trim().length);
}

/**
 * Devuelve la PRIMERA regla activa (ya ordenada por especificidad) cuyo
 * patron aparece dentro de la descripcion. Determinista: nunca "adivina" cual
 * regla pesa mas entre varias igual de especificas -- si dos reglas podrian
 * aplicar, la persona debe desactivar o afinar la que no quiere.
 */
export function matchMerchantRule(description: string | null | undefined, rules: MerchantRule[]): MerchantRuleMatch | null {
  if (!description) return null;
  const normalized = description.trim().toLowerCase();
  if (!normalized) return null;

  for (const rule of sortRulesBySpecificity(rules)) {
    const pattern = rule.pattern.trim().toLowerCase();
    if (pattern && normalized.includes(pattern)) {
      return { ruleId: rule.id, categoryId: rule.categoryId, accountId: rule.accountId, tags: rule.tags, folder: rule.folder };
    }
  }
  return null;
}

/** Etiquetas de la regla + las ya sugeridas (por IA o por el usuario), sin duplicados. */
export function mergeTags(existingTags: string[], ruleTags: string[]): string[] {
  return Array.from(new Set([...existingTags, ...ruleTags]));
}
