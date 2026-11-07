-- Média Flex: tabela de abastecimentos
-- Rode no SQL Editor do mesmo projeto Supabase do app de contas.

create table if not exists public.abastecimentos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        date not null default current_date,
  km          integer not null check (km > 0),
  litros      numeric(8,3) not null check (litros > 0),
  total       numeric(10,2),
  preco_litro numeric(8,3),
  comb        text not null default 'etanol' check (comb in ('etanol','gasolina')),
  cheio       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, km)
);

create index if not exists abastecimentos_user_km on public.abastecimentos (user_id, km);

alter table public.abastecimentos enable row level security;

-- Cada pessoa vê e altera somente os próprios abastecimentos
drop policy if exists "abast_select_own" on public.abastecimentos;
drop policy if exists "abast_insert_own" on public.abastecimentos;
drop policy if exists "abast_update_own" on public.abastecimentos;
drop policy if exists "abast_delete_own" on public.abastecimentos;

create policy "abast_select_own" on public.abastecimentos
  for select to authenticated using (user_id = auth.uid());
create policy "abast_insert_own" on public.abastecimentos
  for insert to authenticated with check (user_id = auth.uid());
create policy "abast_update_own" on public.abastecimentos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "abast_delete_own" on public.abastecimentos
  for delete to authenticated using (user_id = auth.uid());
