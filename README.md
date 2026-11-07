# Média Flex

PWA para medir o consumo do carro com duas fotos (painel e nota do posto) e descobrir se etanol ou gasolina sai mais barato **no seu carro**, em R$/km.

Mesmo esquema do app de contas: GitHub Pages (repositório público) + Supabase plano grátis + login com Google. A leitura das fotos usa o Gemini Flash na cota gratuita, chamado por uma Edge Function do Supabase para a chave ficar fora do repositório.

## Como funciona o cálculo

- A média é calculada entre **dois abastecimentos com tanque cheio**: km rodados ÷ litros colocados para encher de novo.
- Abastecimento parcial (chave "Tanque cheio" desligada) soma os litros no próximo tanque cheio.
- O trecho é atribuído ao combustível que estava no tanque, ou seja, o do tanque cheio anterior.
- O primeiro trecho depois de trocar de combustível fica marcado como transição (tanque com mistura). Ele sai da média quando há pelo menos dois trechos limpos daquele combustível.
- **R$/km** = último preço por litro pago ÷ média km/L. O mais barato ganha o selo "compensa".
- **Ponto de equilíbrio do seu carro** = km/L do etanol ÷ km/L da gasolina. Substitui a regra genérica dos 70%.

## Publicar (uma vez)

1. **Tabela**: no Supabase do app de contas, abra o SQL Editor e rode `supabase/schema.sql`.
2. **Chave do Gemini (grátis)**: em https://aistudio.google.com crie uma API key.
3. **Edge Function**:
   - Supabase → Edge Functions → Deploy a new function → via Editor, nome `ler-foto`, cole `supabase/functions/ler-foto/index.ts` e faça o deploy. Em Settings, deixe "Verify JWT with legacy secret" desligado: o código já confere o login.
   - Ou pela CLI: `supabase functions deploy ler-foto --no-verify-jwt`.
   - Em Edge Functions → Secrets, crie `GEMINI_API_KEY` com a chave. Opcional: `GEMINI_MODEL` (padrão `gemini-flash-latest`).
4. **config.js**: não precisa mexer. O app carrega `../contas/config.js` (mesmo domínio github.io) e reaproveita a URL e a chave pública do app de contas.
5. **GitHub Pages**: crie o repositório `media-flex`, suba todos os arquivos (menos a pasta `supabase`, se preferir) e ative Pages na branch `main`.
6. **Login**: Supabase → Authentication → URL Configuration → Redirect URLs, adicione `https://SEU-USUARIO.github.io/media-flex/`. O provedor Google já está configurado pelo app de contas.
7. No iPhone, abra o link no Safari → Compartilhar → Adicionar à Tela de Início.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro (tela, cálculo, Supabase) |
| `config.js` | URL e anon key do Supabase |
| `manifest.webmanifest`, `sw.js`, ícones | Instalação como app no celular |
| `supabase/schema.sql` | Tabela `abastecimentos` com RLS (cada um vê só os seus) |
| `supabase/functions/ler-foto/index.ts` | Lê KM do painel e litros/valor/preço/combustível/data da nota |

## Observações

- As fotos não são guardadas: só os números vão para o banco, então não ocupa o armazenamento grátis.
- Na cota grátis do Gemini o Google pode usar as imagens enviadas para melhorar os modelos. Para foto de painel e cupom de posto isso costuma ser aceitável; se não for, basta digitar os valores.
- Se a leitura falhar ou a cota acabar, os campos continuam editáveis à mão.
