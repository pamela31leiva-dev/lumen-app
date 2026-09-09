-- =============================================================================
-- 0002_receipts_storage_bucket.sql
-- Bucket privado para documentos fuente (fotos/PDF) + RLS por espacio.
--
-- Convencion de ruta obligatoria: <space_id>/<archivo>
-- El primer segmento de la ruta se usa como space_id para autorizar via
-- is_space_member/has_space_role, igual que en el resto del esquema.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_insert_editor" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'receipts'
        and public.has_space_role(((storage.foldername(name))[1])::uuid, array['owner','admin','editor']::member_role[])
    );

create policy "receipts_storage_select_member" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'receipts'
        and public.is_space_member(((storage.foldername(name))[1])::uuid)
    );

create policy "receipts_storage_delete_admin" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'receipts'
        and public.has_space_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::member_role[])
    );
