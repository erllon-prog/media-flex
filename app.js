(() => {
  "use strict";

  const VERSAO = 4;

  // ---------------------------------------------------------------- núcleo comum (login, amigos, usuários, avisos)
  const nucleo = Nucleo.iniciar({
    app: "media-flex",
    nome: "Média Flex",
    url: "https://erllon-prog.github.io/media-flex/",
    icone: "icon-192.png",
    versao: VERSAO,
    descricao: "para medir o consumo do carro e saber se etanol ou gasolina compensa",
    privacidade: "Pronto, só você vê os seus abastecimentos.",
    textoPrimeiraVez: "Primeira vez? É só entrar com o Google. Se você já usa o app Contas, é o mesmo login.",
    amigosTexto: "Seus amigos são os mesmos do app <b>Contas</b>. No Média Flex cada um vê só os próprios abastecimentos.",
    novidades: {
      id: "media-flex-4",
      titulo: "O Média Flex foi atualizado",
      itens: [
        "A leitura das fotos ficou mais rápida: a foto é reduzida no celular antes de enviar.",
        "Mesmo login, amigos e visual do app Contas. Veja em <b>⋯ → Nossos apps</b>.",
        "Dá para compartilhar o app com amigos em <b>⋯ → Compartilhar o app</b>."
      ],
      dica: "Se algo parecer estranho, feche o app e abra de novo."
    },
    novidadesAlvo: ".content",
    aoEntrar() { carregar(); },
    aoSair() { entries = []; loaded = false; resetForm(); msg(); render(); },
    aoVoltar() { carregar(); }
  });
  const sb = nucleo.sb;
  const CFG = window.COMUM_CONFIG;
  const $ = nucleo.$;

  // ---------------------------------------------------------------- estado
  const NOMES = { etanol: "Etanol", gasolina: "Gasolina", misto: "Mistura" };
  let entries = [], loaded = false, editingId = null, comb = "etanol", periodo = 0, warnedKm = null, pendingDel = null, pendingTimer = null;

  // ---------------------------------------------------------------- formatação
  const fN = (n, d = 1) => n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fKm = (n) => n == null ? "—" : Math.round(n).toLocaleString("pt-BR");
  const fR = (n, d = 2) => n == null || !isFinite(n) ? "—" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fData = (s) => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(2)}`; };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function dec(v) {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
    let s = String(v).trim().replace(/[^\d,.]/g, ""); if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else { const p = s.split("."); if (p.length > 2) s = p.join(""); }
    const n = parseFloat(s); return isFinite(n) && n > 0 ? n : null;
  }
  const kmParse = (v) => { const s = String(v ?? "").split(/[,]/)[0].replace(/\D/g, ""); const n = parseInt(s, 10); return n > 0 ? n : null; };
  const toField = (n, d) => n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });

  // ---------------------------------------------------------------- cálculo
  // Média entre dois tanques cheios: km rodados / litros colocados até encher de novo.
  // O trecho leva o combustível que estava no tanque (o do tanque cheio anterior).
  function calc(list) {
    const s = [...list].sort((a, b) => a.km - b.km); const segs = [], byId = {};
    let base = null, prevBaseComb = null, acc = 0, mixed = false;
    for (const e of s) {
      if (!base) { if (e.cheio) base = e; continue; }
      acc += e.litros || 0;
      if (!e.cheio && e.comb !== base.comb) mixed = true;
      if (e.cheio) {
        const dist = e.km - base.km;
        if (dist > 0 && acc > 0) {
          const kml = dist / acc, preco = base.precoLitro || null;
          const seg = { endId: e.id, dist, litros: acc, kml, comb: mixed ? "misto" : base.comb, preco, custoKm: preco ? preco / kml : null,
            transicao: !!(prevBaseComb && prevBaseComb !== base.comb), data: e.data };
          segs.push(seg); byId[e.id] = seg;
        }
        prevBaseComb = base.comb; base = e; acc = 0; mixed = false;
      }
    }
    return { segs, byId, sorted: s };
  }
  function inPeriod(dataStr) {
    if (!periodo) return true; const lim = new Date(); lim.setDate(lim.getDate() - periodo);
    return new Date(dataStr + "T12:00:00") >= lim;
  }
  function stats(segs, fuel) {
    const all = segs.filter((x) => x.comb === fuel); if (!all.length) return null;
    const clean = all.filter((x) => !x.transicao); const use = clean.length >= 2 ? clean : all;
    const dist = use.reduce((a, x) => a + x.dist, 0), lit = use.reduce((a, x) => a + x.litros, 0);
    const wc = use.filter((x) => x.preco);
    const custo = wc.length ? wc.reduce((a, x) => a + x.litros * x.preco, 0) / wc.reduce((a, x) => a + x.dist, 0) : null;
    return { kml: dist / lit, custoHist: custo, n: use.length, dist };
  }
  function ultimoPreco(sorted, fuel) {
    for (let i = sorted.length - 1; i >= 0; i--) { const e = sorted[i]; if (e.comb === fuel && e.precoLitro) return { p: e.precoLitro, data: e.data }; }
    return null;
  }

  // ---------------------------------------------------------------- tela
  function render() {
    const { segs, byId, sorted } = calc(entries);
    const last = sorted[sorted.length - 1];
    $("#ultimoKm").textContent = last ? `${fKm(last.km)} km` : "";
    renderPlacar(segs.filter((s) => inPeriod(s.data)), sorted);
    renderLista(sorted, byId);
  }
  function renderPlacar(segs, sorted) {
    const el = $("#placar");
    if (!loaded) { el.innerHTML = `<p class="muted small" style="margin:0">Carregando seus abastecimentos…</p>`; return; }
    if (!sorted.length) {
      el.innerHTML = `<div class="mf-empty"><p>Aqui aparece qual combustível sai mais barato <b>no seu carro</b>, em R$ por km rodado.</p>
        <ol><li>No posto, encha o tanque e tire a foto do painel e da nota.</li>
        <li>No próximo abastecimento, repita. A primeira média aparece.</li>
        <li>Abasteça gasolina algumas vezes para o app comparar com o etanol.</li></ol></div>`;
      return;
    }
    const sE = stats(segs, "etanol"), sG = stats(segs, "gasolina");
    const pE = ultimoPreco(sorted, "etanol"), pG = ultimoPreco(sorted, "gasolina");
    const cE = sE && pE ? pE.p / sE.kml : (sE ? sE.custoHist : null), cG = sG && pG ? pG.p / sG.kml : (sG ? sG.custoHist : null);
    const win = cE != null && cG != null ? (cE <= cG ? "etanol" : "gasolina") : null;
    const card = (fuel, s, p, c) => {
      const cls = fuel === "etanol" ? "eth" : "gas";
      if (!s) return `<div class="mf-fuel ${cls} empty"><span class="name">${NOMES[fuel]}</span><span class="big">—</span>
        <span class="line">${sorted.some((e) => e.comb === fuel && e.cheio) ? "Falta o próximo tanque cheio para medir." : "Sem medição ainda."}</span>${p ? `<span class="line">Último preço <b>${fR(p.p)}</b></span>` : ""}</div>`;
      return `<div class="mf-fuel ${cls}">${win === fuel ? '<span class="badge-win">compensa</span>' : ""}<span class="name">${NOMES[fuel]}</span>
        <span class="big">${c != null ? fN(c, 2) : "—"}<small>R$/km</small></span>
        <span class="line"><b>${fN(s.kml, 1)} km/L</b> · ${s.n} ${s.n === 1 ? "trecho" : "trechos"}</span>
        ${p ? `<span class="line">Preço ref. <b>${fR(p.p)}</b> em ${fData(p.data)}</span>` : ""}</div>`;
    };
    let v = "";
    if (sE && sG) {
      const be = sE.kml / sG.kml; const r = pE && pG ? pE.p / pG.p : null;
      const pos = (x) => Math.max(2, Math.min(98, (x - 0.5) / 0.5 * 100));
      v = `<div class="mf-verdict"><strong>${win === "etanol" ? "Abasteça etanol" : "Abasteça gasolina"}</strong>
        <span>No seu carro o etanol rende <b>${fN(be * 100, 0)}%</b> da gasolina. Ele compensa enquanto custar até <b>${fN(be * 100, 0)}%</b> do preço dela.</span>
        ${r != null ? `<span class="muted small">Pelos últimos preços que você pagou, o etanol está em <b>${fN(r * 100, 0)}%</b> da gasolina.</span>
        <div class="mf-meter" style="--be:${pos(be)}%" role="img" aria-label="Relação de preço ${fN(r * 100, 0)}% contra equilíbrio ${fN(be * 100, 0)}%"><i style="left:${pos(r)}%"></i><em style="left:${pos(r)}%">hoje ${fN(r * 100, 0)}%</em></div>` : ""}
      </div>`;
    } else {
      const falta = !sE ? "etanol" : "gasolina";
      v = `<div class="mf-verdict"><span class="muted">${sE || sG ? `Para comparar, faça pelo menos dois abastecimentos seguidos de ${falta} com tanque cheio.` : "A primeira média aparece no segundo abastecimento com tanque cheio."}</span></div>`;
    }
    const kmRod = segs.reduce((a, x) => a + x.dist, 0);
    const gasto = sorted.filter((e) => inPeriod(e.data)).reduce((a, e) => a + (e.total || 0), 0);
    el.innerHTML = `<div style="display:grid;gap:12px"><div class="mf-duel">${card("etanol", sE, pE, cE)}${card("gasolina", sG, pG, cG)}</div>${v}
      ${segs.length ? chart(segs.slice(-14)) : ""}
      <p class="small muted mf-resumo">${periodo ? `Últimos ${periodo / 30} meses` : "Todo o histórico"}: <b>${fKm(kmRod)} km</b> medidos · <b>${fR(gasto)}</b> abastecidos.</p></div>`;
  }
  function chart(segs) {
    const W = 340, H = 150, L = 26, B = 22, T = 16, max = Math.max(5, Math.ceil(Math.max(...segs.map((s) => s.kml)) / 5) * 5);
    const y = (v) => T + (H - T - B) * (1 - v / max), n = segs.length, bw = (W - L - 6) / n;
    const col = { etanol: "var(--eth)", gasolina: "var(--gas)", misto: "var(--mix)" };
    let g = "";
    for (let t = 0; t <= max; t += 5) g += `<line x1="${L}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)" stroke-width="1"/><text x="${L - 5}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`;
    let b = "";
    segs.forEach((s, i) => {
      const x = L + 4 + i * bw, w = Math.max(4, bw - 5), top = y(s.kml);
      b += `<rect x="${x}" y="${top}" width="${w}" height="${y(0) - top}" rx="2" fill="${col[s.comb]}" opacity="${s.transicao ? 0.55 : 1}"><title>${fData(s.data)} · ${fN(s.kml, 1)} km/L</title></rect>`;
      if (n <= 10) b += `<text x="${x + w / 2}" y="${top - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">${fN(s.kml, 1)}</text>`;
      if (i === 0 || i === n - 1) b += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${fData(s.data)}</text>`;
    });
    return `<div class="mf-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="km por litro de cada trecho">${g}${b}</svg></div>
      <div class="mf-legend"><span style="--c:var(--eth)">Etanol</span><span style="--c:var(--gas)">Gasolina</span><span style="--c:var(--mix)">Mistura</span><span>km/L por trecho · claro = logo após trocar de combustível</span></div>`;
  }
  function renderLista(sorted, byId) {
    const el = $("#lista");
    $("#histCount").textContent = sorted.length ? `${sorted.length} ${sorted.length === 1 ? "registro" : "registros"}` : "";
    if (!loaded) { el.innerHTML = ""; return; }
    if (!sorted.length) { el.innerHTML = `<p class="small muted" style="margin:0">Seus abastecimentos aparecem aqui, do mais recente para o mais antigo.</p>`; return; }
    el.innerHTML = [...sorted].reverse().map((e) => {
      const s = byId[e.id];
      return `<div class="mf-row">
        <div class="top"><b>${fData(e.data)}</b><span class="badge comb ${e.comb}">${NOMES[e.comb]}</span>${e.cheio ? "" : '<span class="small muted">parcial</span>'}</div>
        <div class="det">${fKm(e.km)} km · ${fN(e.litros, 2)} L · ${fR(e.precoLitro)}/L${e.total ? ` · ${fR(e.total)}` : ""}</div>
        <div class="res">${s ? `<span class="kml">${fN(s.kml, 1)}<small> km/L</small></span><span class="small muted">${s.custoKm ? fR(s.custoKm, 2) + "/km · " : ""}${fKm(s.dist)} km de ${NOMES[s.comb].toLowerCase()}</span>` : `<span class="small muted">${e.cheio ? "ponto de partida" : "soma no próximo"}</span>`}</div>
        <div class="ops"><button type="button" class="link" data-edit="${e.id}">Editar</button><button type="button" class="link danger" data-del="${e.id}">${pendingDel === e.id ? "Toque de novo para excluir" : "Excluir"}</button></div>
      </div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- dados (Supabase)
  const fromRow = (r) => ({ id: r.id, data: r.data, km: Number(r.km), litros: Number(r.litros), total: r.total == null ? null : Number(r.total),
    precoLitro: r.preco_litro == null ? null : Number(r.preco_litro), comb: r.comb, cheio: !!r.cheio });
  function erroTexto(acao, error) {
    const m = String(error?.message || "");
    if (/fetch|network|load failed|offline/i.test(m)) return `Não consegui ${acao}: sem conexão com o servidor. Tente de novo em instantes.`;
    if (error?.code === "42501") return `Não consegui ${acao}: o servidor recusou o acesso à tabela (permissão). Avise o administrador do app.`;
    if (/jwt|token|auth/i.test(m)) return `Não consegui ${acao}: sua sessão expirou. Toque em ⋯ → Sair e entre de novo.`;
    return `Não consegui ${acao}. Erro do servidor: ${m || error?.code || "desconhecido"}`;
  }
  async function carregar() {
    if (!nucleo.user) return;
    const { data, error } = await sb.from("abastecimentos").select("id,data,km,litros,total,preco_litro,comb,cheio").order("km", { ascending: true });
    loaded = true;
    if (error) { msg(erroTexto("carregar o histórico", error), "bad"); render(); return; }
    entries = data.map(fromRow); render();
  }

  // ---------------------------------------------------------------- formulário
  function setComb(c) {
    comb = c;
    for (const [id, v] of [["#b-etanol", "etanol"], ["#b-gasolina", "gasolina"]]) {
      $(id).setAttribute("aria-pressed", c === v); $(id).classList.toggle("active", c === v);
    }
  }
  function msg(text, kind) { const m = $("#formMsg"); if (!text) { m.hidden = true; return; } m.textContent = text; m.className = "mf-msg " + kind; m.hidden = false; }
  function resetForm() {
    editingId = null; warnedKm = null;
    ["km", "litros", "total", "preco"].forEach((k) => { const i = $("#f-" + k); i.value = ""; i.classList.remove("filled"); });
    $("#f-data").value = hoje(); $("#f-cheio").checked = true; setComb("etanol");
    $("#cancelar").hidden = true; $("#salvar").textContent = "Salvar abastecimento";
    ["painel", "nota"].forEach((t) => resetTile(t));
  }
  function fill(id, val) { const i = $("#f-" + id); i.value = val; i.classList.add("filled"); }
  document.querySelectorAll(".mf-fields input").forEach((i) => i.addEventListener("input", () => i.classList.remove("filled")));
  $("#b-etanol").onclick = () => setComb("etanol");
  $("#b-gasolina").onclick = () => setComb("gasolina");
  $("#cancelar").onclick = () => { resetForm(); msg(); };
  function completarValores() {
    const l = dec($("#f-litros").value), t = dec($("#f-total").value), p = dec($("#f-preco").value);
    if (l && t && !p) fill("preco", toField(t / l, 2));
    else if (p && t && !l) fill("litros", toField(t / p, 3));
    else if (l && p && !t) fill("total", toField(l * p, 2));
  }
  ["litros", "total", "preco"].forEach((k) => $("#f-" + k).addEventListener("change", completarValores));

  $("#salvar").onclick = async () => {
    if (!nucleo.user) return msg("Entre com sua conta para salvar.", "bad");
    const km = kmParse($("#f-km").value); const litros = dec($("#f-litros").value); let total = dec($("#f-total").value), preco = dec($("#f-preco").value);
    if (!km) return msg("Informe o KM do painel.", "bad");
    if (!litros) return msg("Informe os litros abastecidos.", "bad");
    if (!preco && total) preco = total / litros; if (!total && preco) total = preco * litros;
    const others = entries.filter((e) => e.id !== editingId);
    if (others.some((e) => e.km === km)) return msg(`Já existe um abastecimento com ${fKm(km)} km.`, "bad");
    if (!editingId) {
      const last = others.reduce((a, e) => Math.max(a, e.km), 0);
      if (last && km < last) return msg(`O KM precisa ser maior que o último registrado (${fKm(last)} km). Confira a foto do painel.`, "bad");
      if (last && km - last > 1500 && warnedKm !== km) { warnedKm = km; return msg(`São ${fKm(km - last)} km desde o último registro. Se estiver certo, toque em Salvar de novo.`, "warn"); }
      if (last && (km - last) / litros < 3 && warnedKm !== km) { warnedKm = km; return msg(`Isso daria ${fN((km - last) / litros, 1)} km/L. Confira KM e litros; se estiver certo, toque em Salvar de novo.`, "warn"); }
    }
    const row = { data: $("#f-data").value || hoje(), km, litros: +litros.toFixed(3), total: total ? +total.toFixed(2) : null, preco_litro: preco ? +preco.toFixed(3) : null,
      comb, cheio: $("#f-cheio").checked, atualizado_em: new Date().toISOString() };
    const btn = $("#salvar"); btn.disabled = true; const eraEdicao = !!editingId;
    const q = eraEdicao ? sb.from("abastecimentos").update(row).eq("id", editingId) : sb.from("abastecimentos").insert(row);
    const { error } = await q; btn.disabled = false;
    if (error) { msg(error.code === "23505" ? `Já existe um abastecimento com ${fKm(km)} km.` : erroTexto("salvar", error), "bad"); return; }
    resetForm(); msg(); nucleo.toast(eraEdicao ? "Abastecimento alterado." : "Abastecimento salvo."); carregar();
  };

  $("#lista").addEventListener("click", async (ev) => {
    const ed = ev.target.closest("[data-edit]"), dl = ev.target.closest("[data-del]");
    if (ed) {
      const e = entries.find((x) => x.id === ed.dataset.edit); if (!e) return; resetForm(); editingId = e.id;
      $("#f-km").value = e.km; $("#f-litros").value = toField(e.litros, 3); $("#f-total").value = toField(e.total, 2); $("#f-preco").value = toField(e.precoLitro, 3);
      $("#f-data").value = e.data; $("#f-cheio").checked = !!e.cheio; setComb(e.comb); $("#cancelar").hidden = false; $("#salvar").textContent = "Salvar alteração";
      msg(`Editando o abastecimento de ${fData(e.data)}.`, "warn"); $("#novo").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (dl) {
      const id = dl.dataset.del;
      if (pendingDel !== id) { pendingDel = id; clearTimeout(pendingTimer); pendingTimer = setTimeout(() => { pendingDel = null; render(); }, 4000); render(); return; }
      pendingDel = null; clearTimeout(pendingTimer);
      const { error } = await sb.from("abastecimentos").delete().eq("id", id);
      if (error) return msg(erroTexto("excluir", error), "bad");
      if (editingId === id) resetForm();
      nucleo.toast("Abastecimento excluído."); carregar();
    }
  });
  document.querySelectorAll(".mf-periodo button").forEach((b) => b.onclick = () => {
    periodo = +b.dataset.p;
    document.querySelectorAll(".mf-periodo button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  });

  // ---------------------------------------------------------------- fotos
  const tileHTML = {};
  ["painel", "nota"].forEach((t) => tileHTML[t] = $("#tile-" + t).innerHTML);
  function resetTile(t) { const el = $("#tile-" + t); el.innerHTML = tileHTML[t]; el.classList.remove("has"); bindInput($("#in-" + t), t); }
  function tileState(t, url, text, kind) {
    const el = $("#tile-" + t);
    const input = el.querySelector("input"); el.classList.add("has");
    el.innerHTML = ""; if (url) { const img = document.createElement("img"); img.src = url; img.alt = ""; el.appendChild(img); }
    const b = document.createElement("b"); b.textContent = t === "painel" ? "Painel" : "Nota"; el.appendChild(b);
    const s = document.createElement("span"); s.className = "state " + (kind || ""); s.textContent = text; el.appendChild(s);
    if (kind !== "busy") { const again = document.createElement("span"); again.textContent = "toque para refazer"; el.appendChild(again); }
    el.appendChild(input);
  }
  // Reduz a foto no próprio celular antes de enviar (foto do iPhone tem 3–8 MB; enviada inteira, a conexão cai).
  // Usa <img> + canvas, que no Safari já respeita a rotação da foto. Nunca envia o arquivo original.
  function carregarImg(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), img = new Image();
      img.onload = () => res({ img, u }); img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("formato de foto não suportado")); }; img.src = u;
    });
  }
  async function prep(file) {
    const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("falha ao ler a foto")); r.readAsDataURL(blob); });
    const { img, u } = await carregarImg(file);
    try {
      const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) throw new Error("foto vazia");
      for (const [lado, q] of [[1280, .8], [1024, .7], [800, .6]]) {
        const sc = Math.min(1, lado / Math.max(w, h)), c = document.createElement("canvas");
        c.width = Math.round(w * sc); c.height = Math.round(h * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
        c.width = c.height = 0; // libera memória no iPhone
        if (blob && blob.size <= 900 * 1024) return { blob, b64: await toB64(blob), mime: "image/jpeg" };
      }
      throw new Error("não consegui reduzir a foto");
    } finally { URL.revokeObjectURL(u); }
  }
  async function chamarLeitura(payload) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const { data: { session: s } } = await sb.auth.getSession();
      const r = await fetch(CFG.supabaseUrl + "/functions/v1/ler-foto", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + (s?.access_token || "") },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { erro: j.erro || ("erro " + r.status), status: r.status };
      return j;
    } catch (e) { return { erro: e.name === "AbortError" ? "demorou demais, tente de novo" : "sem conexão com o servidor" }; }
    finally { clearTimeout(timer); }
  }
  async function ler(t, file) {
    if (!file) return;
    if (!nucleo.user) { msg("Entre com sua conta para ler as fotos.", "bad"); return; }
    tileState(t, null, "preparando foto…", "busy");
    let p; try { p = await prep(file); } catch (e) { tileState(t, null, e.message || "foto não suportada", "err"); return; }
    const { blob, b64, mime } = p; const url = URL.createObjectURL(blob);
    tileState(t, url, "lendo…", "busy");
    const ultimoKm = entries.reduce((a, e) => Math.max(a, e.km), 0) || undefined;
    const r = await chamarLeitura({ tipo: t, imagem: b64, mime, ultimoKm });
    if (!r || r.erro) {
      let txt = r?.erro || "não consegui ler";
      if (/limite/.test(txt)) txt = "limite grátis, aguarde 1 min";
      else if (r?.status === 401) txt = "sessão expirou, entre de novo";
      else if (r?.status >= 500) console.warn("ler-foto", r);
      tileState(t, url, txt, "err"); return;
    }
    if (t === "painel") {
      const km = kmParse(r.km);
      if (km) { fill("km", String(km)); tileState(t, url, `${fKm(km)} km` + (r.confianca === "baixa" ? " · confira" : ""), r.confianca === "baixa" ? "err" : "ok"); }
      else tileState(t, url, "KM não encontrado", "err");
    } else {
      const l = dec(r.litros), tot = dec(r.total), pr = dec(r.precoLitro);
      if (l) fill("litros", toField(l, 3)); if (tot) fill("total", toField(tot, 2)); if (pr) fill("preco", toField(pr, 3));
      if (r.combustivel === "gasolina" || r.combustivel === "etanol") setComb(r.combustivel);
      if (typeof r.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.data)) $("#f-data").value = r.data;
      completarValores();
      if (l) tileState(t, url, `${fN(l, 2)} L${r.combustivel ? " · " + NOMES[r.combustivel] : ""}`, "ok"); else tileState(t, url, "litros não encontrados", "err");
    }
  }
  function bindInput(inp, t) { inp.onchange = () => { const f = inp.files && inp.files[0]; ler(t, f); inp.value = ""; }; }
  bindInput($("#in-painel"), "painel"); bindInput($("#in-nota"), "nota");
  $("#g-painel").onchange = (e) => { ler("painel", e.target.files[0]); e.target.value = ""; };
  $("#g-nota").onchange = (e) => { ler("nota", e.target.files[0]); e.target.value = ""; };

  // ---------------------------------------------------------------- menu
  $("#menu-btn").addEventListener("click", (e) => { e.stopPropagation(); $("#menu").hidden = !$("#menu").hidden; });
  document.addEventListener("click", (e) => { if (!e.target.closest("#menu")) $("#menu").hidden = true; });

  // ---------------------------------------------------------------- início
  $("#f-data").value = hoje();
  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  nucleo.comecar();
})();
