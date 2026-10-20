/* =====================================================================
   MOTOR DE CÁLCULO — Ferramenta Alfa
   Funções puras (sem tela): leitura das listas dos fornecedores,
   precificação, junção de cotas, busca e seleção da divulgação.
   Funciona no navegador (window.Motor) e no Node (testes).
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- Números e formatação ---------------- */
  function parseBR(s) {
    if (s == null) return 0;
    if (typeof s === 'number') return isFinite(s) ? s : 0;
    let t = String(s).toLowerCase().replace(/r\$/g, '').replace(/\s+/g, ' ').trim();
    let mult = 1;
    if (/\bmil\b/.test(t) || /\dk\b/.test(t)) { mult = 1000; t = t.replace(/\bmil\b/, '').replace(/k\b/, ''); }
    t = t.replace(/[^\d.,-]/g, '');
    if (!t) return 0;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return isFinite(n) ? n * mult : 0;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  function formatBRL(n) {
    return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function formatPct(n, casas) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas }) + '%';
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---------------- Administradoras ---------------- */
  // logo = arquivo em assets/. chaves = palavras que identificam a administradora no texto do fornecedor.
  const ADMS = [
    { nome: 'Caixa Consórcios', chaves: ['caixa'], logo: 'assets/adm_logo_8.png' },
    { nome: 'HS Consórcios', chaves: ['hs'], logo: 'assets/adm_logo_1.png' },
    { nome: 'Bradesco Consórcios', chaves: ['bradesco'], logo: 'assets/adm_logo_2.png' },
    { nome: 'CNP Consórcio', chaves: ['cnp'], logo: 'assets/adm_logo_3.png' },
    { nome: 'Consórcio Nacional Volkswagen', chaves: ['volkswagen', 'vw'], logo: 'assets/adm_logo_4.png' },
    { nome: 'Porto Bank VP', chaves: ['porto bank vp', 'porto vp'], logo: 'assets/adm_logo_5.png' },
    { nome: 'Porto Bank', chaves: ['porto'], logo: 'assets/adm_logo_13.png' },
    { nome: 'BB Consórcios', chaves: ['bb', 'banco do brasil'], logo: 'assets/adm_logo_6.png' },
    { nome: 'Racon Consórcios', chaves: ['racon'], logo: 'assets/adm_logo_17.png' },
    { nome: 'Consórcio Randon', chaves: ['randon'], logo: 'assets/adm_logo_7.png' },
    { nome: 'Disal Consórcio', chaves: ['disal'], logo: 'assets/adm_logo_9.png' },
    { nome: 'Consórcio Embracon', chaves: ['embracon'], logo: 'assets/adm_logo_10.png' },
    { nome: 'Consórcio Magalu', chaves: ['magalu', 'magazine luiza'], logo: 'assets/adm_logo_11.png' },
    { nome: 'Mycon', chaves: ['mycon'], logo: 'assets/adm_logo_12.png' },
    { nome: 'Sponchiado Consórcios', chaves: ['sponchiado'], logo: 'assets/adm_logo_14.png' },
    { nome: 'Itaú Consórcio', chaves: ['itau'], logo: 'assets/adm_logo_15.png' },
    { nome: 'Consórcio Servopa', chaves: ['servopa'], logo: 'assets/adm_logo_16.png' },
    { nome: 'Santander Consórcio', chaves: ['santander'], logo: 'assets/adm_logo_18.png' },
    { nome: 'Serello Consórcios', chaves: ['serello'], logo: 'assets/adm_logo_19.png' },
    { nome: 'Rodobens', chaves: ['rodobens'], logo: 'assets/adm_logo_20.png' }
  ];
  const ADM_CAIXA = 'Caixa Consórcios';
  function canonAdm(txt) {
    const t = ' ' + semAcento(txt).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    if (!t.trim()) return '';
    for (const a of ADMS) {
      for (const k of a.chaves) if (t.includes(' ' + k + ' ')) return a.nome;
    }
    // desconhecida: devolve o texto limpo (primeira letra maiúscula)
    return String(txt).replace(/[*_📄🚙🏠🏡]/g, '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function logoAdm(nome) { const a = ADMS.find((x) => x.nome === nome); return a ? a.logo : ''; }

  /* ---------------- Fornecedores ---------------- */
  const FORNECEDORES = {
    lume: { nome: 'LuME', modo: 'substituir' },
    uni: { nome: 'UniContemplados', modo: 'substituir' },
    fraga: { nome: 'Fraga e Bitello', modo: 'substituir' },
    rafael: { nome: 'Rafael Holanda', modo: 'somar', semJuncao: true, validadeDias: 7 }
  };
  const TIPOS = { veiculo: 'Veículos', imovel: 'Imóveis' };

  /* ---------------- Carta: medidas básicas ---------------- */
  const somaN = (ets) => (ets || []).reduce((s, e) => s + e.n, 0);
  const somaNV = (ets) => (ets || []).reduce((s, e) => s + e.n * e.v, 0);
  function prazo(c) { return somaN(c.etapas); }
  function saldoDevedor(c) { return somaNV(c.etapas); }
  function ehOportunidade(c) { return (c.entradaParcelas || []).length > 0; }
  function etapaMaiorPrazo(c) {
    let m = null;
    (c.etapas || []).forEach((e) => { if (!m || e.n > m.n) m = e; });
    return m;
  }
  function assinatura(c) {
    return [c.fornecedor, c.tipo, c.adm, r2(c.credito), r2(c.entrada),
      (c.entradaParcelas || []).map((e) => e.n + 'x' + r2(e.v)).join('+'),
      (c.etapas || []).map((e) => e.n + 'x' + r2(e.v)).join('+')].join('|');
  }

  // Calendário mês a mês de várias sequências de etapas: devolve array com o total de cada mês.
  function calendario(listaEtapas) {
    const total = Math.max(0, ...listaEtapas.map(somaN));
    const meses = new Array(total).fill(0);
    listaEtapas.forEach((ets) => {
      let m = 0;
      (ets || []).forEach((e) => { for (let i = 0; i < e.n; i++) meses[m++] += e.v; });
    });
    return meses.map(r2);
  }
  // Agrupa meses seguidos de mesmo valor em faixas {n, v}
  function faixas(meses) {
    const out = [];
    meses.forEach((v) => {
      const u = out[out.length - 1];
      if (u && Math.abs(u.v - v) < 0.005) u.n++; else out.push({ n: 1, v });
    });
    return out;
  }
  // Cronograma para o cliente: períodos em que a parcela da carta e a da entrada ficam iguais
  function cronograma(cal, calEnt) {
    const n = Math.max(cal.length, calEnt.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = cal[i] || 0, e = calEnt[i] || 0;
      const u = out[out.length - 1];
      if (u && Math.abs(u.carta - c) < 0.005 && Math.abs(u.entrada - e) < 0.005) u.ate = i + 1;
      else out.push({ de: i + 1, ate: i + 1, carta: c, entrada: e, total: r2(c + e) });
    }
    return out;
  }
  function textoFaixas(fx) {
    return fx.map((f) => pad2(f.n) + ' x ' + formatBRL(f.v)).join(' + ');
  }

  /* ---------------- Precificação ---------------- */
  const SEGMENTOS = {
    leves: { nome: 'Veículos leves', custo: 1000, tipo: 'veiculo' },
    pesados: { nome: 'Caminhões / pesados', custo: 2000, tipo: 'veiculo' },
    motos: { nome: 'Motos', custo: 1000, tipo: 'veiculo' },
    maquinas: { nome: 'Máquinas da linha amarela', custo: 2000, tipo: 'veiculo', adm: ADM_CAIXA },
    implementos: { nome: 'Implementos rodoviários', custo: 3000, tipo: 'veiculo', adm: ADM_CAIXA },
    solar: { nome: 'Energia solar', custo: 1000, tipo: 'veiculo', adm: ADM_CAIXA },
    imoveis: { nome: 'Imóveis', custo: 1000, tipo: 'imovel' }
  };
  const FAIXAS_LIMITES = [100000, 300000, Infinity];
  const TAXAS_PADRAO = [
    { alpha: 2.5, jairo: 2.5, parceiro: 2 },
    { alpha: 2, jairo: 2, parceiro: 1.5 },
    { alpha: 1.5, jairo: 1.5, parceiro: 1.5 }
  ];
  const TRANSFERENCIA_PCT = 1;     // % do crédito
  const TETO_PCT = 35;             // referência da régua (regra Jairo) e filtro da divulgação
  const AGIO_ALFA_PCT = 7;         // regra Alfa: entrada + 7% do crédito
  const FR_FATOR = 1.30, FR_PCT = 3; // Fundo de reserva (fórmula Alfa): crédito × 1,30 × 3%

  function precoPadrao(segmento) {
    const s = SEGMENTOS[segmento] || SEGMENTOS.leves;
    return { segmento: segmento || 'leves', parceiro: false, cheio: false, custoSegmento: s.custo,
      transferenciaPct: TRANSFERENCIA_PCT, taxas: TAXAS_PADRAO.map((t) => ({ ...t })) };
  }

  // Regra Jairo: custo do segmento + transferência + comissão por faixa (progressiva, como IR)
  function precificacaoJairo(credito, entradaForn, params) {
    const p = params || precoPadrao();
    const custoSegmento = p.custoSegmento || 0;
    const transferencia = credito * (p.transferenciaPct || 0) / 100;
    const faixasCom = [];
    const split = { alpha: 0, jairo: 0, parceiro: 0 };
    const pctDe = (t) => (t.alpha || 0) + (t.jairo || 0) + (p.parceiro ? (t.parceiro || 0) : 0);
    const somar = (base, t, rotulo) => {
      const pct = pctDe(t);
      split.alpha += base * (t.alpha || 0) / 100;
      split.jairo += base * (t.jairo || 0) / 100;
      if (p.parceiro) split.parceiro += base * (t.parceiro || 0) / 100;
      faixasCom.push({ rotulo, base, pct, valor: base * pct / 100 });
    };
    if (p.cheio) somar(credito, p.taxas[0], 'valor cheio');
    else {
      let ini = 0;
      FAIXAS_LIMITES.forEach((lim, i) => {
        if (credito <= ini) return;
        somar(Math.min(credito, lim) - ini, p.taxas[i], ['até R$ 100 mil', 'de R$ 100 mil a R$ 300 mil', 'acima de R$ 300 mil'][i]);
        ini = lim;
      });
    }
    const comissao = faixasCom.reduce((a, f) => a + f.valor, 0);
    const acrescimo = custoSegmento + transferencia + comissao;
    return { regra: 'jairo', acrescimo, entradaFinal: entradaForn + acrescimo, custoSegmento, transferencia,
      comissao, faixas: faixasCom, split, transferenciaAParte: 0 };
  }
  // Regra Alfa: entrada + 7% do crédito; transferência de 1% informada à parte
  function precificacaoAlfa(credito, entradaForn) {
    const agio = credito * AGIO_ALFA_PCT / 100;
    return { regra: 'alfa', acrescimo: agio, entradaFinal: entradaForn + agio,
      transferenciaAParte: credito * TRANSFERENCIA_PCT / 100 };
  }
  function precificar(credito, entradaForn, regra, params) {
    return regra === 'alfa' ? precificacaoAlfa(credito, entradaForn) : precificacaoJairo(credito, entradaForn, params);
  }
  function fundoReserva(credito) { return credito > 0 ? credito * FR_FATOR * FR_PCT / 100 : 0; }

  // Taxa mensal linear (a mesma do card atual): (total pago − crédito) ÷ crédito ÷ prazo
  function taxaMensalLinear(credito, entradaFinal, totalParcelas, prazoMeses) {
    if (!(credito > 0) || !(prazoMeses > 0) || !(totalParcelas > 0)) return null;
    return ((entradaFinal + totalParcelas - credito) / credito * 100) / prazoMeses;
  }
  // Custo efetivo mensal (TIR): recebe o crédito no mês 0, paga entrada (+ taxa à parte), depois as parcelas
  function tirMensal(liquidoInicial, pagamentos) {
    if (!(liquidoInicial > 0) || !pagamentos.length) return null;
    const vpl = (i) => { let s = liquidoInicial, f = 1; for (const p of pagamentos) { f *= (1 + i); s -= p / f; } return s; };
    let lo = -0.99, hi = 1;
    if (vpl(0) >= 0 && vpl(lo + 1e-9) >= 0) return null;
    if (vpl(hi) < 0) return null;
    for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (vpl(m) < 0) lo = m; else hi = m; }
    return ((lo + hi) / 2) * 100;
  }

  /* ---------------- Avaliação exata de uma junção ---------------- */
  function avaliar(cotas, ctx) {
    const regra = (ctx && ctx.regra) || 'alfa';
    const params = (ctx && ctx.params) || precoPadrao((ctx && ctx.segmento) || 'leves');
    const credito = cotas.reduce((s, c) => s + c.credito, 0);
    const entradaForn = cotas.reduce((s, c) => s + c.entrada, 0);
    const preco = precificar(credito, entradaForn, regra, params);
    const cal = calendario(cotas.map((c) => c.etapas));
    const calEnt = calendario(cotas.map((c) => c.entradaParcelas || []));
    const fx = faixas(cal);
    const fxEnt = faixas(calEnt);
    const prazoTotal = cal.length;
    const saldo = r2(cal.reduce((s, v) => s + v, 0));
    const entradaParcelada = r2(calEnt.reduce((s, v) => s + v, 0));
    const parcelaMax = cal.length ? Math.max(...cal) : 0;
    const parcelaInicial = cal[0] || 0;
    const desembolsoMax = Math.max(0, ...cal.map((v, i) => v + (calEnt[i] || 0)));
    const fr = fundoReserva(credito);
    const taxaMensal = taxaMensalLinear(credito, preco.entradaFinal, saldo + entradaParcelada, prazoTotal);
    const pagamentos = cal.map((v, i) => v + (calEnt[i] || 0));
    for (let i = cal.length; i < calEnt.length; i++) pagamentos.push(calEnt[i]);
    const tir = tirMensal(credito - preco.entradaFinal - preco.transferenciaAParte, pagamentos);
    const custoTotal = preco.entradaFinal + saldo + entradaParcelada + preco.transferenciaAParte;
    const c0 = cotas[0] || {};
    return {
      cotas, regra, credito, entradaForn, preco, entradaFinal: preco.entradaFinal, entradaTotal: preco.entradaFinal + entradaParcelada,
      transferenciaAParte: preco.transferenciaAParte, calendario: cal, faixas: fx, faixasEntrada: fxEnt,
      prazo: prazoTotal, saldo, entradaParcelada, parcelaMax, parcelaInicial, desembolsoMax, fundoReserva: fr,
      cronograma: cronograma(cal, calEnt),
      taxaMensal, tirMensal: tir, tirAnual: tir == null ? null : (Math.pow(1 + tir / 100, 12) - 1) * 100,
      custoTotal, custoRelativo: credito > 0 ? custoTotal / credito : Infinity,
      pctEntrada: credito > 0 ? preco.entradaFinal / credito * 100 : 0,
      fornecedor: c0.fornecedor, adm: c0.adm, tipo: c0.tipo,
      oportunidade: cotas.some(ehOportunidade)
    };
  }

  // Valida se as cotas podem ser juntadas (modo manual)
  function validarJuncao(cotas) {
    if (!cotas.length) return 'Escolha ao menos uma carta.';
    if (cotas.length > 1) {
      if (cotas.some((c) => FORNECEDORES[c.fornecedor] && FORNECEDORES[c.fornecedor].semJuncao))
        return 'Cartas do ' + FORNECEDORES.rafael.nome + ' nunca são combinadas — ofereça sozinha.';
      const f = cotas[0].fornecedor, a = cotas[0].adm, t = cotas[0].tipo;
      if (cotas.some((c) => c.fornecedor !== f)) return 'Junção só com cartas do mesmo fornecedor.';
      if (cotas.some((c) => c.adm !== a)) return 'Junção só com cartas da mesma administradora.';
      if (cotas.some((c) => c.tipo !== t)) return 'Não dá para juntar carta de imóvel com carta de veículo.';
    }
    return '';
  }

  /* ---------------- Busca ---------------- */
  const OBJETIVOS = {
    proximo: 'Mais próximo do pedido',
    entrada: 'Menor entrada',
    parcela: 'Menor parcela',
    meio: 'Meio-termo (entrada × parcela)',
    custo: 'Melhor custo-benefício',
    maior: 'Maior crédito dentro dos limites'
  };

  function cartasDoSegmento(base, segmento) {
    const s = SEGMENTOS[segmento];
    if (!s) return [];
    return base.filter((c) => c.tipo === s.tipo && (!s.adm || c.adm === s.adm) && c.credito > 0 && (c.etapas || []).length);
  }

  // Guarda só as K combinações de menor nota (sem precisar guardar todas)
  function TopK(k) {
    const itens = [];
    let corte = Infinity;
    return {
      quer: (s) => s < corte || itens.length < k,
      add(item) {
        itens.push(item);
        if (itens.length >= k * 2) { itens.sort((a, b) => a.s - b.s); itens.length = k; corte = itens[k - 1].s; }
      },
      lista() { itens.sort((a, b) => a.s - b.s); return itens.slice(0, k); }
    };
  }

  // Percorre as combinações de um grupo (mesmo fornecedor + administradora), em ordem de crédito,
  // podando o que não chega no crédito mínimo, passa do máximo ou estoura os limites.
  function enumerarGrupo(cartas, maxCartas, lim, visitar, contador) {
    const ord = [...cartas].sort((a, b) => a.credito - b.credito);
    const n = ord.length;
    const maxK = Math.min(maxCartas, n);
    const sel = [];
    const m = ord.map((c) => ({
      cr: c.credito, en: c.entrada, sd: saldoDevedor(c), ep: somaNV(c.entradaParcelas),
      // 1º mês e maior mês incluem as parcelas da entrada (cartas Oportunidade)
      p1: (c.etapas[0] || { v: 0 }).v + ((c.entradaParcelas || [])[0] || { v: 0 }).v,
      pmax: Math.max(...c.etapas.map((e) => e.v)) + Math.max(0, ...(c.entradaParcelas || []).map((e) => e.v))
    }));
    // maiores[r] = soma dos r maiores créditos do grupo (para saber se ainda dá para chegar no mínimo)
    const maiores = [0];
    for (let r = 1; r <= maxK; r++) maiores[r] = maiores[r - 1] + m[n - r].cr;
    function dfs(start, cr, en, sd, ep, p1, pmax) {
      if (contador.n++ > contador.cap) { contador.capped = true; return; }
      if (sel.length && cr >= lim.lo) visitar(sel, ord, cr, en, sd, ep, p1, pmax);
      const resta = maxK - sel.length;
      if (resta <= 0) return;
      if (cr + maiores[Math.min(resta, n - start)] < lim.lo) return; // nem com as maiores chega no mínimo
      for (let i = start; i < n; i++) {
        const x = m[i];
        const ncr = cr + x.cr;
        if (ncr > lim.hi) break;                                     // ordenado: as próximas só aumentam
        if (lim.entradaMax && en + x.en + ep + x.ep > lim.entradaMax) continue;  // entrada do fornecedor já passa do teto
        if (lim.parcelaMax && p1 + x.p1 > lim.parcelaMax + 0.005) continue; // 1º mês já passa do teto
        sel.push(i);
        dfs(i + 1, ncr, en + x.en, sd + x.sd, ep + x.ep, p1 + x.p1, pmax + x.pmax);
        sel.pop();
        if (contador.n > contador.cap) return;
      }
    }
    dfs(0, 0, 0, 0, 0, 0, 0);
  }

  // Escolhe as opções finais: primeiro as que não repetem carta (todas podem ser fechadas),
  // depois completa com as demais se faltar.
  function escolherDiversas(ordenadas, qtd) {
    const usadas = new Set();
    const escolhidas = [];
    const chave = (c) => c.id || assinatura(c);
    ordenadas.forEach((a) => {
      if (escolhidas.length >= qtd) return;
      if (a.cotas.some((c) => usadas.has(chave(c)))) return;
      escolhidas.push(a); a.cotas.forEach((c) => usadas.add(chave(c)));
    });
    ordenadas.forEach((a) => { if (escolhidas.length < qtd && !escolhidas.includes(a)) escolhidas.push(a); });
    return escolhidas;
  }

  function rodarBusca(base, q) {
    const elegiveis = cartasDoSegmento(base, q.segmento);
    const grupos = {};
    elegiveis.forEach((c) => {
      const semJ = FORNECEDORES[c.fornecedor] && FORNECEDORES[c.fornecedor].semJuncao;
      const chave = semJ ? 'solo|' + (c.id || assinatura(c)) : c.fornecedor + '|' + c.adm;
      (grupos[chave] = grupos[chave] || []).push(c);
    });
    const alvo = q.credito || 0;
    let lo = 0, hi = Infinity;
    if (q.objetivo !== 'maior') {
      const tol = q.objetivo === 'proximo' ? Math.max(q.tolerancia, 0.30) : q.tolerancia;
      lo = alvo * (1 - tol); hi = alvo * (1 + tol);
    } else if (alvo > 0) {
      lo = alvo * (1 - q.tolerancia); // "maior crédito": o crédito pedido vira o mínimo aceitável
    }
    const lim = { lo, hi, entradaMax: q.entradaMax || 0, parcelaMax: q.parcelaMax || 0 };
    const segParams = q.params || precoPadrao(q.segmento);
    const contador = { n: 0, cap: 12000000, capped: false };
    const percorrer = (visitar) => {
      Object.keys(grupos).forEach((k) => enumerarGrupo(grupos[k], k.startsWith('solo|') ? 1 : q.maxCartas, lim, visitar, contador));
    };
    // nota rápida de cada combinação (exata para entrada, crédito e custo; aproximada para parcela)
    // ef = entrada total (à vista com ágio + parcelas da entrada das cartas Oportunidade)
    const metricas = (cr, en, sd, ep) => {
      const pr = precificar(cr, en, q.regra, segParams);
      return { ef: pr.entradaFinal + ep, custo: (pr.entradaFinal + sd + ep + pr.transferenciaAParte) / cr };
    };
    let E0 = 1, P0 = 1;
    if (q.objetivo === 'meio') {
      // 1ª passada: menor entrada e menor parcela possíveis, para equilibrar as duas
      E0 = Infinity; P0 = Infinity;
      percorrer((sel, ord, cr, en, sd, ep, p1, pmax) => {
        const { ef } = metricas(cr, en, sd, ep);
        if (lim.entradaMax && ef > lim.entradaMax) return;
        if (ef < E0) E0 = ef; if (pmax < P0) P0 = pmax;
      });
      contador.n = 0;
    }
    const nota = {
      proximo: (cr, ef, p1) => Math.abs(cr - alvo) / (alvo || 1) + (q.entradaAlvo ? Math.abs(ef - q.entradaAlvo) / q.entradaAlvo : 0) + (q.parcelaAlvo ? Math.abs(p1 - q.parcelaAlvo) / q.parcelaAlvo : 0),
      entrada: (cr, ef) => ef,
      parcela: (cr, ef, p1, pmax) => pmax,
      meio: (cr, ef, p1, pmax) => ef / (E0 || 1) + pmax / (P0 || 1),
      custo: (cr, ef, p1, pmax, custo) => custo,
      maior: (cr) => -cr
    }[q.objetivo] || null;
    const POOL_EXATO = Math.max(150, q.qtd * 30);
    const top = TopK(POOL_EXATO);
    percorrer((sel, ord, cr, en, sd, ep, p1, pmax) => {
      const { ef, custo } = metricas(cr, en, sd, ep);
      if (lim.entradaMax && ef > lim.entradaMax + 0.005) return;
      const s = nota(cr, ef, p1, pmax, custo) + sel.length * 1e-9; // desempate: menos cartas
      if (top.quer(s)) top.add({ s, cotas: sel.map((i) => ord[i]) });
    });
    let exatos = top.lista().map((p) => avaliar(p.cotas, { regra: q.regra, params: segParams, segmento: q.segmento }));
    if (lim.parcelaMax) exatos = exatos.filter((a) => a.desembolsoMax <= lim.parcelaMax + 0.005);
    if (lim.entradaMax) exatos = exatos.filter((a) => a.entradaTotal <= lim.entradaMax + 0.005);

    // ordenação exata
    let E1 = Infinity, P1 = Infinity;
    exatos.forEach((a) => { E1 = Math.min(E1, a.entradaTotal); P1 = Math.min(P1, a.desembolsoMax); });
    const chaveExata = {
      proximo: (a) => Math.abs(a.credito - alvo) / (alvo || 1) + (q.entradaAlvo ? Math.abs(a.entradaTotal - q.entradaAlvo) / q.entradaAlvo : 0) + (q.parcelaAlvo ? Math.abs(a.parcelaInicial - q.parcelaAlvo) / q.parcelaAlvo : 0),
      entrada: (a) => a.entradaTotal,
      parcela: (a) => a.desembolsoMax,
      meio: (a) => a.entradaTotal / (E1 || 1) + a.desembolsoMax / (P1 || 1),
      custo: (a) => a.custoRelativo,
      maior: (a) => -a.credito
    };
    const fe = chaveExata[q.objetivo] || chaveExata.proximo;
    exatos.forEach((a) => { a._s = fe(a); });
    exatos.sort((a, b) => (a._s - b._s) || (a.cotas.length - b.cotas.length) || (a.entradaTotal - b.entradaTotal));
    return { opcoes: escolherDiversas(exatos, q.qtd), capped: contador.capped, elegiveis: elegiveis.length };
  }

  function buscar(base, consulta) {
    const q = Object.assign({ objetivo: 'proximo', tolerancia: 0.15, qtd: 5, maxCartas: 4, regra: 'alfa' }, consulta);
    if (!SEGMENTOS[q.segmento]) return { erro: 'Escolha o segmento do cliente.' };
    if (q.objetivo === 'maior' && !q.entradaMax && !q.parcelaMax) return { erro: 'Para "maior crédito", informe uma entrada máxima ou uma parcela máxima.' };
    if (q.objetivo !== 'maior' && !(q.credito > 0)) return { erro: 'Informe o crédito que o cliente quer.' };
    const r = rodarBusca(base, q);
    const res = { opcoes: r.opcoes, capped: r.capped, elegiveis: r.elegiveis, relaxadas: [] };
    if (!r.opcoes.length && r.elegiveis && q.objetivo !== 'maior') {
      // Não deu para atender tudo: mostra as mais próximas cedendo um critério de cada vez
      const tentativas = [];
      if (q.entradaMax) tentativas.push({ rotulo: 'sem o limite de entrada', mud: { entradaMax: 0 } });
      if (q.parcelaMax) tentativas.push({ rotulo: 'sem o limite de parcela', mud: { parcelaMax: 0 } });
      if (q.objetivo !== 'maior') tentativas.push({ rotulo: 'aceitando até 30% de diferença no crédito', mud: { tolerancia: 0.30 } });
      if (q.entradaMax && q.parcelaMax) tentativas.push({ rotulo: 'sem os limites de entrada e de parcela', mud: { entradaMax: 0, parcelaMax: 0 } });
      tentativas.forEach((t) => {
        const r2b = rodarBusca(base, Object.assign({}, q, t.mud, { qtd: 1 }));
        if (r2b.opcoes.length) res.relaxadas.push({ rotulo: t.rotulo, opcao: r2b.opcoes[0] });
      });
    }
    // aviso: mesma carta em mais de uma opção
    const todas = res.opcoes.concat(res.relaxadas.map((x) => x.opcao));
    todas.forEach((a, i) => {
      const ids = new Set(a.cotas.map((c) => c.id || assinatura(c)));
      a.compartilhaCom = [];
      todas.forEach((b, j) => { if (i !== j && b.cotas.some((c) => ids.has(c.id || assinatura(c)))) a.compartilhaCom.push(j + 1); });
    });
    return res;
  }

  /* ---------------- Texto no formato da Alfa ---------------- */
  /* ---------------- Como o cliente lê a proposta ---------------- */
  // Períodos de pagamento com o total do mês (parcela da carta + parcela da entrada, se houver)
  function periodosCliente(a) {
    const out = [];
    (a.cronograma || []).forEach((p) => {
      const u = out[out.length - 1];
      if (u && Math.abs(u.valor - p.total) < 0.005) u.ate = p.ate;
      else out.push({ de: p.de, ate: p.ate, valor: p.total });
    });
    return out;
  }
  function textoPeriodo(p) { return p.de === p.ate ? 'No mês ' + p.de : 'De ' + p.de + ' à ' + p.ate; }
  // "1x de R$ 22.000,00 + 10x de R$ 3.500,00"
  function textoEntradaParcelada(a) {
    return ['1x de ' + formatBRL(a.entradaFinal)].concat((a.faixasEntrada || []).map((f) => f.n + 'x de ' + formatBRL(f.v))).join(' + ');
  }
  function textoProposta(a) {
    const L = [];
    const oport = a.entradaParcelada > 0;
    L.push('CRÉDITO: ' + formatBRL(a.credito));
    if (oport) L.push('ENTRADA PARCELADA: ' + textoEntradaParcelada(a));
    else L.push('ENTRADA: ' + formatBRL(a.entradaFinal));
    L.push('PRAZO: ' + a.prazo + ' meses');
    const per = periodosCliente(a);
    if (per.length === 1) L.push('PARCELAS: ' + a.prazo + 'x de ' + formatBRL(per[0].valor));
    else L.push('PARCELAS: ' + per.map((p) => textoPeriodo(p) + ' ' + formatBRL(p.valor)).join(' / '));
    if (oport) L.push('(Parcelas da entrada já incluídas)');
    L.push('BANCO: ' + (a.adm || '—'));
    if (a.transferenciaAParte > 0) L.push('TAXA DE TRANSFERÊNCIA: ' + formatBRL(a.transferenciaAParte) + ' (paga à parte)');
    L.push('FUNDO RESERVA APROXIMADAMENTE: ' + formatBRL(a.fundoReserva));
    if (a.cotas.length > 1) {
      L.push('');
      L.push('Cotas usadas:');
      a.cotas.forEach((c) => {
        L.push('- ' + formatBRL(c.credito) + ' | entrada ' + formatBRL(c.entrada) +
          (ehOportunidade(c) ? ' + ' + textoFaixas(c.entradaParcelas) : '') + ' | ' + textoFaixas(c.etapas));
      });
    }
    return L.join('\n');
  }

  /* ---------------- Divulgação ---------------- */
  // Faixas de crédito que mais saem, por arte. adm = só aquela administradora; tipo = tipo da carta.
  const DIV_FAIXAS = [
    { seg: 'motos', tipo: 'veiculo', min: 0, max: 40000 },
    { seg: 'solar', tipo: 'veiculo', min: 0, max: 40000, adm: ADM_CAIXA },
    { seg: 'leves', tipo: 'veiculo', min: 70000, max: 150000 },
    { seg: 'implementos', tipo: 'veiculo', min: 70000, max: 100000, adm: ADM_CAIXA },
    { seg: 'pesados', tipo: 'veiculo', min: 180000, max: 220000 },
    { seg: 'maquinas', tipo: 'veiculo', min: 250000, max: 350000, adm: ADM_CAIXA },
    { seg: 'imoveis', tipo: 'imovel', min: 350000, max: 1000000 }
  ];
  const SEG_COM_PROMO = ['leves', 'pesados', 'maquinas', 'imoveis', 'implementos'];
  const PROMO_POR_SEGMENTO = 2;

  function segmentosDivulgacao(c) {
    return DIV_FAIXAS.filter((f) => c.tipo === f.tipo && c.credito >= f.min && c.credito <= f.max && (!f.adm || c.adm === f.adm)).map((f) => f.seg);
  }
  // Preço da divulgação: regra Jairo, sempre com parceiro e desconto progressivo
  function precoDivulgacao(c, seg) {
    const regra = { ...precoPadrao(seg), parceiro: true, cheio: false };
    const res = precificacaoJairo(c.credito, c.entrada, regra);
    const resCheio = precificacaoJairo(c.credito, c.entrada, { ...regra, cheio: true });
    return { res, resCheio, economia: resCheio.entradaFinal - res.entradaFinal };
  }
  function itemDivulgacao(c, seg) {
    const pr = precoDivulgacao(c, seg);
    const et = etapaMaiorPrazo(c) || { n: 0, v: 0 };
    const pz = prazo(c);
    return {
      carta: c, seg, entradaFinal: pr.res.entradaFinal, entradaCheia: pr.resCheio.entradaFinal, economia: pr.economia,
      pctEntrada: pr.res.entradaFinal / c.credito * 100, parcela: et.v, prazo: pz,
      taxaMensal: taxaMensalLinear(c.credito, pr.res.entradaFinal, saldoDevedor(c) + somaNV(c.entradaParcelas), pz),
      fundoReserva: fundoReserva(c.credito)
    };
  }
  function selecionarDivulgacao(base) {
    const porSeg = {};
    const oportunidades = [];
    base.forEach((c) => {
      const segs = segmentosDivulgacao(c);
      if (ehOportunidade(c)) {
        // Oportunidade: todas entram (a arte própria ainda vai ser criada)
        oportunidades.push(itemDivulgacao(c, segs[0] || (c.tipo === 'imovel' ? 'imoveis' : 'leves')));
        return;
      }
      segs.forEach((seg) => {
        const it = itemDivulgacao(c, seg);
        if (it.pctEntrada < TETO_PCT) (porSeg[seg] = porSeg[seg] || []).push(it);
      });
    });
    const out = {};
    Object.keys(SEGMENTOS).forEach((seg) => {
      const lista = (porSeg[seg] || []).slice();
      let promo = [];
      if (SEG_COM_PROMO.includes(seg)) {
        promo = lista.filter((it) => it.economia > 0.5).sort((a, b) => b.economia - a.economia).slice(0, PROMO_POR_SEGMENTO);
      }
      const promoSet = new Set(promo);
      const normal = lista.filter((it) => !promoSet.has(it)).sort((a, b) => a.pctEntrada - b.pctEntrada);
      if (promo.length || normal.length) out[seg] = { promo, normal };
    });
    return { segmentos: out, oportunidades };
  }

  /* ---------------- Leitura das listas dos fornecedores ---------------- */
  const RE_MONEY = /R\$\s*([\d.]+(?:,\d{1,2})?)/gi;
  const RE_PARC = /(\d{1,3})\s*[xX]\s*(?:de\s*)?R\$\s*([\d.]+(?:,\d{1,2})?)/g;
  const RE_DATA = /\b\d{2}\/\d{2}\/\d{4}\b/;

  function novaCarta(fornecedor, tipo, campos) {
    return Object.assign({ fornecedor, tipo, adm: '', credito: 0, entrada: 0, entradaParcelas: [], etapas: [], obs: [], codigo: '' }, campos);
  }
  function cartaValida(c) {
    return c.credito > 0 && c.entrada >= 0 && c.etapas.length > 0 && c.etapas.every((e) => e.n > 0 && e.v > 0);
  }

  // LuME: tokens "ADM  R$ crédito  R$ entrada  prazo  parcela"  (uma carta por bloco, com "Ver")
  function lerLume(texto, tipo) {
    const toks = String(texto).split(/[\t\n\r]+/).map((s) => s.trim()).filter(Boolean);
    const cartas = [], ignoradas = [];
    const ehMoney = (s) => /^R\$\s*[\d.,]+$/i.test(s);
    const ehNum = (s) => /^[\d.,]+$/.test(s);
    const ruido = (s) => /^(ver|im[oó]veis|ve[ií]culos|autom[oó]veis|lume)$/i.test(s);
    let ultimoTexto = '';
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      // "PORTO R$ 56.300" na mesma célula
      const mesma = t.match(/^(.*?)\s*(R\$\s*[\d.,]+)$/i);
      if (mesma && mesma[1] && !ehNum(mesma[1])) { ultimoTexto = mesma[1]; t = mesma[2]; toks[i] = t; }
      if (ehMoney(t) && i + 3 < toks.length && (ehMoney(toks[i + 1])) && ehNum(toks[i + 2]) && (ehNum(toks[i + 3]) || ehMoney(toks[i + 3]))) {
        const n = parseInt(toks[i + 2].replace(/\D/g, ''), 10);
        const c = novaCarta('lume', tipo, {
          adm: canonAdm(ultimoTexto), credito: parseBR(t), entrada: parseBR(toks[i + 1]),
          etapas: [{ n, v: parseBR(toks[i + 3]) }]
        });
        if (cartaValida(c) && c.adm) cartas.push(c); else ignoradas.push([ultimoTexto, t, toks[i + 1], toks[i + 2], toks[i + 3]].join('  '));
        i += 3; ultimoTexto = '';
        continue;
      }
      if (ehMoney(t)) { ignoradas.push(t); continue; }
      if (!ruido(t) && !ehNum(t)) ultimoTexto = t;
    }
    return { cartas, ignoradas };
  }

  // UniContemplados: uma carta por linha — crédito | entrada (+ N x parcela da entrada) | parcelas em etapas | taxa | adm | vencimento | obs
  function lerUni(texto, tipo) {
    const cartas = [], ignoradas = [];
    String(texto).split(/\r?\n/).forEach((linha) => {
      if (!/R\$/i.test(linha)) { if (linha.trim() && /\d/.test(linha)) ignoradas.push(linha.trim()); return; }
      const parcs = [];
      let m; RE_PARC.lastIndex = 0;
      while ((m = RE_PARC.exec(linha))) parcs.push({ ini: m.index, fim: m.index + m[0].length, n: parseInt(m[1], 10), v: parseBR(m[2]) });
      const dentro = (pos) => parcs.some((p) => pos >= p.ini && pos < p.fim);
      const moneys = [];
      RE_MONEY.lastIndex = 0;
      while ((m = RE_MONEY.exec(linha))) if (!dentro(m.index)) moneys.push({ ini: m.index, fim: m.index + m[0].length, v: parseBR(m[1]) });
      if (moneys.length < 2 || !parcs.length) { ignoradas.push(linha.trim()); return; }
      const credito = moneys[0].v, entrada = moneys[1].v;
      const entradaParcelas = [], etapas = [];
      let modoEtapas = false;
      parcs.forEach((p) => {
        const antes = linha.slice(0, p.ini).replace(/\s+$/, '');
        const colado = antes.endsWith('+');
        if (!modoEtapas && colado && p.ini > moneys[1].fim && !etapas.length) entradaParcelas.push({ n: p.n, v: p.v });
        else { modoEtapas = true; etapas.push({ n: p.n, v: p.v }); }
      });
      const ultimoFim = Math.max(...parcs.map((p) => p.fim), ...moneys.map((x) => x.fim));
      const resto = linha.slice(ultimoFim).replace(RE_DATA, ' ').split(/\t+/).map((s) => s.trim()).filter(Boolean);
      let adm = '';
      const obs = [];
      resto.forEach((r) => {
        if (/oportunidade/i.test(r)) obs.push('Oportunidade');
        else if (!adm && /[a-z]/i.test(r)) adm = r;
        else if (r) obs.push(r);
      });
      if (!adm) { const sp = linha.slice(ultimoFim).replace(RE_DATA, ' ').replace(/oportunidade/i, '').trim(); adm = sp; }
      const c = novaCarta('uni', tipo, { adm: canonAdm(adm), credito, entrada, entradaParcelas, etapas, obs });
      if (cartaValida(c) && c.adm) cartas.push(c); else ignoradas.push(linha.trim());
    });
    return { cartas, ignoradas };
  }

  // Fraga e Bitello: blocos começando pelo código da cota; "Taxa Grátis" antes do código é da carta seguinte
  function lerFraga(texto, tipo, admPadrao) {
    const toks = String(texto).split(/[\t\n\r]+/).map((s) => s.trim()).filter(Boolean);
    const cartas = [], ignoradas = [];
    let atual = null, taxaGratis = false, moneys = [];
    const fechar = () => {
      if (!atual) return;
      atual.credito = moneys[0] || 0; atual.entrada = moneys[1] || 0;
      if (cartaValida(atual)) cartas.push(atual);
      else ignoradas.push('Cota ' + atual.codigo + ' (dados incompletos)');
      atual = null; moneys = [];
    };
    toks.forEach((t) => {
      if (/taxa\s*gr[aá]tis/i.test(t)) { if (atual && atual.etapas.length) fechar(); taxaGratis = true; return; }
      if (/^\d{4,7}$/.test(t)) {
        fechar();
        atual = novaCarta('fraga', tipo, { adm: admPadrao || 'HS Consórcios', codigo: t, obs: taxaGratis ? ['Taxa Grátis'] : [] });
        taxaGratis = false; return;
      }
      if (!atual) { if (/R\$/.test(t)) ignoradas.push(t); return; }
      // Valor em R$ depois das parcelas = começou outra carta sem código: fecha a anterior em vez de emendar
      if (atual.etapas.length && /R\$/.test(t) && !/\d\s*[xX]/.test(t)) {
        fechar();
        atual = novaCarta('fraga', tipo, { adm: admPadrao || 'HS Consórcios', codigo: '', obs: taxaGratis ? ['Taxa Grátis'] : [] });
        taxaGratis = false;
      }
      let m, achouParc = false; RE_PARC.lastIndex = 0;
      while ((m = RE_PARC.exec(t))) { atual.etapas.push({ n: parseInt(m[1], 10), v: parseBR(m[2]) }); achouParc = true; }
      if (achouParc) return;
      RE_MONEY.lastIndex = 0;
      while ((m = RE_MONEY.exec(t))) moneys.push(parseBR(m[1]));
    });
    fechar();
    return { cartas, ignoradas };
  }

  // Rafael Holanda (WhatsApp): cabeçalho "📄 *AUTOMÓVEL | MYCON*", depois Crédito / Entrada / faixas "1 à 24: R$ ..."
  function tipoDoCabecalho(t) {
    const s = semAcento(t);
    if (/imovel|imoveis|imobiliario/.test(s)) return 'imovel';
    if (/automovel|veiculo|moto|caminhao|pesado|maquina|carro|leve/.test(s)) return 'veiculo';
    return '';
  }
  function lerRafael(texto) {
    const cartas = [], ignoradas = [];
    let tipo = '', adm = '', atual = null, notasPendentes = [];
    const fechar = () => {
      if (!atual) return;
      if (cartaValida(atual) && atual.tipo && atual.adm) cartas.push(atual);
      else ignoradas.push('Carta de ' + formatBRL(atual.credito) + (atual.adm ? ' (' + atual.adm + ')' : '') + ' — dados incompletos');
      atual = null;
    };
    String(texto).split(/\r?\n/).forEach((bruta) => {
      const linha = bruta.trim();
      if (!linha) return;
      const limpa = linha.replace(/[*_]/g, '').trim();
      const cab = limpa.match(/^[^\w|]*([A-Za-zÀ-ú /]+?)\s*\|\s*([^|]+?)\s*[^\w\s]*$/);
      if (cab && tipoDoCabecalho(cab[1])) {
        fechar(); tipo = tipoDoCabecalho(cab[1]); adm = canonAdm(cab[2].replace(/[^\wÀ-ú/ .-]/g, ' ')); notasPendentes = []; return;
      }
      let m = limpa.match(/^(?:valor\s+(?:do\s+|da\s+)?)?(?:cr[ée]dito|carta)\b[^R\d]*(R\$\s*[\d.,]+)/i);
      if (m) {
        fechar();
        atual = novaCarta('rafael', tipo, { adm, credito: parseBR(m[1]), obs: notasPendentes.slice() });
        notasPendentes = []; return;
      }
      m = limpa.match(/^entrada\s*:?\s*(R\$\s*[\d.,]+)(.*)$/i);
      if (m && atual) {
        atual.entrada = parseBR(m[1]);
        let p; RE_PARC.lastIndex = 0;
        while ((p = RE_PARC.exec(m[2]))) atual.entradaParcelas.push({ n: parseInt(p[1], 10), v: parseBR(p[2]) });
        return;
      }
      if (/^prazo\s*\/?\s*parcela/i.test(limpa)) return;
      m = limpa.match(/^(\d{1,3})\s*(?:à|a|-|até|ao)\s*(\d{1,3})\s*:?\s*(R\$\s*[\d.,]+)/i);
      if (m && atual) {
        const ini = parseInt(m[1], 10), fim = parseInt(m[2], 10);
        const esperado = somaN(atual.etapas) + 1;
        // Faixa que não continua a anterior (ex.: "1 à 38" depois de "1 à 4") é de OUTRA carta
        // cuja linha "Crédito" não foi reconhecida — nunca emenda numa carta só.
        if (atual.etapas.length && ini !== esperado) {
          ignoradas.push('Faixa "' + limpa + '" não continua a carta de ' + formatBRL(atual.credito) + ' (deveria começar em ' + esperado + '). Parece ser de outra carta sem a linha "Crédito".');
          fechar(); return;
        }
        if (fim - ini + 1 > 0) atual.etapas.push({ n: fim - ini + 1, v: parseBR(m[3]) });
        return;
      }
      m = limpa.match(/^(\d{1,3})\s*[xX]\s*(?:de\s*)?(R\$\s*[\d.,]+)/);
      if (m && atual) { atual.etapas.push({ n: parseInt(m[1], 10), v: parseBR(m[2]) }); return; }
      // Linhas extras: taxa, vencimento, junção, cadastro, procuração...
      const nota = limpa.replace(/[📝🖋️✍️📌⚠️]/gu, '').trim();
      if (!nota) return;
      if (/taxa de transf|vencimento/i.test(nota)) { if (atual) atual.obs.push(nota); return; }
      const ehNegritoSozinho = /^\*[^*]+\*$/.test(linha);
      if (ehNegritoSozinho || !atual || !atual.etapas.length) notasPendentes.push(nota);
      else atual.obs.push(nota);
    });
    fechar();
    return { cartas, ignoradas };
  }

  function lerLista(fornecedor, texto, tipo, opcoes) {
    if (fornecedor === 'lume') return lerLume(texto, tipo);
    if (fornecedor === 'uni') return lerUni(texto, tipo);
    if (fornecedor === 'fraga') return lerFraga(texto, tipo, opcoes && opcoes.admPadrao);
    if (fornecedor === 'rafael') return lerRafael(texto);
    return { cartas: [], ignoradas: ['Fornecedor desconhecido'] };
  }

  // Rafael: cartas somam ao estoque, repetidas só renovam a data, e saem sozinhas após 7 dias
  function mesclarRafael(existentes, novas, agoraISO) {
    const mapa = new Map(existentes.map((c) => [assinatura(c), c]));
    let adicionadas = 0, renovadas = 0;
    novas.forEach((c) => {
      const k = assinatura(c);
      if (mapa.has(k)) { mapa.get(k).criadoEm = agoraISO; renovadas++; }
      else { mapa.set(k, Object.assign({}, c, { criadoEm: agoraISO })); adicionadas++; }
    });
    return { cartas: [...mapa.values()], adicionadas, renovadas };
  }
  function expirarRafael(cartas, agora) {
    const lim = (agora || Date.now()) - FORNECEDORES.rafael.validadeDias * 86400000;
    return cartas.filter((c) => c.fornecedor !== 'rafael' || !c.criadoEm || Date.parse(c.criadoEm) >= lim);
  }

  const Motor = {
    parseBR, formatBRL, formatPct, r2, pad2, semAcento,
    ADMS, ADM_CAIXA, canonAdm, logoAdm, FORNECEDORES, TIPOS,
    prazo, saldoDevedor, ehOportunidade, etapaMaiorPrazo, assinatura, calendario, faixas, cronograma, textoFaixas,
    SEGMENTOS, FAIXAS_LIMITES, TAXAS_PADRAO, TRANSFERENCIA_PCT, TETO_PCT, AGIO_ALFA_PCT,
    precoPadrao, precificacaoJairo, precificacaoAlfa, precificar, fundoReserva, taxaMensalLinear, tirMensal,
    avaliar, validarJuncao, OBJETIVOS, cartasDoSegmento, buscar, textoProposta, periodosCliente, textoPeriodo, textoEntradaParcelada,
    DIV_FAIXAS, SEG_COM_PROMO, PROMO_POR_SEGMENTO, segmentosDivulgacao, precoDivulgacao, itemDivulgacao, selecionarDivulgacao,
    lerLume, lerUni, lerFraga, lerRafael, lerLista, mesclarRafael, expirarRafael, cartaValida
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  else root.Motor = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
