-- Ringg Assist for Beauty: Supabase schema (applied to the project as migration
-- "create_ringg_assist_tables"). One table per collection; each row stores the
-- full record as JSON in `data`, same shape as data/seed/*.json and lib/types.ts.
do $$
declare t text;
begin
  foreach t in array array['products','customers','offers','faqs','orders','conversations','messages','tickets','callbacks','returns','events'] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
    -- Demo app: the Next.js server talks to these tables with the project''s publishable key.
    execute format('create policy "demo server access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

create index if not exists messages_conversation_idx on public.messages ((data->>'conversation_id'));
create index if not exists tickets_conversation_idx on public.tickets ((data->>'conversation_id'));
create index if not exists events_type_idx on public.events ((data->>'type'));
