-- Média Flex v6: ajuste do odômetro quando as rodas/pneus são trocados.
-- Rode uma vez no SQL Editor do Supabase. Guarda, por usuário, o fator (km reais ÷ km do painel)
-- e, opcionalmente, o KM do painel a partir do qual o fator vale (em branco = vale para todo o histórico).

create table if not exists public.media_config (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fator         numeric(6,4) not null default 1 check (fator between 0.8 and 1.3),
  km_troca      integer check (km_troca is null or km_troca >= 0),
  atualizado_em timestamptz not null default now()
);

alter table public.media_config enable row level security;
grant select, insert, update, delete on table public.media_config to authenticated;
revoke all on table public.media_config from anon;

drop policy if exists "cfg_select_own" on public.media_config;
drop policy if exists "cfg_insert_own" on public.media_config;
drop policy if exists "cfg_update_own" on public.media_config;
drop policy if exists "cfg_delete_own" on public.media_config;

create policy "cfg_select_own" on public.media_config for select to authenticated using (user_id = auth.uid());
create policy "cfg_insert_own" on public.media_config for insert to authenticated with check (user_id = auth.uid());
create policy "cfg_update_own" on public.media_config for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cfg_delete_own" on public.media_config for delete to authenticated using (user_id = auth.uid());
