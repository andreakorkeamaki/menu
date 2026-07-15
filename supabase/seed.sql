-- Idempotent local demo data. Password for all demo accounts: MenuDemo2026!

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
    'operator@menuinterattivo.local', extensions.crypt('MenuDemo2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Andrea Operatore"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
    'owner@menuinterattivo.local', extensions.crypt('MenuDemo2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Giulia Bianchi"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated',
    'editor@menuinterattivo.local', extensions.crypt('MenuDemo2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Luca Editor"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
    'owner-b@menuinterattivo.local', extensions.crypt('MenuDemo2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Tenant Due"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '{"sub":"10000000-0000-0000-0000-000000000001","email":"operator@menuinterattivo.local"}', 'email', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000011',
    '{"sub":"10000000-0000-0000-0000-000000000011","email":"owner@menuinterattivo.local"}', 'email', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000012',
    '{"sub":"10000000-0000-0000-0000-000000000012","email":"editor@menuinterattivo.local"}', 'email', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
    '10000000-0000-0000-0000-000000000021',
    '{"sub":"10000000-0000-0000-0000-000000000021","email":"owner-b@menuinterattivo.local"}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.platform_staff (user_id, role, active, created_by)
values ('10000000-0000-0000-0000-000000000001', 'operator', true, '10000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

insert into public.organizations (id, name, slug, status, created_by)
values
  ('00000000-0000-0000-0000-000000000001', 'Osteria del Portico', 'osteria-del-portico', 'active', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'Trattoria Seconda', 'trattoria-seconda', 'active', '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.memberships (id, organization_id, user_id, role, created_by)
values
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 'owner', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 'editor', '10000000-0000-0000-0000-000000000011'),
  ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000021', 'owner', '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.locations (
  id, organization_id, slug, status, name, tagline_it, description_it, address, city, phone,
  email, whatsapp_url, reservation_url, map_url, instagram_url, opening_hours, created_by
)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'demo', 'active',
    'Osteria del Portico', 'Cucina bolognese, senza fretta.',
    'Una piccola osteria contemporanea dove la sfoglia incontra ingredienti di stagione e vini del territorio.',
    'Via del Portico 12', 'Bologna', '+39 051 000 0000', 'ciao@example.com',
    'https://wa.me/390510000000', 'https://example.com/prenota', 'https://maps.google.com/?q=Bologna',
    'https://instagram.com', '[{"days":"Lun–Ven","hours":"12:00–14:30 · 19:00–22:30"},{"days":"Sab–Dom","hours":"12:00–23:00"}]',
    '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'tenant-due', 'active',
    'Trattoria Seconda', '', '', 'Via Due 2', 'Modena', '+39 059 000 0000', null, null, null, null, null, '[]',
    '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.menus (
  id, organization_id, location_id, name, active_locales, created_by
)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011', 'Menu principale', array['it','en','fr','de','es'],
    '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000012', 'Menu principale', array['it'],
    '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.menu_categories (
  id, organization_id, menu_id, slug, name_it, description_it, sort_order, created_by
)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000021', 'per-cominciare', 'Per cominciare',
    'Piccoli piatti da condividere.', 0, '10000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000022', 'antipasti', 'Antipasti', null, 0,
    '10000000-0000-0000-0000-000000000021')
on conflict (id) do nothing;

insert into public.menu_items (
  id, organization_id, category_id, name_it, description_it, ingredients_it, price, available,
  vegetarian, vegan, gluten_free, sort_order, created_by
)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000031', 'Crescentine e giardiniera',
    'Impasto fritto, giardiniera della casa e squacquerone.',
    'Farina, latte, strutto, verdure, squacquerone', 12, true, true, false, false, 0,
    '10000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000032', 'Gnocco fritto', null, null, 9, true, false, false, false, 0,
    '10000000-0000-0000-0000-000000000021')
on conflict (id) do nothing;

insert into public.item_variants (
  id, organization_id, item_id, name_it, price_delta, sort_order, created_by
)
values ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000041', 'Porzione grande', 4, 0,
  '10000000-0000-0000-0000-000000000011')
on conflict (id) do nothing;

insert into public.allergens (id, organization_id, code, name_it)
values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', 'glutine', 'Glutine'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001', 'latte', 'Latte')
on conflict (id) do nothing;

insert into public.item_allergens (id, organization_id, item_id, allergen_id)
values
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000061'),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000062')
on conflict (id) do nothing;

insert into public.themes (
  id, organization_id, location_id, theme_key, background, surface, text, muted, accent,
  accent_text, heading_font, body_font, radius, created_by
)
values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011', 'editorial', '#f4eee4', '#fffaf1', '#24231f',
    '#6d685f', '#9d3d2e', '#fffaf1', 'var(--font-serif)', 'var(--font-sans)', '1.5rem',
    '10000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000012', 'minimal', '#f4f6f3', '#ffffff', '#16211b',
    '#637067', '#1f6a4f', '#ffffff', 'var(--font-sans)', 'var(--font-sans)', '0.75rem',
    '10000000-0000-0000-0000-000000000021')
