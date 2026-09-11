/**
 * "Carpeta" contextual unificada para la interfaz: Negocio viene de
 * is_business (ya gobierna la Inteligencia de Negocio y la puerta Pro, ver
 * 0014/0015), las otras tres de life_domain (0016). Se combinan en un solo
 * concepto de 4 opciones porque para quien registra son la misma decision
 * ("¿esto en que carpeta va?"), aunque en la base de datos sean dos columnas
 * separadas por razones de compatibilidad con lo ya construido. Modulo
 * compartido para que cualquier pantalla que necesite agrupar o etiquetar
 * por carpeta (bandeja de confirmacion, Ultimos Movimientos, ingresos fijos)
 * use la misma logica y las mismas 4 etiquetas.
 */
export type Folder = 'personal' | 'familiar' | 'salud' | 'negocio';

export const FOLDER_LABEL: Record<Folder, string> = {
  personal: 'Personal',
  familiar: 'Familiar',
  salud: 'Salud',
  negocio: 'Negocio',
};

/** Orden estable de exhibicion en listas agrupadas: Personal primero (el caso mas comun), Negocio al final. */
export const FOLDER_ORDER: Folder[] = ['personal', 'familiar', 'salud', 'negocio'];

export function folderOf(entity: { isBusiness: boolean; lifeDomain: 'personal' | 'familiar' | 'salud' | null }): Folder {
  if (entity.isBusiness) return 'negocio';
  return entity.lifeDomain ?? 'personal';
}

/** Convierte una carpeta elegida en la interfaz de vuelta a las dos columnas reales de la base de datos. */
export function folderToColumns(folder: Folder): { is_business: boolean; life_domain: 'personal' | 'familiar' | 'salud' | null } {
  if (folder === 'negocio') return { is_business: true, life_domain: null };
  return { is_business: false, life_domain: folder === 'personal' ? null : folder };
}
