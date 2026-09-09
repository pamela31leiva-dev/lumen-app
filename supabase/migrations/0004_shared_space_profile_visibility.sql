-- =============================================================================
-- 0004_shared_space_profile_visibility.sql
-- /settings necesita listar el nombre/correo de los miembros del espacio.
-- La policy original de profiles solo permite "ver mi propio perfil"
-- (correcto para el caso general), asi que se agrega una policy adicional
-- (las policies del mismo comando se combinan con OR) que expone unicamente
-- el perfil de alguien con quien el usuario ya comparte al menos un espacio.
-- Nunca se abre profiles globalmente.
-- =============================================================================

create or replace function public.shares_any_space_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1
        from public.space_members my
        join public.space_members theirs on theirs.space_id = my.space_id
        where my.user_id = auth.uid()
          and theirs.user_id = p_user_id
    );
$$;

revoke all on function public.shares_any_space_with(uuid) from public;
grant execute on function public.shares_any_space_with(uuid) to authenticated;

create policy profiles_select_shared_space on public.profiles
    for select using (public.shares_any_space_with(id));
