/* Documentos que cada administradora pede para liberar a carta (cliente comprador da cota contemplada).
   Fonte: guias e regulamentos oficiais das administradoras (levantamento de 13/11/2026).
   UNIVERSAL = o que todas pedem. ADM = o que muda de uma para outra (soma ao universal). */
(function (raiz) {
  // Cada item universal tem uma chave. Na lista da administradora, "@chave texto" troca o item universal;
  // itens sem "@" são acrescentados.
  const UNIVERSAL = {
    pf: { id: 'Documento de identidade com foto (RG ou CNH) e CPF', endereco: 'Comprovante de residência recente',
      estado_civil: 'Certidão de estado civil (nascimento, casamento ou declaração de união estável)', renda: 'Comprovante de renda',
      conjuge: 'Se for casado(a): documentos do cônjuge' },
    pj: { contrato: 'Contrato social (última alteração ou consolidado) ou estatuto', cnpj: 'Cartão CNPJ',
      socios: 'Documentos pessoais de todos os sócios ou representantes (identidade, CPF, endereço e estado civil)',
      endereco_pj: 'Comprovante de endereço da empresa', faturamento: 'Comprovante de faturamento' },
    novo: { nf: 'Nota fiscal do veículo em seu nome, com alienação fiduciária para a administradora' },
    usado: { crv: 'Documento do veículo (CRV/ATPV-e) preenchido e assinado pelo vendedor', crlv: 'CRLV do veículo', vistoria: 'Vistoria do veículo (quando a administradora pedir)' },
    imovel: { matricula: 'Matrícula atualizada do imóvel (até 30 dias), com certidão negativa de ônus',
      iptu: 'IPTU ou certidão negativa de débitos municipais', vendedor: 'Documentos pessoais do vendedor (PF) ou contrato social e CNPJ (PJ)',
      condominio: 'Apartamento ou condomínio: declaração de quitação do condomínio', avaliacao: 'Avaliação do imóvel pela administradora (vistoria de engenharia)' },
    seg: {
      solar: ['Nota fiscal do equipamento novo em seu nome, de fornecedor com CNPJ', 'Orçamento completo do integrador (potência, equipamentos e valor)'],
      maquinas: ['Nota fiscal da máquina, emitida por revenda com CNPJ', 'Pode ser pedido um veículo em seu nome como garantia'],
      implementos: ['Nota fiscal ou documento do implemento (usado pode exigir vistoria)']
    },
    transferencia: { termo: 'Termo de transferência da cota assinado por vendedor e comprador (com firma reconhecida ou assinatura digital)' }
  };

  const ADM = {
    'BB Consórcios': {
      pf: ['Renda bruta de pelo menos 3× as parcelas de consórcio (as que já tem + esta)', 'Sem restrição no Serasa a partir de R$ 1.000, cheque sem fundo ou CADIN', 'Idade entre 18 e 79 anos'],
      pj: ['Faturamento mensal médio de pelo menos 10× as parcelas', 'Conta no Banco do Brasil há mais de 12 meses'],
      veiculo: ['Vistoria obrigatória para carro acima de R$ 200 mil e para caminhão, semirreboque e ônibus', 'Pagamento ao vendedor em conta corrente (poupança não é aceita)'],
      imovel: ['Imóvel com matrícula individualizada e construção averbada', 'Construção ou reforma: projeto de engenheiro com CREA; o dinheiro sai em 3 etapas'],
      obs: ['Se a renda não fechar, pode ser pedido um fiador']
    },
    'Bradesco Consórcios': {
      pf: ['@renda Comprovante de renda: holerite, declaração de IR ou pró-labore', '@endereco Comprovante de residência de até 30 dias', 'Correntista Bradesco não precisa reenviar documentos pessoais'],
      pj: ['@faturamento Faturamento dos últimos 12 meses', '@endereco_pj Comprovante de endereço da empresa de até 30 dias', 'Declaração de IR da empresa'],
      usado: ['@crv DUT/ATPV preenchido e assinado com firma reconhecida (o valor pago é o menor entre FIPE/Molicar e o preço de venda)'],
      veiculo: ['Não pode comprar de cônjuge nem de sócio da mesma empresa'],
      obs: ['Análise em até 1 dia útil com os documentos completos']
    },
    'Caixa Consórcios': {
      pf: ['@endereco Comprovante de residência de até 90 dias (pode estar em nome de parente de 1º grau)', '@renda Renda — assalariado: 2 últimos holerites ou IR completo', 'Renda — aposentado: 3 últimos extratos do benefício ou IR', 'Renda — autônomo ou sócio: IR completo + 3 meses de extratos', 'Se somar a renda do cônjuge: comprovante de renda dele(a)'],
      pj: ['@endereco_pj Endereço da empresa de até 90 dias (MEI pode ser do titular)', '@faturamento Faturamento: balanço com DRE e balancete recente, ou declaração do Simples; DIPJ com recibo', 'Certidão simplificada da Junta Comercial'],
      usado: ['Carro usado até 8 anos; pesado até 10 anos'],
      veiculo: ['Não aceita veículo de empresa da qual você é sócio, do cônjuge, pais, avós, filhos ou netos'],
      obs: ['Depois de aprovado, você tem 90 dias para usar o crédito']
    },
    'Consórcio Embracon': {
      pf: ['@renda Comprovante de renda conforme a profissão (holerites, IR ou extratos)', 'Selfie segurando o documento'],
      pj: ['@faturamento Extrato do Simples dos últimos 12 meses, ou ECF com recibo + balanço do último trimestre + DRE dos 4 trimestres', '@socios Todos os sócios: documentos pessoais, IR com recibo e 3 meses de extratos', 'Balancete semestral assinado pelo contador', 'Transportadora: contrato de serviço ou agregamento e lista da frota (ou CRLVs)'],
      obs: ['A análise de crédito costuma sair em até 2 dias úteis']
    },
    'Consórcio Magalu': {
      pf_veiculo: ['@id CNH (preferencial) ou RG e CPF; sem CNH, a do motorista do veículo', '@endereco Comprovante de residência no mesmo endereço onde o veículo será registrado'],
      pf_imovel: ['@id RG e CPF em cópia simples (CNH não é aceita), seus e do cônjuge', '@estado_civil Certidão de estado civil emitida há no máximo 90 dias'],
      pf: ['@renda Renda CLT: 3 holerites ou 3 extratos (impressos no caixa ou PDF do app — print não vale) + fotos da carteira de trabalho', 'Renda autônomo: IR com recibo + comprovante de atividade, ou 3 extratos', 'Renda aposentado: 3 extratos do benefício + carta de concessão', 'Sem renda (estudante, do lar): fiador — pai/mãe ou cônjuge', 'Ficha cadastral preenchida e assinada'],
      pj: ['@socios RG, CPF e certidão de estado civil de todos os sócios e cônjuges', '@faturamento Extrato do Simples ou páginas da ECF (podem pedir 3 extratos da empresa)', 'Inscrição estadual ou municipal', 'Se o imóvel da empresa for alugado: comprovante de endereço do proprietário', 'Ficha cadastral'],
      novo: ['@nf Solicitação de faturamento e nota fiscal com alienação à Luiza Administradora de Consórcios'],
      usado: ['@vistoria 4 fotos (frente, traseira e laterais, placa legível) e pesquisa veicular', 'Carta de autorização de gravame assinada por comprador e vendedor'],
      veiculo: ['Taxa de gravame'],
      imovel: ['@vendedor Vendedor: documentos pessoais e certidões cíveis, criminais e de executivos fiscais (Fórum, Justiça Federal e do Trabalho), dele e do cônjuge', '@iptu Certidão negativa de tributos e de valor venal', '@condominio Apartamento: quitação do condomínio com firma do síndico e ata da eleição', 'Fotos coloridas da fachada e dos cômodos'],
      obs: ['O cadastro vale 90 dias; a análise leva até 10 dias úteis']
    },
    'Mycon': {
      pf: ['@endereco Comprovante de residência de até 90 dias', '@renda Renda: 3 holerites, carteira de trabalho, IR com recibo, DECORE, carta do empregador ou 3 extratos', 'Renda líquida de 3× a parcela (somando outras cotas Mycon) e nome sem restrição'],
      obs: ['Análise do comprador em até 5 dias úteis']
    },
    'Porto Bank': {
      pf: ['@id RG ou CNH dentro da validade'],
      pj: ['@contrato Contrato social com as alterações'],
      novo: ['@nf Nota fiscal (a loja só emite depois da autorização de faturamento da Porto)'],
      usado: ['@crlv CRLV digital (carro até 8 anos)'],
      veiculo: ['Se alguém representar o vendedor: procuração pública específica de até 90 dias'],
      solar: ['Especificação dos painéis, pedido de compra e CRLV de um veículo seu como garantia'],
      pf_imovel: ['@endereco Comprovante de residência de até 60 dias', 'Pacto antenupcial, conforme o regime de casamento'],
      pj_imovel: ['Certidão de breve relato da Junta (até 180 dias) e certidão negativa de débitos federais'],
      imovel: ['@iptu Cartela do IPTU, certidão de valor venal e negativa de IPTU (até 30 dias)', 'Não aceita imóvel com dívida de condomínio, impostos ou acordo em andamento', 'Venda de pai para filho: declaração dos herdeiros'],
      obs: ['A análise vale 60 dias a partir da entrega completa dos documentos']
    },
    'Porto Bank VP': {
      pf: ['@id RG ou CNH dentro da validade'],
      pj: ['@contrato Contrato social com as alterações'],
      novo: ['@nf Nota fiscal (a loja só emite depois da autorização de faturamento da Porto)'],
      usado: ['@crlv CRLV digital (acima de 3,5 t até 10 anos)'],
      veiculo: ['Se alguém representar o vendedor: procuração pública específica de até 90 dias'],
      maquinas: ['Pedido de compra e CRLV de um veículo seu como garantia (máquina de revenda, até 2 anos)']
    },
    'Santander Consórcio': {
      pf: ['Renda de 3× a prestação', 'Se não for correntista: firma reconhecida em cartório (ou assinatura digital gov.br)', 'Se usar procurador: procuração pública específica do consórcio, de até 1 ano'],
      pj: ['@contrato Contrato social atualizado (mesmo sendo correntista)', '@faturamento IR da empresa e faturamento dos últimos 12 meses com firma do contador', 'Um sócio como devedor solidário (exceto ME, EPP, MEI e S.A.)', 'O pagamento só vai para conta do CNPJ'],
      novo: ['@nf Nota fiscal de saída (veículo cadastrado na base BIN)'],
      usado: ['@crv DUT/CRV ou ATPV frente e verso', '@vistoria Vistoria online pelo portal'],
      veiculo: ['Contrato de alienação preenchido, enviado em um único PDF', 'Taxas: gravame, registro de contrato e vistoria'],
      imovel: ['@iptu IPTU do ano', '@condominio Condomínio: declaração negativa do síndico com firma reconhecida', '@avaliacao Vistoria de engenharia e análise jurídica (com taxa)', 'Matrícula da vaga de garagem, se for separada', 'Reforma ou construção: cronograma, orçamento, memorial, projeto aprovado, alvará e ART/RRT'],
      transferencia: ['@termo Termo de transferência com firma reconhecida por autenticidade', 'Selfie do vendedor e do comprador segurando o documento'],
      obs: ['A análise de crédito é automática e sai em até 48 h']
    },
    'Consórcio Servopa': {
      pf: ['@renda Comprovante de renda conforme a profissão (holerites ou declaração de IR)', 'Renda de 3× a prestação (somando cotas já contempladas) e nome sem restrição'],
      pj: ['@faturamento Último balanço e DRE', 'Certidão simplificada da Junta Comercial (até 30 dias)', 'Fiador com renda compatível'],
      usado: ['Carro e caminhão até 8 anos; moto abaixo de 500cc até 3 anos'],
      veiculo: ['Não aceita chassi remarcado, sinistro ou leilão'],
      imovel: ['Construção ou reforma em imóvel próprio é paga em etapas', 'Pode recusar imóvel com pendência, ação judicial ou transferido nos últimos 12 meses'],
      obs: ['A administradora responde em até 3 dias úteis']
    },
    'HS Consórcios': {
      pf: ['@id CPF e identidade autenticados', '@renda Renda dos últimos 3 a 6 meses e última declaração de IR com a declaração de bens', 'Pacto antenupcial, se houver', 'Ficha cadastral', 'Renda líquida de 3× a prestação; o cônjuge também não pode ter restrição'],
      pf_imovel: ['Certidões: Receita Federal, Fazenda Estadual, protesto, Justiça Federal, Trabalhista e distribuição cível e fiscal de 10 anos'],
      pj_imovel: ['Certidões da empresa e dos sócios: INSS, Receita Federal, Fazenda Estadual, protesto, Justiça Federal, Trabalhista e Junta Comercial'],
      pj: ['@contrato Contrato social com alterações, autenticado', '@faturamento Balanço e DRE, balancete atual, IR da empresa e faturamento de 12 meses', 'Ficha cadastral'],
      imovel: ['@vendedor Vendedor: documentos pessoais, dados bancários e certidões (cíveis 10 anos, protesto 5 anos, federal e trabalhista)', 'Imóvel: certidão vintenária, ITBI, plantas aprovadas, foto e cronograma do engenheiro'],
      obs: ['Análise das garantias em até 15 dias úteis']
    },
    'Itaú Consórcio': {
      pf: ['@id RG (com CPF) ou CNH'],
      pj_imovel: ['Certidão conjunta da Receita Federal'],
      usado: ['@crv Cópia da frente do CRV/DUT (se for de loja, também a nota fiscal de saída)'],
      imovel: ['@iptu IPTU ou certidão de dados cadastrais', 'Comprovante de estado civil do vendedor', 'Kit eletrônico preenchido no portal', 'Terreno: também a planta do loteamento', 'Reforma ou construção: projeto aprovado, alvará e cronograma físico-financeiro'],
      obs: ['Resposta da análise em até 10 dias úteis']
    },
    'Consórcio Nacional Volkswagen': {
      pf: ['@id CNH (obrigatória em cota de carro)', '@renda Renda CLT: carteira de trabalho + 3 holerites (6 se a renda for variável)', 'Renda autônomo: IR + 6 meses de extratos; empresário: IR + 3 extratos + alvará', 'Caminhoneiro ou taxista: CNH da categoria, CRLV, contrato de agregamento e IR ou 6 meses de fretes', 'Renda líquida de 3× a parcela (13º, férias e bônus não contam)', 'Ficha cadastral', 'Selfie'],
      pj: ['@faturamento Extrato do Simples/SIMEI de 12 meses, ou ECF + balanço + DRE', '@socios Todos os sócios: documentos de pessoa física', 'Balancete semestral assinado pelo contador'],
      novo: ['Pedido de compra da concessionária, dados bancários dela e carta de autorização de pagamento'],
      usado: ['@vistoria Laudo de vistoria (válido por 30 dias)', '@crv DUT autenticado'],
      veiculo: ['Firmas sempre por autenticidade (não por semelhança)'],
      obs: ['Depois de aprovado, você tem 90 dias para faturar']
    },
    'Disal Consórcio': {
      pf: ['@endereco Comprovante de residência de até 90 dias'],
      pj: ['Extratos bancários e IR da empresa com recibo'],
      veiculo: ['Envio dos documentos pela plataforma Cred+'],
      imovel: ['Vendedor: certidões de 2 anos de transações e 10 anos de ações', 'A avaliação do imóvel é descontada do crédito'],
      obs: ['Os documentos valem até 90 dias']
    },
    'Rodobens': {
      obs: ['Documentos enviados pela plataforma Credita (pelo computador, não pelo celular)']
    },
    'Sicredi Consórcios': {
      pf: ['Ser associado da cooperativa Sicredi (abrir conta)'],
      pj: ['A empresa também precisa ser associada']
    }
  };

  // Aplica as trocas ("@chave texto") e os acréscimos da administradora sobre a lista universal
  function aplicar(base, extra, prefixo) {
    const m = Object.assign({}, base || {});
    const add = [];
    (extra || []).forEach((x) => { const r = /^@(\w+)\s+(.*)$/.exec(x); if (r && r[1] in m) m[r[1]] = r[2]; else if (!r) add.push(x); });
    return Object.values(m).concat(add).map((x) => (prefixo || '') + x);
  }
  function documentosAdm(adm, opc) {
    const o = Object.assign({ pessoa: 'pf', tipo: 'veiculo', seg: '', estado: 'ambos' }, opc || {});
    const a = ADM[adm] || {};
    const uniq = (l) => [...new Set(l.filter(Boolean))];
    const secoes = [];
    secoes.push({ titulo: o.pessoa === 'pj' ? 'Documentos da empresa' : 'Seus documentos', itens: uniq(aplicar(UNIVERSAL[o.pessoa], (a[o.pessoa] || []).concat(a[o.pessoa + '_' + o.tipo] || []))) });
    let bem = [];
    if (o.tipo === 'imovel') bem = aplicar(UNIVERSAL.imovel, a.imovel);
    else {
      const dois = o.estado === 'ambos';
      if (o.estado !== 'usado') bem = bem.concat(aplicar(UNIVERSAL.novo, a.novo, dois ? '0 km: ' : ''));
      if (o.estado !== 'novo') bem = bem.concat(aplicar(UNIVERSAL.usado, a.usado, dois ? 'Usado: ' : ''));
      bem = bem.concat(UNIVERSAL.seg[o.seg] || [], a[o.seg] || [], a.veiculo || []);
    }
    secoes.push({ titulo: o.tipo === 'imovel' ? 'Imóvel e vendedor' : 'Documentos do bem', itens: uniq(bem) });
    secoes.push({ titulo: 'Transferência da cota', itens: uniq(aplicar(UNIVERSAL.transferencia, a.transferencia)) });
    const obs = uniq((a.obs || []).concat(['A administradora pode pedir documentos adicionais durante a análise']));
    return { secoes, obs, temRegra: !!ADM[adm] };
  }
  function textoDocumentos(adm, opc) {
    const d = documentosAdm(adm, opc);
    const L = ['*DOCUMENTOS PARA LIBERAR SUA CARTA — ' + adm.toUpperCase() + '*', (opc && opc.pessoa === 'pj') ? 'Pessoa jurídica' : 'Pessoa física', ''];
    d.secoes.forEach((s) => { L.push('*' + s.titulo.toUpperCase() + '*'); s.itens.forEach((i) => L.push('▫️ ' + i)); L.push(''); });
    L.push('*IMPORTANTE*'); d.obs.forEach((i) => L.push('• ' + i));
    return L.join('\n');
  }

  const api = { DOCS_UNIVERSAL: UNIVERSAL, DOCS_ADM: ADM, documentosAdm, textoDocumentos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.DOCS = api;
})(typeof window !== 'undefined' ? window : globalThis);
