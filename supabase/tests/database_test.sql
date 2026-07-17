begin;

create extension if not exists pgtap with schema extensions;

select plan(156);

select has_table('public', 'menus', 'draft menus table exists');
select has_table('public', 'menu_publications', 'publication snapshot table exists');
select has_table('public', 'menu_import_staging', 'operator import staging table exists');
select has_table('public', 'variant_allergens', 'variant allergen relation exists');
select has_table('public', 'demo_requests', 'platform demo request pipeline exists');
select has_table('private', 'public_form_rate_limits', 'public form quotas stay outside the Data API');
select has_table('private', 'public_form_events', 'privacy-minimized intake telemetry stays private');
select has_view('public', 'latest_menu_item_media_assets', 'dish editor has an RLS-aware latest-media view');
select has_column('public', 'media_assets', 'menu_item_id', 'dish media has an explicit normalized target');
select has_column('public', 'media_assets', 'ai_job_id', 'generated media records its originating AI job');
select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'media_assets'
      and constraint_row.conname = 'media_assets_organization_menu_item_fkey'
      and constraint_row.contype = 'f'
  ),
  1::bigint,
  'dish media target is protected by a tenant-scoped foreign key'
);
select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'media_assets'
      and constraint_row.conname = 'media_assets_organization_ai_job_fkey'
      and constraint_row.contype = 'f'
  ),
  1::bigint,
  'generated media provenance is protected by a tenant-scoped foreign key'
);
select has_function('public', 'publish_menu', array['uuid', 'uuid'], 'publish RPC has the application signature');
select has_function(
  'public', 'provision_organization',
  array['text', 'text', 'text', 'text', 'uuid', 'text', 'text'],
  'provisioning RPC includes transactional contact metadata'
);
select has_function(
  'public', 'provision_restaurant',
  array['text', 'text', 'text', 'text', 'uuid', 'text', 'text', 'text', 'uuid'],
  'lead-aware provisioning includes city and optional demo request linkage'
);
select has_function(
  'public', 'approve_menu_import', array['uuid', 'uuid'],
  'staging approval RPC has an explicit tenant parameter'
);
select has_function(
  'public', 'review_translation', array['uuid', 'uuid', 'text', 'text'],
  'translation review RPC has an explicit tenant parameter'
);
select has_function(
  'public', 'approve_translation_drafts', array['uuid'],
  'bulk translation approval RPC has an explicit tenant parameter'
);
select has_function(
  'public', 'save_menu_item_details',
  array['uuid', 'uuid', 'text', 'text', 'text', 'numeric', 'boolean', 'boolean', 'boolean', 'boolean', 'uuid[]'],
  'food information editor has an atomic tenant-scoped RPC'
);
select has_function(
  'public', 'review_brand_media',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'brand media review has an operator-only promotion RPC'
);
select has_function(
  'public', 'submit_demo_request',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text[]', 'text'],
  'demo intake exposes one server-only transactional submission RPC'
);
select has_function(
  'public', 'record_demo_request_honeypot', array['text'],
  'honeypot telemetry has a narrowly scoped server-only RPC'
);
select has_function(
  'public', 'demo_request_health', array[]::text[],
  'operators have an intake health summary RPC'
);
select has_function(
  'public', 'manage_organization_member',
  array['uuid', 'uuid', 'text', 'membership_role'],
  'team access changes use one tenant-scoped transactional RPC'
);
select has_function(
  'public', 'reorder_menu_entity', array['uuid', 'text', 'uuid', 'text'],
  'draft menu ordering has a tenant-scoped transactional RPC'
);
select has_function(
  'public', 'move_menu_item', array['uuid', 'uuid', 'uuid'],
  'cross-category dish moves have a tenant-scoped transactional RPC'
);
select has_function(
  'public', 'create_menu_category', array['uuid', 'uuid', 'text', 'text'],
  'draft category appends have a tenant-scoped transactional RPC'
);
select has_function(
  'public', 'create_menu_item', array['uuid', 'uuid', 'text', 'numeric'],
  'draft dish appends have a tenant-scoped transactional RPC'
);
select has_function(
  'public', 'remove_menu_item_image', array['uuid', 'uuid'],
  'approved dish media can be removed from the normalized draft without deleting history'
);
select has_function(
  'public', 'claim_menu_import_retry', array['uuid'],
  'failed import recovery has one atomic operator RPC'
);
select has_function(
  'public', 'mark_ai_source_file_released', array['uuid', 'text'],
  'provider source retention has a service-only completion RPC'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'profiles', 'platform_staff', 'organizations', 'memberships', 'locations', 'menus',
        'menu_categories', 'menu_items', 'item_variants', 'allergens', 'item_allergens',
        'translations', 'themes', 'media_assets', 'qr_codes', 'menu_publications',
        'onboarding_cases', 'ai_jobs', 'webhook_events', 'audit_logs',
        'menu_import_staging', 'variant_allergens', 'demo_requests'
      ])
      and relation.relrowsecurity
  ),
  23::bigint,
  'RLS is enabled on every exposed application table'
);

