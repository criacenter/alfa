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
    { nome: 'Rodobens', chaves: ['rodobens'], logo: 'assets/adm_logo_20.png' },
    { nome: 'Sicredi Consórcios', chaves: ['sicredi'], logo: 'assets/adm_logo_sicredi.png' },
    { nome: 'Zema Consórcio', chaves: ['zema'], logo: 'assets/adm_logo_zema.png' }
  ];
  const ADM_CAIXA = 'Caixa Consórcios';
  function canonAdm(txt) {
    // Junta letras soltas ("H S" → "hs", "B.B." → "bb") antes de procurar a administradora
    const t = ' ' + semAcento(txt).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\b([a-z])(?: ([a-z])\b)+/g, (m) => m.replace(/ /g, '')) + ' ';
    if (!t.trim()) return '';
    for (const a of ADMS) {
      for (const k of a.chaves) if (t.includes(' ' + k + ' ')) return a.nome;
    }
    // desconhecida: devolve o texto limpo (primeira letra maiúscula)
    return String(txt).replace(/[*_📄🚙🏠🏡]/g, '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Aceita também nomes salvos antes da administradora entrar no cadastro (ex.: "Zema" → Zema Consórcio)
  function logoAdm(nome) { const a = ADMS.find((x) => x.nome === nome) || ADMS.find((x) => x.nome === canonAdm(nome)); return a ? a.logo : ''; }

  /* ---------------- Fornecedores ---------------- */
  const FORNECEDORES = {
    lume: { nome: 'LuME', modo: 'substituir' },
    uni: { nome: 'UniContemplados', modo: 'substituir' },
    fraga: { nome: 'Fraga e Bitello', modo: 'substituir' },
    rafael: { nome: 'Rafael Holanda', art: 'do', modo: 'somar', semJuncao: true, validadeDias: 7 },
    lr: { nome: 'LR Contemplados', art: 'da', modo: 'somar', semJuncao: true, validadeDias: 7 }
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
  // Regra Alfa: entrada + ágio (7% por padrão; cada usuário pode ajustar o percentual na busca)
  function precificacaoAlfa(credito, entradaForn, params) {
    const pctAgio = params && params.agioPct != null && isFinite(params.agioPct) ? params.agioPct : AGIO_ALFA_PCT;
    const agio = credito * pctAgio / 100;
    return { regra: 'alfa', agioPct: pctAgio, acrescimo: agio, entradaFinal: entradaForn + agio,
      transferenciaAParte: credito * TRANSFERENCIA_PCT / 100 };
  }
  function precificar(credito, entradaForn, regra, params) {
    return regra === 'alfa' ? precificacaoAlfa(credito, entradaForn, params) : precificacaoJairo(credito, entradaForn, params);
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
      const solo = cotas.find((c) => FORNECEDORES[c.fornecedor] && FORNECEDORES[c.fornecedor].semJuncao);
      if (solo) return 'Cartas ' + (FORNECEDORES[solo.fornecedor].art || 'do') + ' ' + FORNECEDORES[solo.fornecedor].nome + ' nunca são combinadas — ofereça sozinha.';
      if (cotas.some(ehOportunidade) && !cotas.every(ehOportunidade)) return 'Carta Oportunidade só pode ser combinada com outra carta Oportunidade.';
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

  /* ---------------- O que cada administradora atende, por segmento ----------------
     st: S = aceita · R = aceita com restrição · N = não aceita · ? = a confirmar
     "A confirmar" entra na busca em leves, pesados, motos e imóveis (como sempre foi) e fica de fora
     em máquinas, implementos e solar (antes só Caixa). Fonte: comparativo de 13/11/2026 — o administrador ajusta na aba Administradoras. */
  const ST_ADM = { S: 'Aceita', R: 'Aceita com restrição', N: 'Não aceita', '?': 'A confirmar' };
  const SEG_ABERTO = { leves: true, pesados: true, motos: true, imoveis: true };
  const REP_BC = { 'Sicredi Consórcios': 33.04, 'HS Consórcios': 54.36, 'BB Consórcios': 71.63, 'Consórcio Servopa': 104.97,
    'Rodobens': 107.77, 'Consórcio Magalu': 117.69, 'Bradesco Consórcios': 144.91, 'Itaú Consórcio': 174.69, 'Mycon': 227.94,
    'Santander Consórcio': 233.03, 'Disal Consórcio': 236.63, 'Consórcio Embracon': 276.30, 'Caixa Consórcios': 344.19,
    'Consórcio Nacional Volkswagen': 368.23, 'CNP Consórcio': 409.80, 'Porto Bank': 468.21, 'Porto Bank VP': 468.21, 'Zema Consórcio': 1548.75 };
  const C = (st, nota) => ({ st, nota: nota || '' });
  const REGRAS_ADM_PADRAO = {
    'Bradesco Consórcios': { leves: C('S', 'Usado até 8 anos; valor FIPE ≥ saldo devedor'), pesados: C('S', 'Caminhão até 8 anos; ônibus só para CNPJ de turismo'), motos: C('S', 'Moto 600cc+ até 5 anos; 0 km a partir de 250cc'), implementos: C('R', 'Entra como equipamento rodoviário, sujeito à aprovação do bem pela adm'), maquinas: C('R', 'Fora agrícolas e tratores, só máquina nova e com aprovação da adm'), imoveis: C('S'), _geral: 'Não paga bem de empresa da qual o consorciado é sócio nem de parentes até 4º grau.' },
    'BB Consórcios': { leves: C('S', 'Usado até 12 anos; paga veículo de leilão sem chassi remarcado'), pesados: C('S', 'Caminhão, ônibus e semirreboque até 12 anos; vistoria obrigatória'), motos: C('S', 'Moto até 5 anos; saldo máximo R$ 50 mil por CPF/CNPJ'), implementos: C('S', 'Semirreboque até 12 anos; implemento usado só se integrado ao caminhão'), maquinas: C('S', 'Escavadeira e retro usadas até 12 anos; vistoria e auditoria acima de R$ 300 mil'), solar: C('R', 'Só equipamento novo, de fornecedor PJ com nota fiscal; o regulamento proíbe cessão de cotas de energia renovável'), imoveis: C('S', 'Urbano ou rural com matrícula; construção e reforma com projeto de engenheiro'), _geral: 'Transferência para PF não exige conta no BB.' },
    'Caixa Consórcios': { leves: C('S', 'Usado até 5 anos (8 anos para adesões desde 08/2021)'), pesados: C('S'), motos: C('S'), maquinas: C('S', 'Carta de Veículo Caixa'), implementos: C('S', 'Carta de Veículo Caixa'), solar: C('S', 'Carta de Veículo Caixa'), imoveis: C('S') },
    'CNP Consórcio': { leves: C('S', 'Grupos antigos da Caixa'), imoveis: C('S', 'Grupos antigos da Caixa') },
    'Consórcio Embracon': { leves: C('S'), pesados: C('S', 'Caminhões, ônibus e máquinas agrícolas'), motos: C('S'), implementos: C('S', 'Carreta, reboque, semirreboque, baú e tanque'), maquinas: C('R', 'Escavadeira e retroescavadeira citadas; outras máquinas de obra a confirmar'), solar: C('?', 'Não aparece nas páginas oficiais'), imoveis: C('S') },
    'Consórcio Magalu': { leves: C('S', 'Usado até 10 anos; paga pelo valor do crédito'), pesados: C('S', 'Caminhão até 20 anos'), motos: C('S', 'Moto até 10 anos, sem limite de cilindrada'), maquinas: C('?', 'Grupo de pesados cita tratores e maquinário agrícola; linha amarela não citada'), solar: C('S', 'Parceria SolarPrime; créditos de R$ 5 mil a 260 mil'), imoveis: C('S') },
    'Consórcio Nacional Volkswagen': { leves: C('S', 'Usado até 10 anos (2013+); valor > saldo devedor (o regulamento antigo fala em 5 anos — confirmar)'), pesados: C('S', 'Caminhão até 10 anos (2013+)'), motos: C('R', 'Moto só 0 km'), implementos: C('R', 'Implemento entra junto com o caminhão (percentual da tabela)'), maquinas: C('N', 'Regulamento só prevê veículos'), solar: C('N', 'Regulamento só prevê veículos'), imoveis: C('N', 'Regulamento só prevê veículos'), },
    'Consórcio Randon': { leves: C('S', 'Consórcio de veículos (Rands)'), pesados: C('S'), implementos: C('S', 'Foco da casa; R$ 100–500 mil; implementos Randon novos ou usados'), maquinas: C('?', 'Só máquinas agrícolas no portfólio'), imoveis: C('S', 'Via Racon (mesmo grupo)') },
    'Consórcio Servopa': { leves: C('S', 'Novos e seminovos'), pesados: C('S'), motos: C('S'), maquinas: C('?', 'Só máquinas agrícolas citadas'), imoveis: C('S') },
    'Disal Consórcio': { leves: C('S'), pesados: C('N'), motos: C('N'), maquinas: C('N'), implementos: C('N'), solar: C('N'), imoveis: C('S', 'Guia próprio de imóveis') },
    'HS Consórcios': { leves: C('S', 'Usado até 10 anos (15 com avalista)'), pesados: C('S', 'Caminhão até 15 anos'), motos: C('S', 'Moto até 10 anos'), maquinas: C('?', 'Só trator até 5 anos (cartas INPC/IPCA); escavadeira não informada'), solar: C('S', 'O próprio equipamento fica de garantia'), imoveis: C('S') },
    'Itaú Consórcio': { leves: C('S', 'Usado até 15 anos (PF) / 8 (PJ); gestão 100% digital'), pesados: C('S', 'Caminhão até 8 anos; ônibus e vans até 5'), motos: C('R', '150cc+ até 1 ano; 250cc+ até 3 anos'), maquinas: C('N', 'Escavadeira não aceita; só trator até 2 anos'), implementos: C('S', 'Baú, basculante, frigorífico; usado até 6 anos'), solar: C('N', 'Não consta nos bens aceitos'), imoveis: C('S', 'Compra, terreno, construção, reforma e quitação de financiamento') },
    'Mycon': { leves: C('S', 'Usado até 10 anos; paga pelo valor do crédito; fora da regra se o bem vale 2× o saldo'), pesados: C('S', 'Caminhão e ônibus até 10 anos'), motos: C('S', 'Moto até 3 anos'), implementos: C('S', 'Implemento rodoviário até 10 anos'), imoveis: C('S') },
    'Porto Bank': { leves: C('S', 'Usado até 8 anos'), pesados: C('N', 'Grupos comuns não aceitam pesados (só grupos VP)'), maquinas: C('N'), implementos: C('N'), solar: C('S', 'Placa solar entre os bens aceitos'), imoveis: C('S') },
    'Porto Bank VP': { leves: C('S', 'Usado até 8 anos'), pesados: C('S', 'VP11 até 10 anos / VP10 até 6 anos'), maquinas: C('R', 'Máquina até 2 anos, só de revenda ou distribuidor. Garantia obrigatória (substitutiva): caminhão, implemento, ônibus ou automóvel seu, até 6 anos, valendo pelo menos o saldo devedor'), implementos: C('S', 'Semirreboques: VP11 até 10 anos / VP10 até 6') },
    'Racon Consórcios': { leves: C('S', 'Mesmo grupo Rands'), pesados: C('S', 'Mesmo grupo Rands'), implementos: C('S', 'Mesmo grupo Rands (foco em implementos)'), maquinas: C('?', 'Só máquinas agrícolas no portfólio'), imoveis: C('S', 'Grupos imobiliários de alto valor (até R$ 1 mi)') },
    'Rodobens': { leves: C('S', 'Usado até 7 anos'), pesados: C('S', 'Caminhão até 7 anos; ônibus até 5'), motos: C('R', 'Moto só 0 km'), maquinas: C('N', 'Trator só 0 km'), solar: C('?', 'Indício: energia renovável — confirmar'), imoveis: C('S') },
    'Santander Consórcio': { leves: C('S', 'Usado até 9 anos; análise automática em 48 h'), pesados: C('S', 'Caminhão até 10 anos; análise automática em 48 h'), motos: C('S', 'Moto 300cc+ até 5 anos'), maquinas: C('R', 'Linha amarela até 7 anos; cotas desde 11/2025 exigem garantia extra (veículo até 10 anos)'), implementos: C('S', 'Carreta, reboque, bitrem, rodotrem; vistoria obrigatória'), solar: C('R', 'Só equipamento novo; orçamento completo do integrador; pode exigir veículo quitado como garantia complementar'), imoveis: C('S'), _geral: 'Não aceita bem de leilão nem de empresa da qual o consorciado foi sócio nos últimos 12 meses.' },
    'Serello Consórcios': { leves: C('S'), imoveis: C('S', 'Compra (inclusive na planta), construção, reforma e quitação') },
    'Sicredi Consórcios': { leves: C('S', 'Usado até 10 anos'), pesados: C('S', 'Caminhão até 10 anos; paga até 10% acima da FIPE'), motos: C('S', 'Moto até 10 anos'), maquinas: C('S', 'Retroescavadeira até 10 anos'), implementos: C('S', 'Até 10% acima da FIPE'), solar: C('S', 'Linha própria Sustentável: painel, gerador, aquecedor; cliente escolhe o fornecedor'), imoveis: C('S') },
    'Sponchiado Consórcios': { leves: C('S'), pesados: C('S', 'Caminhões'), motos: C('S'), maquinas: C('?', 'Só máquinas agrícolas citadas'), imoveis: C('S') },
    'Zema Consórcio': { leves: C('S', 'Usado até 10 anos'), pesados: C('S', 'Caminhão até 15 anos'), motos: C('S', 'Moto até 10 anos'), maquinas: C('?', 'Só máquinas agrícolas citadas'), imoveis: C('S', 'Inclui reforma') }
  };
  // O que cada administradora exige do comprador da carta (PF, PJ e cessão). Fonte: regulamentos e guias oficiais, 13/11/2026.
  const EXIG_PADRAO = {"BB Consórcios": {"pf": "Renda bruta de pelo menos 3× a soma das parcelas de consórcio (já contratadas + a contratar). Sem Serasa a partir de R$ 1.000, cheque sem fundo ou CADIN. Idade de 18 a 79 anos.", "pj": "Faturamento mensal médio de pelo menos 10× as parcelas. PJ precisa de conta no BB há mais de 12 meses; empresa com menos de 12 meses precisa de limite de crédito e risco A, B ou C.", "cessao": "ATENÇÃO: o manual de parceiros do BB (07/2024) só permite cessão de cotas com menos de 180 dias, sem bem entregue, entre empresas do mesmo grupo, sócios, parentes e cônjuges — confirme com o fornecedor antes de fechar. Taxa: 1% do valor do bem (mínimo R$ 600). O comprador passa pelos mesmos critérios de renda. Acima do limite, dá para pedir flexibilização (autos, motos e caminhões), decidida pela BB Consórcios. Fiador é exigido se a renda não fechar; é dispensado se o saldo devedor for menor que 25% do bem."}, "Bradesco Consórcios": {"pf": "RG, CPF, comprovante de renda (holerite, IR ou pró-labore) e endereço de até 30 dias. Correntista não precisa levar documentos pessoais. Regra de renda não publicada.", "pj": "Contrato social, RG e CPF dos sócios, cartão CNPJ, faturamento dos últimos 12 meses, IR e endereço de até 30 dias.", "cessao": "1% do saldo devedor, mais registro das garantias e consulta cadastral. Só transfere depois de aprovar o cadastro do comprador. Análise em até 1 dia útil."}, "Caixa Consórcios": {"pf": "RG, CPF, estado civil, endereço de até 90 dias e renda (2 últimos holerites ou IR; autônomo: IR + 3 extratos). Avalia comprometimento de renda sem percentual publicado. Resultado: aprovado, reprovado ou com fiador; vale 90 dias.", "pj": "Contrato social com alterações, certidão simplificada da Junta, endereço da empresa de até 90 dias (MEI pode ser do titular) e faturamento (balanço + DRE + balancete, ou declaração do Simples).", "cessao": "Regras de cessão não publicadas."}, "Consórcio Embracon": {"pf": "Documentos com selfie e comprovante de renda. Devedor solidário, quando pedido, precisa de renda de 3× a parcela. Em cota não contemplada, as parcelas não podem passar de 30% da renda.", "pj": "Contrato social, Simples dos últimos 12 meses (ou ECF + balanço + DRE) e balancete semestral assinado pelo contador. Todos os sócios entregam documentos de PF (IR e 3 extratos). Transportadora: contrato de agregamento ou lista da frota.", "cessao": "Cerca de 1% da carta de crédito, cobrado do vendedor. Em cota contemplada pode exigir avalista ou imóvel em garantia. Assinatura na sede. Análise em 1 a 2 dias úteis."}, "Consórcio Magalu": {"pf": "Regra de renda não publicada.", "pj": "Cartão CNPJ, inscrição estadual ou municipal, contrato social, RG/CPF de todos os sócios e cônjuges, certidão de estado civil dos sócios, endereço (se alugado, também o do proprietário), ficha cadastral e renda pelo Simples ou ECF; pode pedir 3 extratos. Fiador ou coobrigado podem ser exigidos.", "cessao": "Análise em até 10 dias úteis; o cadastro vale 90 dias. Taxa de cessão não publicada."}, "Consórcio Nacional Volkswagen": {"pf": "Capacidade financeira compatível com o grupo (sem percentual publicado).", "pj": "Não publicado.", "cessao": "Exige aprovação da adm, cota em dia e taxa de cessão (valor não divulgado)."}, "HS Consórcios": {"pf": "Renda líquida de pelo menos 3× a prestação. O cônjuge também não pode ter restrição.", "pj": "Regras específicas não publicadas.", "cessao": "Exige anuência da adm e aprovação das garantias do comprador; taxa de transferência sem valor publicado. Garantia complementar (fiador, avalista, devedor solidário) — cônjuge não pode ser fiador. Análise das garantias em até 15 dias úteis."}, "Itaú Consórcio": {"pf": "Analisa a capacidade de pagamento sem percentual publicado. Resposta em até 10 dias úteis.", "pj": "Não diferencia PF e PJ no contrato.", "cessao": "Análise de crédito prévia do comprador e tarifa da tabela de tarifas do Itaú. Pode pedir aval, fiança ou devedor solidário."}, "Mycon": {"pf": "Comprador com renda líquida de 3× a parcela (somando outras cotas Mycon) e sem restrição. Renda por holerite, carteira, IR, DECORE, carta do empregador ou 3 extratos.", "pj": "Não publicado.", "cessao": "Taxa de análise de R$ 290 (não devolvida se reprovar). Transferência: 1% do crédito (móveis e serviços) ou 0,5% (imóveis). Análise em até 5 dias úteis."}, "Porto Bank": {"pf": "RG ou CNH. Renda: IR com recibo + holerite (CLT) ou DECORE (autônomo, liberal, produtor rural); extrato bancário não consta na lista. A Porto não publica quanto da renda a parcela pode comprometer; análise em 3 dias úteis, vale 3 meses. Pode exigir garantia complementar ou avalista.", "pj": "Cartão CNPJ e contrato social. PJ não pode comprar bem de sócios, de empresas coligadas nem de cônjuges.", "cessao": "1% do crédito atual (cota contemplada) e aprovação do crédito do comprador."}, "Porto Bank VP": {"pf": "RG ou CNH. Renda: IR com recibo + holerite (CLT) ou DECORE (autônomo, liberal, produtor rural); extrato bancário não consta na lista. A Porto não publica quanto da renda a parcela pode comprometer; análise em 3 dias úteis, vale 3 meses. Pode exigir garantia complementar.", "pj": "Cartão CNPJ e contrato social. PJ não pode comprar bem de sócios, de empresas coligadas nem de cônjuges.", "cessao": "1% do valor do crédito (cota contemplada) e anuência prévia da adm."}, "Rodobens": {"pf": "Identidade, endereço e renda (holerite, extratos ou IR). Regra de renda não publicada.", "pj": "Não publicado.", "cessao": "Não publicado."}, "Santander Consórcio": {"pf": "Renda de 3× a prestação. Análise automática em até 48 h, vale 60 dias. Não correntista: firma reconhecida em cartório e cadastro na agência.", "pj": "As parcelas de todas as cotas da empresa não podem passar de 3% do faturamento mensal. Contrato social, IR PJ, faturamento de 12 meses com firma do contador e um sócio como devedor solidário (exceto ME, EPP, MEI e S.A.). Pagamento só em conta do CNPJ.", "cessao": "Taxa da tabela de tarifas, paga antes da análise dos documentos. Cota quitada dispensa análise de crédito. Termo com firma reconhecida e selfies de vendedor e comprador; conclui em até 3 dias úteis."}, "Consórcio Servopa": {"pf": "Renda de 3× a prestação (somando as cotas já contempladas) e consulta SPC/Serasa. Análise em 3 dias úteis.", "pj": "Contrato social, último balanço e DRE, certidão simplificada da Junta (até 30 dias) e fiador com renda compatível.", "cessao": "1% para cota contemplada e 0,5% para não contemplada, com aprovação do cadastro do comprador e transferência das garantias."}, "Disal Consórcio": {"pf": "Identidade, endereço e renda, enviados pela plataforma Cred+ (liberada em até 7 dias após a contemplação). Regra de renda não publicada.", "pj": "Não publicado.", "cessao": "Não publicado."}, "Sicredi Consórcios": {"pf": "O comprador precisa ser associado (abrir conta na cooperativa). Regra de renda não publicada.", "pj": "Também precisa ser associada.", "cessao": "Não publicado."}};
  const CAMPOS_EXIG = { _pf: 'pf', _pj: 'pj', _cessao: 'cessao' };
  // Junta o padrão com o que o administrador salvou (salvo ganha). Devolve { adm: { seg: {st, nota}, _geral } }
  function regrasAdm(salvas) {
    const out = {};
    const nomes = new Set([...ADMS.map((a) => a.nome), ...Object.keys(salvas || {})]);
    nomes.forEach((adm) => {
      const p = REGRAS_ADM_PADRAO[adm] || {}, sv = (salvas || {})[adm] || {};
      const r = { _geral: sv._geral != null ? sv._geral : (p._geral || '') };
      const ex = EXIG_PADRAO[adm] || {};
      Object.keys(CAMPOS_EXIG).forEach((k) => { r[k] = sv[k] ? sv[k] : (ex[CAMPOS_EXIG[k]] || ''); });
      Object.keys(SEGMENTOS).forEach((seg) => {
        // Célula salva como "a confirmar" sem nota não apaga uma confirmação que veio depois no padrão
        const salvo = sv[seg], padrao = p[seg];
        const x = (salvo && !(salvo.st === '?' && !salvo.nota && padrao && padrao.st !== '?')) ? salvo : (padrao || C('?'));
        r[seg] = { st: ST_ADM[x.st] ? x.st : '?', nota: x.nota || '' };
      });
      out[adm] = r;
    });
    return out;
  }
  function regraAdmSeg(regras, adm, seg) {
    const r = regras && regras[adm];
    return (r && r[seg]) || { st: '?', nota: '' };
  }
  function admAtende(regras, adm, seg) {
    if (!regras) { const s = SEGMENTOS[seg]; return !s || !s.adm || adm === s.adm; } // sem regras: comportamento antigo
    const st = regraAdmSeg(regras, adm, seg).st;
    return st === 'S' || st === 'R' || (st === '?' && !!SEG_ABERTO[seg]);
  }

  function cartasDoSegmento(base, segmento, regras) {
    const s = SEGMENTOS[segmento];
    if (!s) return [];
    return base.filter((c) => c.tipo === s.tipo && admAtende(regras, c.adm, segmento) && c.credito > 0 && (c.etapas || []).length);
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
    const elegiveis = cartasDoSegmento(base, q.segmento, q.regrasAdm);
    const grupos = {};
    elegiveis.forEach((c) => {
      const semJ = FORNECEDORES[c.fornecedor] && FORNECEDORES[c.fornecedor].semJuncao;
      // Oportunidade só junta com Oportunidade: ficam num grupo separado
      const chave = semJ ? 'solo|' + (c.id || assinatura(c)) : c.fornecedor + '|' + c.adm + '|' + (ehOportunidade(c) ? 'op' : 'n');
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

  // Posição de cada administradora no ranking de cada segmento (comparativo de 13/11/2026, revisado às 17h; 1 = melhor).
  // Motos usa o ranking de veículos leves; máquinas = linha amarela.
  const RANK_ADM = {"leves": {"HS Consórcios": 1, "BB Consórcios": 2, "Consórcio Magalu": 3, "Sicredi Consórcios": 4, "Itaú Consórcio": 5, "Mycon": 6, "Rodobens": 7, "Santander Consórcio": 8, "Consórcio Servopa": 9, "Disal Consórcio": 10, "Bradesco Consórcios": 11, "Consórcio Nacional Volkswagen": 12, "Consórcio Randon": 13, "Racon Consórcios": 14, "Serello Consórcios": 15, "Sponchiado Consórcios": 16, "Consórcio Embracon": 17, "Zema Consórcio": 18, "Caixa Consórcios": 19, "CNP Consórcio": 20, "Porto Bank": 21, "Porto Bank VP": 22}, "pesados": {"HS Consórcios": 1, "BB Consórcios": 2, "Consórcio Magalu": 3, "Sicredi Consórcios": 4, "Mycon": 5, "Santander Consórcio": 6, "Rodobens": 7, "Itaú Consórcio": 8, "Consórcio Servopa": 9, "Consórcio Nacional Volkswagen": 10, "Consórcio Randon": 11, "Racon Consórcios": 12, "Sponchiado Consórcios": 13, "Bradesco Consórcios": 14, "Consórcio Embracon": 15, "Zema Consórcio": 16, "Caixa Consórcios": 17, "Porto Bank VP": 18}, "implementos": {"BB Consórcios": 1, "Sicredi Consórcios": 2, "Mycon": 3, "Santander Consórcio": 4, "Itaú Consórcio": 5, "Consórcio Randon": 6, "Racon Consórcios": 7, "Caixa Consórcios": 8, "Bradesco Consórcios": 9, "Consórcio Embracon": 10, "Porto Bank VP": 11, "Consórcio Nacional Volkswagen": 12}, "solar": {"HS Consórcios": 1, "Sicredi Consórcios": 2, "Consórcio Magalu": 3, "BB Consórcios": 4, "Caixa Consórcios": 5, "Rodobens": 6, "Santander Consórcio": 7, "Porto Bank": 8}, "maquinas": {"BB Consórcios": 1, "Sicredi Consórcios": 2, "Caixa Consórcios": 3, "Santander Consórcio": 4, "Consórcio Embracon": 5, "Bradesco Consórcios": 6, "Porto Bank VP": 7}, "imoveis": {"HS Consórcios": 1, "Sicredi Consórcios": 2, "BB Consórcios": 3, "Rodobens": 4, "Itaú Consórcio": 5, "Consórcio Servopa": 6, "Consórcio Magalu": 7, "Mycon": 8, "Serello Consórcios": 9, "Bradesco Consórcios": 10, "Santander Consórcio": 11, "Sponchiado Consórcios": 12, "Consórcio Randon": 13, "Racon Consórcios": 14, "Consórcio Embracon": 15, "Caixa Consórcios": 16, "Porto Bank": 17, "Zema Consórcio": 18, "CNP Consórcio": 19}, "motos": {"HS Consórcios": 1, "BB Consórcios": 2, "Consórcio Magalu": 3, "Sicredi Consórcios": 4, "Itaú Consórcio": 5, "Mycon": 6, "Rodobens": 7, "Santander Consórcio": 8, "Consórcio Servopa": 9, "Disal Consórcio": 10, "Bradesco Consórcios": 11, "Consórcio Nacional Volkswagen": 12, "Consórcio Randon": 13, "Racon Consórcios": 14, "Serello Consórcios": 15, "Sponchiado Consórcios": 16, "Consórcio Embracon": 17, "Zema Consórcio": 18, "Caixa Consórcios": 19, "CNP Consórcio": 20, "Porto Bank": 21, "Porto Bank VP": 22}};
  const ORDEM_DESEMPATE = ['leves', 'motos', 'pesados', 'imoveis', 'implementos', 'solar', 'maquinas'];
  function posicaoRanking(adm, seg) { const r = RANK_ADM[seg] || {}; return r[adm] || 99; }
  // Todos os segmentos em que a carta cabe (faixa de crédito + administradora que atende o segmento)
  function segmentosPossiveis(c, regras) {
    return DIV_FAIXAS.filter((f) => c.tipo === f.tipo && c.credito >= f.min && c.credito <= f.max
      && (regras ? admAtende(regras, c.adm, f.seg) : (!f.adm || c.adm === f.adm))).map((f) => f.seg);
  }
  // Curadoria: a carta vai para um segmento só — onde a administradora está melhor ranqueada
  function melhorSegmento(adm, segs) {
    return segs.slice().sort((a, b) => (posicaoRanking(adm, a) - posicaoRanking(adm, b)) || (ORDEM_DESEMPATE.indexOf(a) - ORDEM_DESEMPATE.indexOf(b)))[0];
  }
  function segmentosDivulgacao(c, regras) {
    const segs = segmentosPossiveis(c, regras);
    return segs.length ? [melhorSegmento(c.adm, segs)] : [];
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
      parcelaMax: Math.max(0, ...(c.etapas || []).map((e) => e.v)),
      pctParcela: Math.max(0, ...(c.etapas || []).map((e) => e.v)) / c.credito * 100,
      entradaParcelas: c.entradaParcelas || [], entradaTotal: pr.res.entradaFinal + somaNV(c.entradaParcelas), vencimento: c.vencimento || '',
      taxaMensal: taxaMensalLinear(c.credito, pr.res.entradaFinal, saldoDevedor(c) + somaNV(c.entradaParcelas), pz),
      fundoReserva: fundoReserva(c.credito)
    };
  }
  // Segmento da arte para uma Oportunidade fora das faixas (todas as Oportunidades são divulgadas)
  function segmentoPadrao(c, regras) {
    if (c.tipo === 'imovel') return 'imoveis';
    if (c.credito <= 55000) return 'motos';
    if (c.credito <= 165000) return 'leves';
    const fazMaquinas = regras ? admAtende(regras, c.adm, 'maquinas') : c.adm === ADM_CAIXA;
    if (c.credito <= 235000 || !fazMaquinas) return 'pesados';
    return 'maquinas';
  }
  // Parcela máxima da divulgação, em % do crédito (a maior parcela da carta tem de caber)
  const PARCELA_PCT_PADRAO = { motos: 2.5, solar: 2.5, leves: 2.5, implementos: 2.5, pesados: 2.5, maquinas: 2.5, imoveis: 1.0 };
  function selecionarDivulgacao(base, opcoes) {
    const tetoParc = Object.assign({}, PARCELA_PCT_PADRAO, (opcoes && opcoes.parcelaPct) || {});
    const porSeg = {};
    let foraParcela = 0;
    // Diagnóstico: por segmento, quantas cartas estavam na faixa e qual regra tirou cada uma
    const diag = {};
    const d = (seg) => (diag[seg] = diag[seg] || { naFaixa: 0, foraEntrada: 0, foraParcela: 0, entram: 0, entradaMin: Infinity });
    let semFaixa = 0;
    const fora = {};
    const oportunidades = [];
    const regras = opcoes && opcoes.regrasAdm;
    const realocadas = {};
    base.forEach((c) => {
      const segs = segmentosDivulgacao(c, regras);
      const possiveis = segmentosPossiveis(c, regras);
      if (possiveis.length > 1) possiveis.filter((x) => x !== segs[0]).forEach((x) => { const k = x + '>' + segs[0]; realocadas[k] = (realocadas[k] || 0) + 1; });
      if (ehOportunidade(c)) {
        // Oportunidade: todas entram, uma arte só (no segmento escolhido pela curadoria)
        oportunidades.push(itemDivulgacao(c, segs.length ? segs[0] : segmentoPadrao(c, regras)));
        return;
      }
      if (!segs.length) {
        semFaixa++;
        // onde estão as cartas fora das faixas (e quantas teriam entrada abaixo de 35%)
        const lim = c.tipo === 'imovel' ? [[0, 200000], [200000, 350000], [1000000, Infinity]] : [[0, 40000], [40000, 70000], [150000, 180000], [220000, 250000], [250000, 350000], [350000, Infinity]];
        const b = lim.find((x) => c.credito > x[0] && c.credito <= x[1]) || [0, 0];
        const k = c.tipo + '|' + b[0] + '|' + b[1];
        const segRef = c.tipo === 'imovel' ? 'imoveis' : (c.credito <= 70000 ? 'motos' : (c.credito <= 250000 ? 'pesados' : 'maquinas'));
        const it = itemDivulgacao(c, segRef);
        const g = (fora[k] = fora[k] || { tipo: c.tipo, min: b[0], max: b[1], total: 0, entrada35: 0, ambos: 0 });
        g.total++;
        if (it.pctEntrada < TETO_PCT) { g.entrada35++; if (it.pctParcela <= 2.5 + 1e-9 || (c.tipo === 'imovel' && it.pctParcela <= 1 + 1e-9)) g.ambos++; }
      }
      segs.forEach((seg) => {
        const it = itemDivulgacao(c, seg);
        const g = d(seg); g.naFaixa++; g.entradaMin = Math.min(g.entradaMin, it.pctEntrada);
        if (it.pctEntrada >= TETO_PCT) { g.foraEntrada++; return; }
        if (tetoParc[seg] > 0 && it.pctParcela > tetoParc[seg] + 1e-9) { foraParcela++; g.foraParcela++; return; }
        g.entram++;
        (porSeg[seg] = porSeg[seg] || []).push(it);
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
    return { segmentos: out, oportunidades, foraParcela, tetoParc, diag, semFaixa, realocadas, fora: Object.values(fora).sort((a, b) => (a.tipo > b.tipo ? -1 : a.tipo < b.tipo ? 1 : a.min - b.min)) };
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
      const dt = linha.match(RE_DATA);
      const c = novaCarta('uni', tipo, { adm: canonAdm(adm), credito, entrada, entradaParcelas, etapas, obs, vencimento: dt ? dt[0] : '' });
      if (cartaValida(c) && c.adm) cartas.push(c); else ignoradas.push(linha.trim());
    });
    return { cartas, ignoradas };
  }

  // Fraga e Bitello (página nova, nov/2026): blocos com rótulo e valor em linhas seguidas:
  // Administradora / Bradesco / Categoria / Imóvel / Nº / 14704 / Crédito / R$ ... / Entrada / R$ ... / (33%) /
  // Saldo Devedor / ... / Comissão / ... / Parcela / 153X de R$ 1.044,00 / TX / 1,56% / [Tempo de Parcelas / 1 à 133: R$ ...]
  function lerFragaRotulos(texto, tipoPadrao) {
    const linhas = String(texto).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const cartas = [], ignoradas = [];
    let atual = null, esperando = '', emFaixas = false, faixasTempo = [];
    const fechar = () => {
      if (!atual) return;
      if (faixasTempo.length) atual.etapas = faixasTempo;
      if (!atual.tipo) atual.tipo = tipoPadrao;
      if (cartaValida(atual) && atual.adm) cartas.push(atual);
      else ignoradas.push('Cota ' + (atual.codigo || '?') + ' (' + (atual.adm || 'sem administradora') + ') — dados incompletos');
      atual = null; faixasTempo = []; emFaixas = false;
    };
    const ROTULOS = { 'administradora': 'adm', 'categoria': 'cat', 'nº': 'cod', 'no': 'cod', 'n°': 'cod', 'crédito': 'cred', 'credito': 'cred',
      'entrada': 'ent', 'saldo devedor': 'skip', 'comissão': 'skip', 'comissao': 'skip', 'parcela': 'parc', 'parcelas': 'parc', 'tx': 'skip', 'taxa': 'skip' };
    linhas.forEach((l) => {
      const chave = l.toLowerCase().replace(/:$/, '');
      if (chave === 'administradora') { fechar(); atual = novaCarta('fraga', '', {}); esperando = 'adm'; return; }
      if (/^n[ãa]o h[áa] mais itens/i.test(l)) return;
      if (!atual) { if (/R\$/.test(l)) ignoradas.push(l); return; }
      if (/^tempo de parcelas/i.test(l)) { emFaixas = true; esperando = ''; return; }
      if (ROTULOS[chave]) { esperando = ROTULOS[chave]; emFaixas = false; return; }
      if (emFaixas) {
        const f = l.match(/^(\d{1,3})\s*(?:à|a|-|até|ao)\s*(\d{1,3})\s*:?\s*(R\$\s*[\d.,]+)/i);
        if (f) { const n = parseInt(f[2], 10) - parseInt(f[1], 10) + 1; if (n > 0) faixasTempo.push({ n, v: parseBR(f[3]) }); }
        return;
      }
      if (!esperando) return;
      const v = l; const tipo = esperando; esperando = '';
      if (tipo === 'adm') atual.adm = canonAdm(v);
      else if (tipo === 'cat') atual.tipo = tipoDoCabecalho(v) || '';
      else if (tipo === 'cod') atual.codigo = v.replace(/\D/g, '');
      else if (tipo === 'cred') atual.credito = parseBR(v);
      else if (tipo === 'ent') {
        const mm = v.match(/R\$\s*[\d.,]+/); atual.entrada = mm ? parseBR(mm[0]) : 0;
        let p; RE_PARC.lastIndex = 0;
        const resto = mm ? v.slice(v.indexOf(mm[0]) + mm[0].length) : '';
        while ((p = RE_PARC.exec(resto))) atual.entradaParcelas.push({ n: parseInt(p[1], 10), v: parseBR(p[2]) });
        if (atual.entradaParcelas.length) atual.obs.push('Oportunidade');
      } else if (tipo === 'parc') {
        let p; RE_PARC.lastIndex = 0;
        while ((p = RE_PARC.exec(v))) atual.etapas.push({ n: parseInt(p[1], 10), v: parseBR(p[2]) });
      }
    });
    fechar();
    return { cartas, ignoradas };
  }

  // Fraga e Bitello (formato antigo): blocos começando pelo código da cota; "Taxa Grátis" antes do código é da carta seguinte
  function lerFraga(texto, tipo, admPadrao) {
    if (/^\s*Administradora\s*$/mi.test(texto) && /^\s*Cr[ée]dito\s*$/mi.test(texto)) return lerFragaRotulos(texto, tipo);
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
    if (/automove|veiculo|moto|caminh|pesado|maquina|carro|leve/.test(s)) return 'veiculo';
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
      if (/taxa de transf|vencimento/i.test(nota)) {
        if (atual) { atual.obs.push(nota); const dv = nota.match(RE_DATA); if (dv && /vencimento/i.test(nota)) atual.vencimento = dv[0]; }
        return;
      }
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
    if (fornecedor === 'lr') return lerLR(texto);
    return { cartas: [], ignoradas: ['Fornecedor desconhecido'] };
  }

  // LR Contemplados (WhatsApp): linha da administradora ("🔴 MYCON"), linha do tipo ("🚘 AUTOMÓVEIS"),
  // depois cada carta: "1️⃣ CRÉDITO: R$ ..." / "💰 ENTRADA: R$ ..." / "📄 PARCELAS: 27x R$ ... + 24x R$ ..."
  function lerLR(texto) {
    const cartas = [], ignoradas = [];
    let tipo = '', adm = '', atual = null, anterior = '';
    const conhecida = (txt) => { const a = canonAdm(txt); return ADMS.some((x) => x.nome === a) ? a : ''; };
    const fechar = () => {
      if (!atual) return;
      if (cartaValida(atual) && atual.tipo && atual.adm) cartas.push(atual);
      else ignoradas.push('Carta de ' + formatBRL(atual.credito) + (atual.adm ? ' (' + atual.adm + ')' : '') + (atual.tipo ? '' : ' — sem tipo (automóvel/imóvel)') + ' — confira os dados');
      atual = null;
    };
    // Formato em linha única ("Crédito: … 💰 Entrada: … 📄 Saldo: …"): quebra em linhas antes de ler
    const linhas = [];
    String(texto).split(/\r?\n/).forEach((l) => {
      if (/cr[ée]dito\s*:?\s*R\$/i.test(l) && /(entrada|saldo|parcelas?)\s*:/i.test(l)) l.split(/(?=\b(?:entrada|saldo|parcelas?)\s*:)/i).forEach((x) => linhas.push(x));
      else linhas.push(l);
    });
    linhas.forEach((bruta) => {
      const linha = bruta.trim();
      if (!linha) return;
      const limpa = linha.replace(/[^\p{L}\p{N}\s$:.,+\-–/|]/gu, ' ').replace(/\s+/g, ' ').trim();
      // Cabeçalho com administradora e tipo na mesma linha ("🚘🚗 MYCON CONTEMPLADAS – COTAS PRÓPRIAS")
      if (!/R\$/.test(limpa) && /contemplad/i.test(limpa)) {
        const a = canonAdm(limpa); const ac = ADMS.some((x) => x.nome === a) ? a : '';
        const t = tipoDoCabecalho(limpa) || (/[🏠🏡🏢🏘]/u.test(linha) ? 'imovel' : /[🚘🚗🚖🚙🏍🛵🚚🚛🚜]/u.test(linha) ? 'veiculo' : '');
        if (ac || t) { fechar(); if (ac) adm = ac; if (t) tipo = t; anterior = ''; return; }
      }
      let m = limpa.match(/cr[ée]dito\s*:?\s*(R\$\s*[\d.,]+)/i);
      if (m) { fechar(); atual = novaCarta('lr', tipo, { adm, credito: parseBR(m[1]) }); anterior = ''; return; }
      m = limpa.match(/entrada\s*:?\s*(R\$\s*[\d.,]+)(.*)$/i);
      if (m && atual) {
        atual.entrada = parseBR(m[1]);
        let p; RE_PARC.lastIndex = 0;
        while ((p = RE_PARC.exec(m[2]))) atual.entradaParcelas.push({ n: parseInt(p[1], 10), v: parseBR(p[2]) });
        if (atual.entradaParcelas.length) atual.obs.push('Oportunidade');
        return;
      }
      m = limpa.match(/(?:parcelas?|saldo)\s*:?\s*(.*)$/i);
      if (m && atual && /\d\s*[xX]/.test(m[1])) {
        let p; RE_PARC.lastIndex = 0;
        while ((p = RE_PARC.exec(m[1]))) atual.etapas.push({ n: parseInt(p[1], 10), v: parseBR(p[2]) });
        return;
      }
      if (/R\$/.test(limpa)) { if (atual) atual.obs.push(limpa); return; }
      // linha curta de tipo ("AUTOMÓVEIS", "IMÓVEIS", "MOTOS", "CAMINHÕES")
      const palavras = limpa.split(' ').filter(Boolean);
      const t = palavras.length <= 3 ? tipoDoCabecalho(limpa) : '';
      if (t) {
        fechar(); tipo = t;
        if (!conhecida(anterior) && anterior && anterior.split(' ').length <= 3) adm = canonAdm(anterior); // adm desconhecida logo antes do tipo
        anterior = ''; return;
      }
      const a = palavras.length <= 4 ? conhecida(limpa) : '';
      if (a) { fechar(); adm = a; anterior = ''; return; }
      if (!atual) anterior = limpa;
    });
    fechar();
    return { cartas, ignoradas };
  }

  // Fornecedores por WhatsApp (Rafael, LR): cartas somam ao estoque, repetidas só renovam a data, e saem sozinhas após 7 dias
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
    return cartas.filter((c) => {
      const f = FORNECEDORES[c.fornecedor];
      if (!f || !f.validadeDias || !c.criadoEm) return true;
      return Date.parse(c.criadoEm) >= (agora || Date.now()) - f.validadeDias * 86400000;
    });
  }

  const Motor = {
    parseBR, formatBRL, formatPct, r2, pad2, semAcento,
    ADMS, ADM_CAIXA, canonAdm, logoAdm, FORNECEDORES, TIPOS,
    ST_ADM, SEG_ABERTO, REP_BC, REGRAS_ADM_PADRAO, EXIG_PADRAO, regrasAdm, regraAdmSeg, admAtende,
    prazo, saldoDevedor, ehOportunidade, etapaMaiorPrazo, assinatura, calendario, faixas, cronograma, textoFaixas,
    SEGMENTOS, FAIXAS_LIMITES, TAXAS_PADRAO, TRANSFERENCIA_PCT, TETO_PCT, AGIO_ALFA_PCT,
    precoPadrao, precificacaoJairo, precificacaoAlfa, precificar, fundoReserva, taxaMensalLinear, tirMensal,
    avaliar, validarJuncao, OBJETIVOS, cartasDoSegmento, buscar, textoProposta, periodosCliente, textoPeriodo, textoEntradaParcelada,
    DIV_FAIXAS, RANK_ADM, posicaoRanking, segmentosPossiveis, melhorSegmento, SEG_COM_PROMO, PARCELA_PCT_PADRAO, PROMO_POR_SEGMENTO, segmentosDivulgacao, precoDivulgacao, itemDivulgacao, selecionarDivulgacao,
    lerLume, lerUni, lerFraga, lerFragaRotulos, lerRafael, lerLR, lerLista, mesclarRafael, expirarRafael, cartaValida
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  else root.Motor = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