on conflict (id) do nothing;

insert into public.qr_codes (
  id, organization_id, location_id, menu_id, short_code, destination_path, created_by
)
values
  ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'DEMO01', '/r/demo', '10000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000022',
    'TENANT02', '/r/tenant-due', '10000000-0000-0000-0000-000000000021')
on conflict (id) do nothing;

insert into public.onboarding_cases (id, organization_id, location_id, status, assigned_to)
values
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011', 'published', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000012', 'review', '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

with translation_source(entity_type, entity_id, field_name, source_text, en, fr, de, es) as (
  values
    ('location', '00000000-0000-0000-0000-000000000011'::uuid, 'tagline', 'Cucina bolognese, senza fretta.',
      'Bolognese cooking, at its own pace.', 'Cuisine bolognaise, sans se presser.',
      'Bolognesische Küche, ganz in Ruhe.', 'Cocina boloñesa, sin prisas.'),
    ('location', '00000000-0000-0000-0000-000000000011'::uuid, 'description',
      'Una piccola osteria contemporanea dove la sfoglia incontra ingredienti di stagione e vini del territorio.',
      'A small contemporary osteria where handmade pasta meets seasonal ingredients and local wines.',
      'Une petite osteria contemporaine où les pâtes maison rencontrent les produits de saison.',
      'Eine kleine moderne Osteria mit hausgemachter Pasta und saisonalen Zutaten.',
      'Una pequeña osteria contemporánea con pasta casera e ingredientes de temporada.'),
    ('category', '00000000-0000-0000-0000-000000000031'::uuid, 'name', 'Per cominciare',
      'To begin', 'Pour commencer', 'Zum Anfang', 'Para empezar'),
    ('category', '00000000-0000-0000-0000-000000000031'::uuid, 'description', 'Piccoli piatti da condividere.',
      'Small plates made for sharing.', 'Petites assiettes à partager.', 'Kleine Gerichte zum Teilen.', 'Platos pequeños para compartir.'),
    ('item', '00000000-0000-0000-0000-000000000041'::uuid, 'name', 'Crescentine e giardiniera',
      'Crescentine with pickled vegetables', 'Crescentine et légumes marinés',
      'Crescentine mit eingelegtem Gemüse', 'Crescentine con verduras encurtidas'),
    ('item', '00000000-0000-0000-0000-000000000041'::uuid, 'description',
      'Impasto fritto, giardiniera della casa e squacquerone.',
      'Fried dough, house pickles and squacquerone cheese.',
      'Pâte frite, légumes marinés maison et squacquerone.',
      'Frittierter Teig, hausgemachtes Gemüse und Squacquerone.',
      'Masa frita, encurtidos de la casa y queso squacquerone.'),
    ('item', '00000000-0000-0000-0000-000000000041'::uuid, 'ingredients',
      'Farina, latte, strutto, verdure, squacquerone',
      'Flour, milk, lard, vegetables, squacquerone',
      'Farine, lait, saindoux, légumes, squacquerone',
      'Mehl, Milch, Schmalz, Gemüse, Squacquerone',
      'Harina, leche, manteca, verduras, squacquerone'),
    ('variant', '00000000-0000-0000-0000-000000000051'::uuid, 'name', 'Porzione grande',
      'Large portion', 'Grande portion', 'Große Portion', 'Porción grande')
), expanded as (
  select source.entity_type, source.entity_id, source.field_name, source.source_text,
    localized.locale, localized.translated_text
  from translation_source source
  cross join lateral (values
    ('en', source.en), ('fr', source.fr), ('de', source.de), ('es', source.es)
  ) localized(locale, translated_text)
)
insert into public.translations (
  organization_id, entity_type, entity_id, locale, field_name, source_hash,
  translated_text, status, origin, approved_by, approved_at
)
select '00000000-0000-0000-0000-000000000001', entity_type, entity_id, locale, field_name,
  encode(extensions.digest(source_text, 'sha256'), 'hex'), translated_text, 'approved', 'manual',
  '10000000-0000-0000-0000-000000000011', now()
from expanded
on conflict (organization_id, entity_type, entity_id, locale, field_name) do nothing;

insert into public.ai_jobs (
  id, organization_id, onboarding_case_id, menu_id, kind, model, prompt_version,
  response_id, status, attempts, input, output, usage, started_at, completed_at, created_by
)
values (
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000021',
  'menu_import', 'gpt-5.6-terra', 'menu-import-v1', 'resp_demo_import_1', 'completed', 1,
  '{"source":"demo-menu.pdf"}', '{"reviewed":true}', '{"input_tokens":1000,"output_tokens":300}',
  now(), now(), '10000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

do $$
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
    false
  );
  if not exists (
    select 1 from public.menu_publications
    where menu_id = '00000000-0000-0000-0000-000000000021' and is_current
  ) then
    perform public.publish_menu(
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001'
    );
  end if;
end;
$$;