select is(
  (
    select count(distinct columns.table_name)
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.column_name = 'organization_id'
      and columns.table_name = any (array[
        'memberships', 'locations', 'menus', 'menu_categories', 'menu_items', 'item_variants',
        'allergens', 'item_allergens', 'translations', 'themes', 'media_assets', 'qr_codes',
        'menu_publications', 'onboarding_cases', 'ai_jobs', 'webhook_events', 'audit_logs',
        'menu_import_staging', 'variant_allergens'
      ])
  ),
  19::bigint,
  'every tenant-owned table carries organization_id'
);

select is(
  (select public from storage.buckets where id = 'intake'),
  false,
  'intake bucket is private'
);
select is(
  (select public from storage.buckets where id = 'public-media'),
  true,
  'approved media bucket is public'
);

update public.ai_jobs
set input_file_path = '00000000-0000-0000-0000-000000000001/menu-test.csv',
    input = jsonb_build_object(
      'storage_bucket', 'intake',
      'filename', 'menu-test.csv',
      'mime_type', 'text/csv'
    )
where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.ai_jobs (
  id, organization_id, onboarding_case_id, menu_id, kind, model, prompt_version,
  response_id, status, attempts, input, input_file_path, output, error, usage,
  started_at, completed_at, created_by
) values (
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000091',
  '00000000-0000-0000-0000-000000000021',
  'menu_import', 'deterministic-csv', 'tabular-import-v1', 'resp_failed_import',
  'failed', 1,
  '{"storage_bucket":"intake","storage_path":"00000000-0000-0000-0000-000000000001/retry-menu.csv","filename":"retry-menu.csv","mime_type":"text/csv","size_bytes":128,"parser":"csv"}'::jsonb,
  '00000000-0000-0000-0000-000000000001/retry-menu.csv',
  '{"partial":true}'::jsonb,
  '{"message":"Errore di test"}'::jsonb,
  '{"input_tokens":20}'::jsonb,
  now() - interval '5 minutes', now(),
  '10000000-0000-0000-0000-000000000001'
);

insert into public.menu_import_staging (
  id, organization_id, onboarding_case_id, menu_id, ai_job_id,
  source_bucket, source_path, source_filename, source_mime_type,
  parser, payload, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000091',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-0000000000a1',
  'intake', '00000000-0000-0000-0000-000000000001/menu-test.csv',
  'menu-test.csv', 'text/csv', 'csv',
  '{
    "menu_name":"Menu importato",
    "source_locale":"it",
    "currency":"EUR",
    "categories":[{
      "name":"Piatti importati",
      "description":null,
      "position":0,
      "items":[{
        "source_id":"csv-row-1",
        "name":"Piatto verificato",
        "description":"Descrizione verificata",
        "ingredients":"Ingrediente uno, ingrediente due",
        "price":12.5,
        "available":true,
        "vegetarian":false,
        "vegan":false,
        "gluten_free":false,
        "allergens":[],
        "variants":[],
        "confidence":{"score":1,"notes":null},
        "issues":[]
      }],
      "confidence":{"score":1,"notes":null},
      "issues":[]
    }],
    "confidence":{"score":1,"notes":null},
    "issues":[]
  }'::jsonb,
  '10000000-0000-0000-0000-000000000001'
);

