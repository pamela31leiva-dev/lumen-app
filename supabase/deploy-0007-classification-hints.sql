-- Aplica solo la migracion 0007. Pega esto en el SQL Editor de Supabase y
-- dale Run. Requiere que 0001-0006 ya esten aplicadas (usan is_space_member,
-- has_space_role, etc).

begin;

create table if not exists public.classification_hints (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    question    text not null,
    answer      text not null,
    created_by  uuid not null references public.profiles(id),
    created_at  timestamptz not null default now()
);

comment on table public.classification_hints is 'Aprendizajes de clarificaciones pregunta->respuesta por espacio. Se inyectan como contexto en el prompt de extraccion para que la IA aplique el mismo criterio sin repreguntar.';

create index if not exists idx_classification_hints_space on public.classification_hints (space_id, created_at desc);

alter table public.classification_hints enable row level security;

drop policy if exists classification_hints_select_member on public.classification_hints;
create policy classification_hints_select_member on public.classification_hints
    for select using (public.is_space_member(space_id));

drop policy if exists classification_hints_insert_editor on public.classification_hints;
create policy classification_hints_insert_editor on public.classification_hints
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists classification_hints_delete_admin on public.classification_hints;
create policy classification_hints_delete_admin on public.classification_hints
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

commit;
