// Reaproveita a URL e a chave pública do app de contas (mesmo projeto Supabase).
// O index.html carrega ../contas/config.js antes deste arquivo; nada de chave fica copiado aqui.
// Quem protege os dados é o RLS da tabela abastecimentos (cada usuário vê só os seus).
window.MEDIA_FLEX_CONFIG = {
  SUPABASE_URL: window.CONTAS_CONFIG && window.CONTAS_CONFIG.supabaseUrl,
  SUPABASE_ANON_KEY: window.CONTAS_CONFIG && window.CONTAS_CONFIG.supabaseKey,
};