insert into public.demo_requests (
  id, restaurant_name, city, contact_name, email, contact_role,
  desired_languages, consented_at
) values
  (
    '00000000-0000-0000-0000-0000000000d1',
    'Ristorante interessato', 'Bologna', 'Persona interessata',
    'lead@example.com', 'owner', array['en'], now()
  ),
  (
    '00000000-0000-0000-0000-0000000000d2',
    'Seconda richiesta', 'Modena', 'Secondo contatto',
    'lead-two@example.com', 'manager', array['de'], now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated"}', true);

select is((select count(*) from public.organizations), 1::bigint, 'owner sees only its organization');
select is((select count(*) from public.menus), 1::bigint, 'owner sees only its menu');
select is(
  (select count(*) from public.menu_import_staging),
  0::bigint,
  'restaurant owner cannot read operator-only intake staging'
);
select is(
  (select count(*) from public.demo_requests),
  0::bigint,
  'restaurant members cannot read platform sales enquiries'
);
select is(
  (select count(*) from public.profiles where id = '10000000-0000-0000-0000-000000000012'),
  1::bigint,
  'owner can resolve profile names for users in the same tenant'
);
select is(
  (select count(*) from public.menus where id = '00000000-0000-0000-0000-000000000022'),
  0::bigint,
  'owner cannot guess a menu from another tenant'
);
select is(
  (select count(*) from public.locations where organization_id = '00000000-0000-0000-0000-000000000002'),
  0::bigint,
  'owner cannot list another tenant locations'
);
select ok(
  private.can_edit_organization('00000000-0000-0000-0000-000000000001'),
  'owner can edit its tenant'
);
select ok(
  private.can_admin_organization('00000000-0000-0000-0000-000000000001'),
  'owner can administer its tenant'
);
select throws_ok(
  $$ select public.claim_menu_import_retry('00000000-0000-0000-0000-0000000000a2') $$,
  null,
  null,
  'restaurant owners cannot claim platform import retries'
);
select throws_ok(
  $$ select public.mark_ai_source_file_released('00000000-0000-0000-0000-0000000000a2', 'file-test') $$,
  null,
  null,
  'authenticated users cannot forge provider source release records'
);
with changed as (
  update public.organizations set name = 'Forbidden rename'
  where id = '00000000-0000-0000-0000-000000000002'
  returning id
)
select is(count(*), 0::bigint, 'owner cannot update another tenant') from changed;

select lives_ok(
  $$
    insert into public.memberships (organization_id, user_id, role)
    values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'editor'
    )
  $$,
  'owner can add a tenant member'
);
select lives_ok(
  $$
    select public.manage_organization_member(
      '00000000-0000-0000-0000-000000000001',
      (
        select id from public.memberships
        where organization_id = '00000000-0000-0000-0000-000000000001'
          and user_id = '10000000-0000-0000-0000-000000000001'
      ),
      'update_role', 'owner'
    )
  $$,
  'owner can promote another tenant member through the managed access flow'
);
select is(
  (
    select role::text from public.memberships
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'managed role changes are active immediately'
);
select throws_ok(
  $$
    select public.manage_organization_member(
      '00000000-0000-0000-0000-000000000001',
      (
        select id from public.memberships
        where organization_id = '00000000-0000-0000-0000-000000000001'
          and user_id = '10000000-0000-0000-0000-000000000011'
      ),
      'update_role', 'editor'
    )
  $$,
  null,
  null,
  'owner cannot change its own access through the managed flow'
);
select lives_ok(
  $$
    select public.manage_organization_member(
      '00000000-0000-0000-0000-000000000001',
      (
        select id from public.memberships
        where organization_id = '00000000-0000-0000-0000-000000000001'
          and user_id = '10000000-0000-0000-0000-000000000001'
      ),
      'remove', null
    )
  $$,
  'owner can remove another member without deleting the Auth account'
);
select is(
  (
    select count(*) from public.memberships
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'removed tenant access disappears from the membership roster'
);
select is(
  (
    select count(*) from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and action in ('membership.role_changed', 'membership.removed')
  ),
  2::bigint,
  'role changes and removals leave an organization audit trail'
);
select throws_ok(
  $$
    delete from public.memberships
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000011'
  $$,
  null,
  null,
  'last owner cannot remove itself'
);

select lives_ok(
  $$
    select public.create_menu_category(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000021',
      'Categoria creata atomicamente', 'categoria-creata-atomicamente'
    )
  $$,
  'owner can append a draft category atomically'
);
select is(
  (
    select sort_order from public.menu_categories
    where menu_id = '00000000-0000-0000-0000-000000000021'
      and slug = 'categoria-creata-atomicamente'
  ),
  1,
  'atomic category append receives the next deterministic position'
);
select lives_ok(
  $$
    select public.create_menu_item(
      '00000000-0000-0000-0000-000000000001',
      (
        select id from public.menu_categories
        where menu_id = '00000000-0000-0000-0000-000000000021'
          and slug = 'categoria-creata-atomicamente'
      ),
      'Piatto creato atomicamente', 14.5
    )
  $$,
  'owner can append a draft dish atomically'
);
select is(
  (
    select sort_order from public.menu_items
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and name_it = 'Piatto creato atomicamente'
  ),
  0,
  'atomic dish append receives the next deterministic position'
);
select throws_ok(
  $$
    select public.create_menu_category(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000022',
      'Categoria vietata', 'categoria-vietata'
    )
  $$,
  null,
  null,
  'owner cannot append a category to another tenant menu'
);
select throws_ok(
  $$
    select public.create_menu_item(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000032',
      'Piatto vietato', 10
    )
  $$,
  null,
  null,
  'owner cannot append a dish to another tenant category'
);
delete from public.menu_categories
where menu_id = '00000000-0000-0000-0000-000000000021'
  and slug = 'categoria-creata-atomicamente';

insert into public.menu_categories (
  id, organization_id, menu_id, slug, name_it, sort_order
) values (
  '00000000-0000-0000-0000-000000000033',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  'seconda-categoria-test', 'Seconda categoria test', 1
);
select is(
  public.reorder_menu_entity(
    '00000000-0000-0000-0000-000000000001',
    'category', '00000000-0000-0000-0000-000000000033', 'up'
  ),
  true,
  'owner can move a draft category earlier'
);
select is(
  (select sort_order from public.menu_categories where id = '00000000-0000-0000-0000-000000000033'),
  0,
  'category reordering persists deterministic zero-based order'
);
select is(
  public.move_menu_item(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000033'
  ),
  true,
  'owner can move a draft dish to another category'
);
select is(
  (select category_id from public.menu_items where id = '00000000-0000-0000-0000-000000000041'),
  '00000000-0000-0000-0000-000000000033'::uuid,
  'dish move updates the normalized draft relation'
);
select is(
  public.move_menu_item(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000031'
  ),
  true,
  'dish can be moved back without losing its content'
);
select throws_ok(
  $$
    select public.reorder_menu_entity(
      '00000000-0000-0000-0000-000000000002',
      'category', '00000000-0000-0000-0000-000000000032', 'down'
    )
  $$,
  null,
  null,
  'owner cannot reorder another tenant menu'
);
delete from public.menu_categories where id = '00000000-0000-0000-0000-000000000033';
update public.menu_categories set sort_order = 0 where id = '00000000-0000-0000-0000-000000000031';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated"}', true);

select is((select count(*) from public.organizations), 1::bigint, 'editor sees its organization');
with changed as (
  update public.menu_items set price = 13
  where id = '00000000-0000-0000-0000-000000000041'
  returning id
)
select is(count(*), 1::bigint, 'editor can change a menu price') from changed;
with changed as (
  update public.locations set city = 'Forbidden'
  where id = '00000000-0000-0000-0000-000000000011'
  returning id
)
select is(count(*), 0::bigint, 'editor cannot change owner-only site configuration') from changed;
select throws_ok(
  $$
    insert into public.memberships (organization_id, user_id, role)
    values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'editor'
    )
  $$,
  null,
  null,
  'editor cannot manage tenant users'
);
select throws_ok(
  $$
    select public.manage_organization_member(
      '00000000-0000-0000-0000-000000000001',
      (
        select id from public.memberships
        where organization_id = '00000000-0000-0000-0000-000000000001'
          and user_id = '10000000-0000-0000-0000-000000000011'
      ),
      'update_role', 'editor'
    )
  $$,
  null,
  null,
  'editors cannot use the member-management RPC'
);
select throws_ok(
  $$
    select public.reorder_menu_entity(
      '00000000-0000-0000-0000-000000000002',
      'category', '00000000-0000-0000-0000-000000000032', 'down'
    )
  $$,
  null,
  null,
  'editors cannot reorder a different tenant menu'
);
select throws_ok(
  $$
    insert into public.menu_items (organization_id, category_id, name_it, price)
    values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000032',
      'Cross tenant item',
      1
    )
  $$,
  null,
  null,
  'composite foreign keys reject cross-tenant parent IDs'
);

