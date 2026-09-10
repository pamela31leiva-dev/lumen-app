-- =============================================================================
-- 0007_classification_hints.sql
-- Clarificacion interactiva de la IA: cuando una captura es ambigua entre dos
-- clasificaciones plausibles (ej. una categoria recurrente que el usuario
-- reparte entre dos propositos distintos), el asistente pregunta una vez y
-- la respuesta queda guardada aqui para que futuras capturas similares en el
-- mismo espacio se clasifiquen solas, sin volver a preguntar.
-- =============================================================================

create table public.classification_hints (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    question    text not null,   -- la pregunta que hizo la IA
    answer      text not null,   -- la respuesta corta del usuario
    created_by  uuid not null references public.profiles(id),
    created_at  timestamptz not null default now()
);

comment on table public.classification_hints is 'Aprendizajes de clarificaciones pregunta->respuesta por espacio. Se inyectan como contexto en el prompt de extraccion (ver GeminiExtractionProvider) para que la IA aplique el mismo criterio sin repreguntar. No es un modelo entrenado: es contexto de prompt, simple y auditable.';

create index idx_classification_hints_space on public.classification_hints (space_id, created_at desc);

alter table public.classification_hints enable row level security;

-- Mismo patron que CATEGORIES: cualquier miembro con rol editor+ puede
-- ensenarle una respuesta al asistente; borrar un aprendizaje incorrecto
-- requiere admin+, igual que gestionar categorias.
create policy classification_hints_select_member on public.classification_hints
    for select using (public.is_space_member(space_id));
create policy classification_hints_insert_editor on public.classification_hints
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy classification_hints_delete_admin on public.classification_hints
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
