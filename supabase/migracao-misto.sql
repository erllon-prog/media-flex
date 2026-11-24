-- Média Flex v5: libera o combustível "misto" na tabela abastecimentos.
-- Rode uma vez no SQL Editor do Supabase (quem já criou a tabela antes).

alter table public.abastecimentos drop constraint if exists abastecimentos_comb_check;
alter table public.abastecimentos
  add constraint abastecimentos_comb_check check (comb in ('etanol','gasolina','misto'));