select lives_ok(
  $$
    select public.publish_menu(
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  'editor can publish a translation-complete menu'
);
select is(
  (select count(*) from public.menu_publications where menu_id = '00000000-0000-0000-0000-000000000021' and is_current),
  1::bigint,
  'only one current publication exists per menu'
);
select is(
  (select count(*) from public.menu_publications where menu_id = '00000000-0000-0000-0000-000000000021'),
  2::bigint,
  'publishing appends a new immutable version'
);
select is(
  (select current_publication_id from public.menus where id = '00000000-0000-0000-0000-000000000021'),
  (
    select id from public.menu_publications
    where menu_id = '00000000-0000-0000-0000-000000000021' and is_current
  ),
  'dashboard publication pointer matches the current immutable snapshot'
);
select throws_ok(
  $$
    select public.publish_menu(
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  null,
  null,
  'publishing an unchanged draft is rejected atomically'
);
select is(
  (select count(*) from public.menu_publications where menu_id = '00000000-0000-0000-0000-000000000021'),
  2::bigint,
  'a rejected duplicate does not add noise to publication history'
);

do $$
declare
  translation_row record;
begin
  for translation_row in
    select id, translated_text
    from public.translations
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and entity_type = 'item'
      and entity_id = '00000000-0000-0000-0000-000000000041'
      and field_name = 'description'
      and locale in ('en', 'de')
  loop
    perform public.review_translation(
      translation_row.id,
      '00000000-0000-0000-0000-000000000001',
      translation_row.translated_text,
      'save'
    );
  end loop;
end;
$$;

select is(
  public.approve_translation_drafts('00000000-0000-0000-0000-000000000001'),
  2,
  'editor can approve every ready draft in one atomic call'
);
select is(
  (
    select count(*)
    from public.translations
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and entity_type = 'item'
      and entity_id = '00000000-0000-0000-0000-000000000041'
      and field_name = 'description'
      and locale in ('en', 'de')
      and status = 'approved'
      and approved_by = '10000000-0000-0000-0000-000000000012'
      and approved_at is not null
  ),
  2::bigint,
  'bulk approval records the human reviewer and timestamp'
);
select throws_ok(
  $$
    select public.approve_translation_drafts(
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  null,
  null,
  'bulk approval cannot target another tenant'
);

update public.menu_items
set name_it = 'Crescentine aggiornate'
where id = '00000000-0000-0000-0000-000000000041';

select is(
  (
    select count(*) from public.translations
    where entity_type = 'item'
      and entity_id = '00000000-0000-0000-0000-000000000041'
      and field_name = 'name'
      and status = 'stale'
  ),
  4::bigint,
  'source text edits stale every active translation'
);
select throws_ok(
  $$
    select public.publish_menu(
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  null,
  null,
  'publication is blocked while active translations are stale'
);
select throws_ok(
  $$
    update public.translations
    set origin = 'machine', translated_text = 'Machine overwrite'
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and entity_type = 'item'
      and entity_id = '00000000-0000-0000-0000-000000000041'
      and field_name = 'name'
      and locale = 'en'
  $$,
  null,
  null,
  'machine output never silently overwrites a manual translation'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((select count(*) from public.menu_publications), 1::bigint, 'anon sees only the current publication');
select is(
  (select count(*) from public.menu_publications where is_current),
  1::bigint,
  'anon publication is explicitly current'
);
select throws_ok(
  $$select count(*) from public.locations$$,
  null,
  null,
  'anon cannot read draft location rows'
);
select is(
  (select destination_path from public.qr_codes where short_code = 'DEMO01'),
  '/r/demo',
  'anon can resolve an active stable QR without reading locations'
);
select throws_ok(
  $$select count(*) from public.memberships$$,
  null,
  null,
  'anon cannot read memberships'
);
select throws_ok(
  $$select public.approve_translation_drafts('00000000-0000-0000-0000-000000000001')$$,
  null,
  null,
  'anon cannot call bulk translation approval'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000021', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
select is(
  (select count(*) from public.menu_publications where organization_id = '00000000-0000-0000-0000-000000000001'),
  0::bigint,
  'second tenant owner cannot read first tenant publication history'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 2::bigint, 'operator can see every seeded tenant');
select is(
  (select count(*) from public.menu_import_staging where status = 'review'),
  1::bigint,
  'operator can read the staging review queue'
);
select is(
  (public.claim_menu_import_retry('00000000-0000-0000-0000-0000000000a2') ->> 'attempt')::integer,
  2,
  'operator atomically claims the next attempt on the existing job'
);
select is(
  (
    select status::text || ':' || attempts::text || ':'
      || (response_id is null)::text || ':' || (error is null)::text
    from public.ai_jobs where id = '00000000-0000-0000-0000-0000000000a2'
  ),
  'queued:2:true:true',
  'retry claim clears terminal state without creating a duplicate job'
);
select is(
  (
    select status::text || ':' || source_file_path
    from public.onboarding_cases where id = '00000000-0000-0000-0000-000000000091'
  ),
  'importing:00000000-0000-0000-0000-000000000001/retry-menu.csv',
  'retry claim restores the onboarding case to importing with its private source'
);
select is(
  (
    select count(*) from public.audit_logs
    where action = 'ai_job.retry_claimed'
      and entity_id = '00000000-0000-0000-0000-0000000000a2'
  ),
  1::bigint,
  'retry claim leaves an operator audit record'
);
select throws_ok(
  $$ select public.claim_menu_import_retry('00000000-0000-0000-0000-0000000000a2') $$,
  null,
  null,
  'a queued retry cannot be claimed twice'
);
update public.ai_jobs
set status = 'failed', attempts = 3
where id = '00000000-0000-0000-0000-0000000000a2';
select throws_ok(
  $$ select public.claim_menu_import_retry('00000000-0000-0000-0000-0000000000a2') $$,
  null,
  null,
  'the database enforces the hard import attempt cap'
);
select lives_ok(
  $$
    select public.provision_organization(
      'Tenant Test', 'tenant-test', 'Locale Test', 'locale-test',
      '10000000-0000-0000-0000-000000000021', 'Owner Due',
      'owner-b@menuinterattivo.local'
    )
  $$,
  'operator can provision a complete tenant transactionally'
);
select lives_ok(
  $$
    select public.provision_organization(
      'Tenant Test', 'tenant-test', 'Locale Test', 'locale-test',
      '10000000-0000-0000-0000-000000000021', 'Owner Due',
      'owner-b@menuinterattivo.local'
    )
  $$,
  'retrying the same provisioning request is idempotent'
);
select is(
  (select count(*) from public.organizations where slug = 'tenant-test'),
  1::bigint,
  'idempotent provisioning does not duplicate the organization'
);
select lives_ok(
  $$
    select public.provision_restaurant(
      'Lead Test', 'lead-test', 'Locale Lead', 'lead-test',
      '10000000-0000-0000-0000-000000000021', 'Persona interessata',
      'lead@example.com', 'Bologna', '00000000-0000-0000-0000-0000000000d1'
    )
  $$,
  'operator converts a qualified lead inside the provisioning transaction'
);
select is(
  (
    select status || ':' || (organization_id is not null)::text || ':' || (onboarding_case_id is not null)::text
    from public.demo_requests where id = '00000000-0000-0000-0000-0000000000d1'
  ),
  'converted:true:true',
  'converted lead is traceably linked to its tenant and onboarding case'
);
select is(
  (
    select location.city
    from public.demo_requests request
    join public.onboarding_cases onboarding on onboarding.id = request.onboarding_case_id
    join public.locations location on location.id = onboarding.location_id
    where request.id = '00000000-0000-0000-0000-0000000000d1'
  ),
  'Bologna',
  'lead city reaches the provisioned location without a second edit'
);
select is(
  (
    select count(*) from public.audit_logs
    where action = 'convert' and entity_type = 'demo_request'
      and entity_id = '00000000-0000-0000-0000-0000000000d1'
  ),
  1::bigint,
  'lead conversion creates an organization-scoped audit record'
);
select lives_ok(
  $$
    select public.provision_restaurant(
      'Lead Test', 'lead-test', 'Locale Lead', 'lead-test',
      '10000000-0000-0000-0000-000000000021', 'Persona interessata',
      'lead@example.com', 'Bologna', '00000000-0000-0000-0000-0000000000d1'
    )
  $$,
  'retrying the same lead conversion reuses the linked onboarding safely'
);
update public.menu_import_staging
set parser = 'openai',
    payload = jsonb_set(
      payload,
      '{categories,0,items,0,allergens}',
      '[{"code":"gluten","name":"Glutine","origin":"ai_inferred","evidence":"Impasto","confirmed":null,"confidence":{"score":0.8,"notes":null},"issues":[]}]'::jsonb
    )
where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$
    select public.approve_menu_import(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  null,
  null,
  'unreviewed AI allergen suggestions block transactional approval'
);
update public.menu_import_staging
set parser = 'csv',
    payload = jsonb_set(payload, '{categories,0,items,0,allergens}', '[]'::jsonb)
where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$
    select public.approve_menu_import(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  null,
  null,
  'staging cannot be approved through a mismatched tenant ID'
);
select lives_ok(
  $$
    select public.approve_menu_import(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  'operator can approve reviewed staging into the tenant draft'
);
select is(
  (
    select count(*) from public.translations
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and entity_type in ('category', 'item')
      and status = 'missing'
  ),
  16::bigint,
  'approved import creates missing translation rows with fresh source hashes'
);
select lives_ok(
  $$
    insert into public.webhook_events (
      organization_id, ai_job_id, webhook_id, event_type, response_id, payload
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000a1',
      'evt_test_once', 'response.completed', 'resp_demo_import_1', '{}'
    )
  $$,
  'operator can persist a verified webhook event'
);
select throws_ok(
  $$
    insert into public.webhook_events (
      organization_id, ai_job_id, webhook_id, event_type, response_id, payload
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000a1',
      'evt_test_once', 'response.completed', 'resp_demo_import_1', '{}'
    )
  $$,
  null,
  null,
  'webhook ID uniqueness makes completion idempotent'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('intake', '00000000-0000-0000-0000-000000000001/menu.pdf')
  $$,
  'owner can upload a private intake object under its organization prefix'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('intake', '00000000-0000-0000-0000-000000000002/stolen.pdf')
  $$,
  null,
  null,
  'owner cannot upload into another tenant storage prefix'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('public-media', '00000000-0000-0000-0000-000000000001/unapproved.jpg')
  $$,
  null,
  null,
  'tenant member cannot make unreviewed media public'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*) from public.demo_requests),
  2::bigint,
  'platform operator can read demo requests'
);
with changed as (
  update public.demo_requests set status = 'contacted'
  where id = '00000000-0000-0000-0000-0000000000d2'
  returning id
)
select is(count(*), 1::bigint, 'platform operator can move a demo request through the pipeline') from changed;
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('public-media', '00000000-0000-0000-0000-000000000001/approved.jpg')
  $$,
  'operator can promote reviewed media to the public bucket'
);

reset role;
select throws_ok(
  $$
    update public.menu_publications
    set snapshot = jsonb_set(snapshot, '{menu,name}', '"Tampered"')
    where menu_id = '00000000-0000-0000-0000-000000000021' and is_current
  $$,
  null,
  null,
  'published snapshot content cannot be mutated even by a privileged SQL path'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.restore_menu_publication(
      (
        select id from public.menu_publications
        where menu_id = '00000000-0000-0000-0000-000000000021'
        order by version asc limit 1
      ),
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  'restore creates a new version instead of editing history'
);
select is(
  (
    select max(version) from public.menu_publications
    where menu_id = '00000000-0000-0000-0000-000000000021' and is_current
  ),
  3,
  'restored publication receives the next monotonic version'
);

select lives_ok(
  $$
    select public.save_menu_item_details(
      '00000000-0000-0000-0000-000000000041',
      '00000000-0000-0000-0000-000000000001',
      'Crescentine aggiornate', 'Descrizione aggiornata', 'Farina e latte',
      14.5, true, true, false, false,
      array['00000000-0000-0000-0000-000000000062']::uuid[]
    )
  $$,
  'tenant editor atomically updates food details and declared allergens'
);
select is(
  (
    select count(*) from public.item_allergens
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and item_id = '00000000-0000-0000-0000-000000000041'
      and allergen_id = '00000000-0000-0000-0000-000000000062'
  ),
  1::bigint,
  'food detail save replaces allergen relations in the same transaction'
);
select throws_ok(
  $$
    select public.save_menu_item_details(
      '00000000-0000-0000-0000-000000000041',
      '00000000-0000-0000-0000-000000000001',
      'Claim contraddittorio', '', '', 10, true, false, false, true,
      array['00000000-0000-0000-0000-000000000061']::uuid[]
    )
  $$,
  null,
  null,
  'gluten-free claim cannot be saved together with a gluten allergen'
);
select throws_ok(
  $$
    select public.save_menu_item_details(
      '00000000-0000-0000-0000-000000000042',
      '00000000-0000-0000-0000-000000000002',
      'Altro tenant', '', '', 10, true, false, false, false, '{}'::uuid[]
    )
  $$,
  null,
  null,
  'tenant editor cannot use the food detail RPC against another organization'
);

select lives_ok(
  $$
    insert into public.media_assets (
      id, organization_id, menu_id, menu_item_id, bucket_id, object_path,
      media_kind, mime_type, alt_text, approval_status, is_public, created_by
    ) values (
      '00000000-0000-0000-0000-0000000000f3',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000041',
      'intake',
      '00000000-0000-0000-0000-000000000001/menu-items/00000000-0000-0000-0000-000000000041/draft.png',
      'menu_item', 'image/png', 'Crescentine impiattate', 'draft', false,
      '10000000-0000-0000-0000-000000000012'
    )
  $$,
  'tenant editor can queue a private photo for one of its dishes'
);
select is(
  (
    select id from public.latest_menu_item_media_assets
    where organization_id = '00000000-0000-0000-0000-000000000001'
      and menu_item_id = '00000000-0000-0000-0000-000000000041'
  ),
  '00000000-0000-0000-0000-0000000000f3'::uuid,
  'latest dish media view returns the current tenant review record without a global cap'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000021', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
select is(
  (select count(*) from public.latest_menu_item_media_assets),
  0::bigint,
  'latest dish media view cannot expose another tenant through the Data API'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select throws_ok(
  $$
    insert into public.media_assets (
      organization_id, menu_id, menu_item_id, bucket_id, object_path,
      media_kind, mime_type, approval_status, is_public
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000042',
      'intake',
      '00000000-0000-0000-0000-000000000001/menu-items/00000000-0000-0000-0000-000000000042/cross.png',
      'menu_item', 'image/png', 'draft', false
    )
  $$,
  null,
  null,
  'tenant-scoped foreign keys reject a dish photo aimed at another organization'
);

select lives_ok(
  $$
    insert into public.media_assets (
      id, organization_id, location_id, bucket_id, object_path, media_kind,
      mime_type, alt_text, approval_status, is_public, created_by
    ) values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000011',
      'intake',
      '00000000-0000-0000-0000-000000000001/branding/cover/draft.webp',
      'cover', 'image/webp', 'Sala del ristorante', 'draft', false,
      '10000000-0000-0000-0000-000000000012'
    )
  $$,
  'tenant editor can register brand media only as a private draft'
);
select throws_ok(
  $$
    select public.review_brand_media(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-000000000001',
      'approve',
      '00000000-0000-0000-0000-000000000001/branding/cover/00000000-0000-0000-0000-0000000000f1.webp',
      'https://media.example/cover.webp'
    )
  $$,
  null,
  null,
  'tenant editor cannot approve or expose brand media'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.review_brand_media(
      '00000000-0000-0000-0000-0000000000f3',
      '00000000-0000-0000-0000-000000000001',
      'approve',
      '00000000-0000-0000-0000-000000000001/menu-items/00000000-0000-0000-0000-000000000041/00000000-0000-0000-0000-0000000000f3.webp',
      'https://media.example/crescentine.webp'
    )
  $$,
  'operator can promote an optimized dish photo atomically'
);
select is(
  (select image_url from public.menu_items where id = '00000000-0000-0000-0000-000000000041'),
  'https://media.example/crescentine.webp',
  'dish approval attaches the reviewed image only to the normalized draft item'
);
select is(
  (
    select bucket_id || ':' || approval_status::text || ':' || is_public::text
    from public.media_assets where id = '00000000-0000-0000-0000-0000000000f3'
  ),
  'public-media:approved:true',
  'approved dish media metadata points only to the public bucket'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.remove_menu_item_image(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000041'
    )
  $$,
  'tenant editor can remove an approved photo from its draft'
);
select is(
  (select image_url from public.menu_items where id = '00000000-0000-0000-0000-000000000041'),
  null,
  'removing a draft photo clears the item without mutating publication snapshots'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.review_brand_media(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-000000000001',
      'approve',
      '00000000-0000-0000-0000-000000000001/branding/cover/00000000-0000-0000-0000-0000000000f1.webp',
      'https://media.example/cover.webp'
    )
  $$,
  'operator can promote reviewed brand media atomically'
);
select is(
  (
    select bucket_id || ':' || approval_status::text || ':' || is_public::text
    from public.media_assets where id = '00000000-0000-0000-0000-0000000000f1'
  ),
  'public-media:approved:true',
  'approved brand media metadata points only to the public bucket'
);
select is(
  (select cover_url from public.locations where id = '00000000-0000-0000-0000-000000000011'),
  'https://media.example/cover.webp',
  'approval attaches the reviewed image to the location draft'
);
select lives_ok(
  $$
    insert into public.media_assets (
      id, organization_id, location_id, bucket_id, object_path, media_kind,
      mime_type, approval_status, is_public, created_by
    ) values (
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000011',
      'intake',
      '00000000-0000-0000-0000-000000000001/branding/logo/reject.png',
      'logo', 'image/png', 'draft', false,
      '10000000-0000-0000-0000-000000000012'
    )
  $$,
  'operator can inspect a tenant brand-media draft'
);
select lives_ok(
  $$
    select public.review_brand_media(
      '00000000-0000-0000-0000-0000000000f2',
      '00000000-0000-0000-0000-000000000001',
      'reject', null, null
    )
  $$,
  'operator can reject unsuitable brand media without a public destination'
);
select is(
  (select approval_status::text from public.media_assets where id = '00000000-0000-0000-0000-0000000000f2'),
  'rejected',
  'rejected brand media remains non-public for audit history'
);

set local role anon;
select throws_ok(
  $$
    select public.submit_demo_request(
      repeat('b', 64), repeat('a', 64), 'Anonimo', 'Roma', 'Bot',
      'anon@example.test', '', 'owner', '', '{}'::text[], ''
    )
  $$,
  null,
  null,
  'anonymous clients cannot bypass the server action and call lead intake directly'
);

set local role service_role;
update public.ai_jobs
set input = jsonb_set(input, '{openai_file_id}', '"file-provider-test"'::jsonb)
where id = '00000000-0000-0000-0000-0000000000a2';
select is(
  public.mark_ai_source_file_released(
    '00000000-0000-0000-0000-0000000000a2',
    'file-provider-test'
  ),
  true,
  'the webhook service records deletion of the matching provider source'
);
select ok(
  (
    select provider_file_released_at is not null
      and not (input ? 'openai_file_id')
    from public.ai_jobs
    where id = '00000000-0000-0000-0000-0000000000a2'
  ),
  'provider release removes the stale file reference and records its timestamp'
);
select is(
  (public.submit_demo_request(
    repeat('b', 64), repeat('a', 64), 'Osteria quota', 'Roma', 'Ada',
    'quota@example.test', '', 'owner', '', array['en']::text[], 'Prima richiesta'
  ) ->> 'accepted')::boolean,
  true,
  'the server role can atomically accept the first valid demo request'
);
select is(
  (public.submit_demo_request(
    repeat('b', 64), repeat('a', 64), 'Osteria quota', 'Roma', 'Ada',
    'quota@example.test', '', 'owner', '', array['en']::text[], 'Duplicata'
  ) ->> 'duplicate')::boolean,
  true,
  'a repeated email is acknowledged without creating another lead'
);
select is(
  (public.submit_demo_request(
    repeat('b', 64), repeat('a', 64), 'Osteria quota', 'Roma', 'Ada',
    'quota@example.test', '', 'owner', '', array['en']::text[], 'Duplicata due'
  ) ->> 'duplicate')::boolean,
  true,
  'the quota records repeated attempts before blocking abusive repetition'
);
select is(
  (public.submit_demo_request(
    repeat('b', 64), repeat('a', 64), 'Osteria quota', 'Roma', 'Ada',
    'quota@example.test', '', 'owner', '', array['en']::text[], 'Troppi tentativi'
  ) ->> 'accepted')::boolean,
  false,
  'the transactional quota rejects the fourth same-email attempt in one hour'
);
select is(
  (select count(*) from public.demo_requests where email = 'quota@example.test'),
  1::bigint,
  'deduplication and rate limiting preserve exactly one actionable lead'
);
select throws_ok(
  $$ select count(*) from private.public_form_events $$,
  null,
  null,
  'even the server API role cannot read raw private telemetry tables directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok(
  $$ select public.demo_request_health() $$,
  null,
  null,
  'restaurant owners cannot read platform-wide intake health'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(
  (public.demo_request_health() ->> 'accepted_24h')::integer >= 1
  and (public.demo_request_health() ->> 'blocked_24h')::integer >= 1,
  'platform operators can see accepted and blocked intake outcomes without fingerprints'
);

select * from finish();
rollback;
