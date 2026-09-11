-- =============================================================================
-- 0016_life_domain_folders.sql
-- "Carpetas contextuales": ademas de is_business (0014, que ya distingue
-- Negocio del resto), esta columna distingue Personal/Familiar/Salud DENTRO
-- de lo que no es negocio. Cuando is_business=true la carpeta mostrada en la
-- interfaz es siempre "Negocio" (life_domain se ignora ahi); cuando es
-- false, life_domain decide entre Personal (default si es null)/Familiar/
-- Salud. Dos columnas separadas en vez de fusionarlas en un solo enum de 4
-- valores para no tocar is_business, que ya gobierna la Inteligencia de
-- Negocio y la puerta Pro (0015) y esta en produccion funcionando.
-- =============================================================================

alter table public.transactions
    add column life_domain text
    constraint chk_transactions_life_domain check (life_domain is null or life_domain in ('personal', 'familiar', 'salud'));
