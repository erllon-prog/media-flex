// Edge Function "ler-foto": recebe a foto do painel ou da nota e devolve os números lidos.
// A chave do Gemini fica como segredo no Supabase (GEMINI_API_KEY), nunca no GitHub.
// Deploy: supabase functions deploy ler-foto --no-verify-jwt   (o login é conferido no próprio código)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function promptPainel(ultimoKm?: number) {
  return `Foto do painel de instrumentos de um carro. Leia a quilometragem TOTAL do hodômetro (odômetro, às vezes marcado ODO ou TOTAL).
Ignore o hodômetro parcial (TRIP A/B), a autonomia, a velocidade, o relógio e a temperatura.${
    ultimoKm ? ` A última leitura registrada foi ${ultimoKm} km, então o valor atual deve ser maior que isso, normalmente até 1500 km acima.` : ""
  }
Responda somente com JSON: {"km": número inteiro sem separadores ou null, "confianca": "alta" | "media" | "baixa"}`;
}

const PROMPT_NOTA = `Foto de um cupom fiscal ou comprovante de posto de combustível no Brasil. Extraia o abastecimento:
- litros: quantidade abastecida em litros (ex.: 38,452 L). Não confunda com o valor em R$.
- total: valor total pago em reais pelo combustível.
- precoLitro: preço unitário por litro em R$ (ex.: 4,19).
- combustivel: "etanol" se for etanol, álcool ou etanol hidratado; "gasolina" se for gasolina comum, aditivada ou premium; null se não estiver escrito.
- data: data da compra no formato AAAA-MM-DD, ou null.
Use ponto como separador decimal. Responda somente com JSON:
{"litros": número|null, "total": número|null, "precoLitro": número|null, "combustivel": "etanol"|"gasolina"|null, "data": string|null}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  // Só usuários logados no app podem usar (protege a cota do Gemini)
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const quem = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!auth.startsWith("Bearer ") || !quem.ok) return json({ erro: "faça login no app" }, 401);

  const key = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
  if (!key) return json({ erro: "GEMINI_API_KEY não configurada" }, 500);

  let body: { tipo?: string; imagem?: string; mime?: string; ultimoKm?: number };
  try { body = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const { tipo, imagem, mime = "image/jpeg", ultimoKm } = body;
  if (!imagem || (tipo !== "painel" && tipo !== "nota")) return json({ erro: "envie tipo (painel|nota) e imagem" }, 400);
  if (imagem.length > 6_000_000) return json({ erro: "imagem grande demais" }, 413);

  const prompt = tipo === "painel" ? promptPainel(ultimoKm) : PROMPT_NOTA;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imagem } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  if (r.status === 429) return json({ erro: "limite gratuito atingido, tente em instantes" }, 429);
  if (!r.ok) return json({ erro: `Gemini respondeu ${r.status}`, detalhe: (await r.text()).slice(0, 400) }, 502);

  const out = await r.json();
  const text: string = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    const ini = text.search(/[\[{]/), fim = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    return json(JSON.parse(text.slice(ini, fim + 1)));
  } catch {
    return json({ erro: "não consegui ler a resposta", bruto: text.slice(0, 400) }, 502);
  }
});
