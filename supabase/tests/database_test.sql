begin;

create extension if not exists pgtap with schema extensions;

select plan(64);

select has_table('public', 'menus', 'draft menus table exists');
select has_table('public', 'menu_publications', 'publication snapshot table exists');
select has_table('public', 'menu_import_staging', 'operator import staging table exists');
select has_table('public', 'variant_allergens', 'variant allergen relation exists');
select has_function('public', 'publish_menu', array['uuid', 'uuid'], 'publish RPC has the application signature');
select has_function(
  'public', 'provision_organization',
  array['text', 'text', 'text', 'text', 'uuid', 'text', 'text'],
  'provisioning RPC includes transactional contact metadata'
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
        'menu_import_staging', 'variant_allergens'
      ])
      and relation.relrowsecurity
  ),
  22::bigint,
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

select * from finish();
rollback;
