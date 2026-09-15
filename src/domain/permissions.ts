import type { MemberRole } from '@/domain/types/dashboard';

/**
 * RBAC (Bloque P4): un unico lugar para traducir un rol de space_members a
 * "que puede hacer en la interfaz" -- la seguridad REAL siempre es RLS
 * (has_space_role, ver 0001), esto solo evita mostrar un boton que
 * terminaria en un error de permiso, y refleja visualmente los 4 niveles ya
 * definidos en la base de datos (owner > admin > editor > viewer).
 */

/** Puede administrar el espacio: renombrar, miembros/roles, preferencias, eliminar reglas/presupuestos/canales. Mismo umbral que has_space_role(...,['owner','admin']). */
export function canManageSpace(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** Puede crear/editar datos financieros: capturar, importar, confirmar transacciones, crear reglas/presupuestos/facturas. Mismo umbral que has_space_role(...,['owner','admin','editor']). */
export function canEditSpace(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/** Solo lectura: saldos, reportes, historial -- ninguna mutacion permitida. */
export function isViewerRole(role: MemberRole): boolean {
  return role === 'viewer';
}
