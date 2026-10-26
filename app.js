/* =====================================================================
   FERRAMENTA ALFA — telas (login, busca, base, divulgação, usuários)
   O cálculo fica em motor.js (window.Motor).
   ===================================================================== */
(function () {
  'use strict';
  const M = window.Motor;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = M.parseBR;
  const BRL = M.formatBRL;
  const pct = (n, c) => M.formatPct(n, c);
  const fmtTaxa = (n) => n == null ? 'a confirmar' : (n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '% a.m.');
  const fmtData = (iso) => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtFx = (fx) => fx.map((f) => M.pad2(f.n) + 'x ' + BRL(f.v)).join(' + ');

  let FB = null;
  let EU = null;          // perfil do usuário logado
  let BASE = [];          // todas as cartas
  let LOTES = {};         // { 'uni_veiculo': { cartas, atualizadoEm, atualizadoPor } }
  let fluxo = false;      // cadastro/login em andamento (ignora o observador do Firebase)
  let modoSetup = false;  // primeira conta = administrador

  const ehAdmin = () => !!(EU && EU.role === 'admin');
  const podeBase = () => ehAdmin() || !!(EU && EU.podeBase);
  const regraEU = () => (EU && EU.regra === 'jairo') ? 'jairo' : 'alfa';
  const marcaEU = () => (EU && EU.marca === 'jairo') ? 'jairo' : 'alfa';

  /* ---------------- Firebase ---------------- */
  async function fbx() { if (FB) return FB; FB = await window.FB_PRONTO; return FB; }
  function traduzErro(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/email-already-in-use') return 'Esse e-mail já tem conta. Use "Entrar" ou "Esqueceu a senha?".';
    if (c === 'auth/invalid-email') return 'E-mail inválido.';
    if (c === 'auth/weak-password') return 'A senha precisa ter pelo menos 6 caracteres.';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'Usuário ou senha incorretos.';
    if (c === 'auth/too-many-requests') return 'Muitas tentativas seguidas. Aguarde alguns minutos.';
    if (c === 'auth/network-request-failed' || c === 'unavailable') return 'Sem conexão com o servidor. Confira sua internet.';
    if (c === 'auth/unauthorized-domain') return 'Este endereço não está liberado no Firebase (Authentication → Domínios autorizados).';
    if (c === 'permission-denied') return 'Sem permissão (confira as regras do Firestore).';
    return 'Erro inesperado' + (c ? ' (' + c + ')' : '') + '. Tente de novo.';
  }
  function msg(id, texto, tipo) { const el = $(id); el.textContent = texto || ''; el.className = 'form-msg' + (texto ? ' ' + (tipo || 'erro') : ''); }

  // Foto: reduz para no máximo 400px e JPEG, para caber no banco
  function fotoParaB64(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (file.size > 15 * 1024 * 1024) return reject(new Error('Foto muito grande (máx. 15MB).'));
      const r = new FileReader();
      r.onerror = () => reject(new Error('Não consegui ler a foto.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Esse arquivo não parece ser uma imagem.'));
        img.onload = () => {
          const k = Math.min(1, 400 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function limparPerfil(u) {
    if (!u) return u;
    const txt = (v) => String(v == null ? '' : v).replace(/[<>"'`&]/g, '').slice(0, 120);
    ['username', 'nome', 'cargo', 'telefone', 'instagram', 'email'].forEach((k) => { if (k in u) u[k] = txt(u[k]); });
    if (u.fotoB64 && !/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u.fotoB64)) u.fotoB64 = '';
    return u;
  }
  function avatarIniciais(nome) {
    const ini = String(nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#efe7d6"/><text x="40" y="50" font-family="Arial" font-size="30" font-weight="700" fill="#a8812f" text-anchor="middle">${ini}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  /* ===================== ACESSO ===================== */
  const PAINEIS = ['painelCarregando', 'painelLogin', 'painelRecuperar', 'painelCadastro', 'painelEspera'];
  function painel(id) { PAINEIS.forEach((p) => { $(p).hidden = p !== id; }); $('authGate').hidden = false; $('appWrap').hidden = true; }
  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { modoSetup = false; ajustarCadastro(); painel(b.dataset.ir); }));

  function ajustarCadastro() {
    $('cadTitulo').textContent = modoSetup ? 'Configuração inicial' : 'Criar conta';
    $('cadSub').textContent = modoSetup ? 'Crie a conta do administrador (você). Esta tela aparece uma única vez.' : 'Preencha seus dados. Eles aparecem nos seus cards.';
    $('btnCadastrar').textContent = modoSetup ? 'Criar conta de administrador' : 'Criar conta';
    $('cadLinks').hidden = modoSetup;
  }

  async function mostrarInicio() {
    try {
      const fb = await fbx();
      const cfg = await fb.getDoc(fb.doc(fb.db, 'config', 'admin'));
      modoSetup = !cfg.exists();
      ajustarCadastro();
      painel(modoSetup ? 'painelCadastro' : 'painelLogin');
    } catch (e) {
      painel('painelLogin');
      msg('loginMsg', 'Não consegui falar com o banco de dados: ' + traduzErro(e));
    }
  }

  async function carregarPerfil(uid) {
    const fb = await fbx();
    const s = await fb.getDoc(fb.doc(fb.db, 'usuarios', uid));
    return s.exists() ? limparPerfil(Object.assign({ uid }, s.data())) : null;
  }
  async function resolverEmail(entrada) {
    entrada = (entrada || '').trim().toLowerCase();
    if (entrada.includes('@')) return entrada;
    const fb = await fbx();
    const s = await fb.getDoc(fb.doc(fb.db, 'logins', entrada));
    return s.exists() ? s.data().email : null;
  }

  $('btnLogin').addEventListener('click', async () => {
    msg('loginMsg', '');
    const u = $('loginUser').value.trim(), s = $('loginSenha').value;
    if (!u || !s) return msg('loginMsg', 'Preencha usuário e senha.');
    const b = $('btnLogin'); b.disabled = true; b.textContent = 'Entrando...'; fluxo = true;
    try {
      const fb = await fbx();
      const email = await resolverEmail(u);
      if (!email) { msg('loginMsg', 'Usuário ou senha incorretos.'); return; }
      const cred = await fb.signInWithEmailAndPassword(fb.auth, email, s);
      const p = await carregarPerfil(cred.user.uid);
      if (!p) { await fb.signOut(fb.auth); msg('loginMsg', 'Conta sem perfil. Fale com o administrador.'); return; }
      await entrar(p);
    } catch (e) { msg('loginMsg', traduzErro(e)); }
    finally { fluxo = false; b.disabled = false; b.textContent = 'Entrar'; }
  });
  ['loginUser', 'loginSenha'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnLogin').click(); }));

  $('btnRecuperar').addEventListener('click', async () => {
    msg('recMsg', '');
    const b = $('btnRecuperar'); b.disabled = true;
    try {
      const fb = await fbx();
      const email = await resolverEmail($('recUser').value);
      if (!email) { msg('recMsg', 'Não encontrei esse usuário. Tente pelo e-mail.'); return; }
      await fb.sendPasswordResetEmail(fb.auth, email);
      const [a, d] = email.split('@');
      msg('recMsg', `Enviamos um link para ${a.slice(0, 2)}***@${d}. Confira também o spam.`, 'ok');
    } catch (e) { msg('recMsg', traduzErro(e)); }
    finally { b.disabled = false; }
  });

  $('cadFoto').addEventListener('change', async (e) => {
    try { const b64 = await fotoParaB64(e.target.files[0]); $('cadFotoPrev').src = b64; $('cadFotoPrev').hidden = !b64; $('cadFotoPrev').dataset.b64 = b64; }
    catch (er) { msg('cadMsg', er.message); }
  });

  $('btnCadastrar').addEventListener('click', async () => {
    msg('cadMsg', '');
    const v = (id) => $(id).value.trim();
    const username = v('cadUser').toLowerCase(), email = v('cadEmail').toLowerCase(), senha = $('cadSenha').value;
    const nome = v('cadNome'), telefone = v('cadTel');
    if (!nome || !telefone || !username || !email || !senha) return msg('cadMsg', 'Preencha nome, WhatsApp, usuário, e-mail e senha.');
    if (!/^[a-z0-9_.]+$/.test(username)) return msg('cadMsg', 'Usuário: só letras minúsculas, números, ponto ou underline.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('cadMsg', 'E-mail inválido.');
    if (senha.length < 6) return msg('cadMsg', 'A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== $('cadSenha2').value) return msg('cadMsg', 'As senhas não conferem.');
    const b = $('btnCadastrar'); b.disabled = true; const txt = b.textContent; b.textContent = 'Criando...'; fluxo = true;
    try {
      const fb = await fbx();
      if ((await fb.getDoc(fb.doc(fb.db, 'logins', username))).exists()) { msg('cadMsg', 'Esse usuário já existe. Escolha outro.'); return; }
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, senha);
      const uid = cred.user.uid;
      const agora = new Date().toISOString();
      const perfil = {
        username, email, nome, cargo: v('cadCargo') || 'Especialista em Consórcio', telefone, instagram: v('cadInsta'),
        fotoB64: $('cadFotoPrev').dataset.b64 || '', criadoEm: agora,
        role: modoSetup ? 'admin' : 'usuario', status: 'ativo',
        regra: modoSetup ? 'jairo' : 'alfa', marca: modoSetup ? 'jairo' : 'alfa', podeBase: modoSetup
      };
      const batch = fb.writeBatch(fb.db);
      batch.set(fb.doc(fb.db, 'logins', username), { uid, email });
      if (modoSetup) batch.set(fb.doc(fb.db, 'config', 'admin'), { uid, criadoEm: agora });
      batch.set(fb.doc(fb.db, 'usuarios', uid), perfil);
      try { await batch.commit(); } catch (e) { await cred.user.delete().catch(() => {}); throw e; }
      await entrar(limparPerfil(Object.assign({ uid }, perfil)));
    } catch (e) { msg('cadMsg', traduzErro(e)); }
    finally { fluxo = false; b.disabled = false; b.textContent = txt; }
  });

  async function sair() { try { const fb = await fbx(); await fb.signOut(fb.auth); } catch (e) {} location.reload(); }
  $('btnSair').addEventListener('click', sair);
  $('btnSairEspera').addEventListener('click', sair);

  async function entrar(p) {
    EU = p;
    if (p.role !== 'admin' && p.status !== 'ativo') {
      $('esperaTitulo').textContent = p.status === 'bloqueado' ? 'Acesso bloqueado' : 'Aguardando liberação';
      $('esperaTexto').textContent = p.status === 'bloqueado'
        ? 'Seu acesso foi bloqueado pelo administrador.'
        : 'Sua conta foi criada. Assim que o administrador liberar, é só entrar de novo.';
      painel('painelEspera');
      return;
    }
    $('authGate').hidden = true; $('appWrap').hidden = false;
    aplicarPerfil();
    await carregarBase();
    if (ehAdmin()) { renderNovo(); }
  }

  const VERSAO = '26/10 · 15h30';
  function aplicarPerfil() {
    if ($('versaoApp')) $('versaoApp').textContent = 'versão ' + VERSAO;
    $('badgeNome').textContent = EU.nome || EU.username;
    if (EU.fotoB64) { $('badgeFoto').src = EU.fotoB64; $('badgeFoto').hidden = false; } else $('badgeFoto').hidden = true;
    document.querySelectorAll('.so-admin').forEach((el) => { el.hidden = !ehAdmin(); });
    document.querySelectorAll('.so-base').forEach((el) => { el.hidden = !podeBase(); });
    document.querySelectorAll('.so-regra-jairo').forEach((el) => { el.hidden = regraEU() !== 'jairo'; });
    document.querySelectorAll('.so-regra-alfa').forEach((el) => { el.hidden = regraEU() !== 'alfa'; });
    try { const g = localStorage.getItem('alfa_agio_' + (EU.uid || '')); if (g) $('bAgio').value = g; } catch (e) {}
  }

  /* ---------------- Abas ---------------- */
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel-view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    $('view-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'usuarios') carregarUsuarios();
    if (btn.dataset.tab === 'divulgacao') gerarDivulgacao();
    if (btn.dataset.tab === 'base') renderBase();
  }));

  /* ---------------- Modal ---------------- */
  function abrirModal(html) { $('modalBox').innerHTML = html; $('modalBg').hidden = false; }
  function fecharModal() { $('modalBg').hidden = true; $('modalBox').innerHTML = ''; }
  $('modalBg').addEventListener('click', (e) => { if (e.target === $('modalBg')) fecharModal(); });

  /* ---------------- Meu perfil ---------------- */
  $('btnPerfil').addEventListener('click', () => {
    abrirModal(`
      <h3>Meu perfil</h3>
      <div class="section-sub">Esses dados aparecem no rodapé dos seus cards.</div>
      <div class="form-row"><label>Nome</label><input class="inp" id="pfNome" value="${esc(EU.nome)}"></div>
      <div class="form-row"><label>Título</label><input class="inp" id="pfCargo" value="${esc(EU.cargo)}"></div>
      <div class="form-row"><label>WhatsApp</label><input class="inp" id="pfTel" value="${esc(EU.telefone)}"></div>
      <div class="form-row"><label>Instagram</label><input class="inp" id="pfInsta" value="${esc(EU.instagram)}"></div>
      <div class="form-row"><label>Foto</label><div class="foto-row"><img id="pfFotoPrev" src="${EU.fotoB64 || avatarIniciais(EU.nome)}" alt=""><input type="file" id="pfFoto" accept="image/*"></div></div>
      <div class="btn-row"><button class="btn" id="pfCancelar">Cancelar</button><button class="btn primary" id="pfSalvar">Salvar</button></div>
      <div class="form-msg" id="pfMsg"></div>`);
    let novaFoto = null;
    $('pfFoto').addEventListener('change', async (e) => { try { novaFoto = await fotoParaB64(e.target.files[0]); $('pfFotoPrev').src = novaFoto; } catch (er) { msg('pfMsg', er.message); } });
    $('pfCancelar').addEventListener('click', fecharModal);
    $('pfSalvar').addEventListener('click', async () => {
      const dados = { nome: $('pfNome').value.trim(), cargo: $('pfCargo').value.trim(), telefone: $('pfTel').value.trim(), instagram: $('pfInsta').value.trim(), atualizadoEm: new Date().toISOString() };
      if (novaFoto) dados.fotoB64 = novaFoto;
      if (!dados.nome || !dados.telefone) return msg('pfMsg', 'Nome e WhatsApp são obrigatórios.');
      try {
        const fb = await fbx();
        await fb.updateDoc(fb.doc(fb.db, 'usuarios', EU.uid), dados);
        Object.assign(EU, limparPerfil(dados)); aplicarPerfil(); fecharModal();
      } catch (e) { msg('pfMsg', traduzErro(e)); }
    });
  });

  /* ===================== BASE DE CARTAS ===================== */
  const chaveLote = (f, t) => f + '_' + t;
  async function carregarBase() {
    const info = $('buscaBaseInfo');
    try {
      const fb = await fbx();
      const snap = await fb.getDocs(fb.collection(fb.db, 'base'));
      LOTES = {};
      snap.forEach((d) => { LOTES[d.id] = d.data(); });
      // Fornecedores por WhatsApp (Rafael, LR): cartas com mais de 7 dias saem sozinhas
      for (const f of Object.keys(M.FORNECEDORES).filter((x) => M.FORNECEDORES[x].validadeDias)) {
        for (const t of Object.keys(M.TIPOS)) {
          const k = chaveLote(f, t);
          if (!LOTES[k]) continue;
          const antes = LOTES[k].cartas || [];
          const depois = M.expirarRafael(antes);
          if (depois.length !== antes.length) {
            LOTES[k].cartas = depois;
            if (podeBase()) { try { await salvarLote(f, t, depois, true); } catch (e) {} }
          }
        }
      }
      montarBase();
    } catch (e) {
      info.className = 'message danger';
      info.textContent = 'Não consegui carregar a base de cartas: ' + traduzErro(e);
    }
  }
  function montarBase() {
    BASE = [];
    Object.keys(LOTES).forEach((k) => (LOTES[k].cartas || []).forEach((c) => BASE.push(c)));
    const info = $('buscaBaseInfo');
    const atual = Object.values(LOTES).map((l) => l.atualizadoEm).filter(Boolean).sort().pop();
    info.className = 'message info';
    info.innerHTML = BASE.length
      ? `<strong>${BASE.length} cartas na base</strong> · última atualização em ${fmtData(atual)}.`
      : 'A base ainda está vazia. ' + (podeBase() ? 'Cole as listas dos fornecedores na aba "Base de cartas".' : 'Aguarde o administrador alimentar a base.');
    preencherFiltrosManual();
    if ($('view-base').classList.contains('active')) renderBase();
  }
  async function salvarLote(forn, tipo, cartas, silencioso) {
    const fb = await fbx();
    const dados = { fornecedor: forn, tipo, cartas, atualizadoEm: new Date().toISOString(), atualizadoPor: EU.nome || EU.username };
    await fb.setDoc(fb.doc(fb.db, 'base', chaveLote(forn, tipo)), dados);
    LOTES[chaveLote(forn, tipo)] = dados;
    if (!silencioso) montarBase();
  }
  const novoId = (f, t, i) => f + '-' + t + '-' + Date.now().toString(36) + '-' + i + Math.random().toString(36).slice(2, 5);
  const admOptions = (sel) => {
    const nomes = M.ADMS.map((a) => a.nome);
    if (sel && !nomes.includes(sel)) nomes.unshift(sel);
    return nomes.map((n) => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  };
  const etapasTexto = (ets) => (ets || []).map((e) => M.pad2(e.n) + 'x ' + M.formatBRL(e.v).replace('R$ ', '').replace('R$ ', '')).join(' + ');
  function lerEtapasTexto(txt) {
    const out = []; const re = /(\d{1,3})\s*[xX]\s*(?:de\s*)?(?:R\$\s*)?([\d.]+(?:,\d{1,2})?)/g; let m;
    while ((m = re.exec(txt || ''))) out.push({ n: parseInt(m[1], 10), v: num(m[2]) });
    return out;
  }

  // Seletores do passo 1
  $('baseForn').innerHTML = Object.keys(M.FORNECEDORES).map((k) => `<option value="${k}">${M.FORNECEDORES[k].nome}</option>`).join('');
  $('baseAdmPadrao').innerHTML = admOptions('HS Consórcios');
  function ajustarPassos() {
    const f = $('baseForn').value;
    const somar = M.FORNECEDORES[f].modo === 'somar';
    $('baseTipoWrap').hidden = somar;
    $('baseAdmWrap').hidden = f !== 'fraga';
    $('baseModoInfo').textContent = somar
      ? 'As cartas ' + (M.FORNECEDORES[f].art || 'do') + ' ' + M.FORNECEDORES[f].nome + ' somam ao que já existe e saem sozinhas 7 dias depois. A administradora e o tipo vêm da própria mensagem.'
      : 'A lista nova substitui só ' + M.FORNECEDORES[f].nome + ' · ' + M.TIPOS[$('baseTipo').value] + '.';
    $('basePrevia').innerHTML = '';
  }
  $('baseForn').addEventListener('change', ajustarPassos);
  $('baseTipo').addEventListener('change', ajustarPassos);
  ajustarPassos();

  let PREVIA = null;
  $('btnLerLista').addEventListener('click', () => {
    const forn = $('baseForn').value, tipo = $('baseTipo').value;
    const txt = $('baseTexto').value;
    if (!txt.trim()) { $('basePrevia').innerHTML = '<div class="message warn">Cole a lista antes.</div>'; return; }
    const r = M.lerLista(forn, txt, tipo, { admPadrao: $('baseAdmPadrao').value });
    PREVIA = { forn, tipo, cartas: r.cartas, ignoradas: r.ignoradas };
    renderPrevia();
  });
  function renderPrevia() {
    const p = PREVIA; const box = $('basePrevia');
    const nOp = p.cartas.filter(M.ehOportunidade).length;
    const ehRafael = M.FORNECEDORES[p.forn].modo === 'somar'; // fornecedor por WhatsApp (Rafael, LR)
    let h = `<div class="message ${p.cartas.length ? 'ok' : 'warn'}" style="margin-bottom:12px;"><strong>${p.cartas.length} cartas lidas</strong>${nOp ? ' · ' + nOp + ' Oportunidade' : ''}. Confira e ajuste o que precisar antes de salvar.</div>`;
    if (p.ignoradas.length) h += `<div class="message warn" style="margin-bottom:12px;"><strong>${p.ignoradas.length} trecho(s) não reconhecido(s)</strong> — confira se falta alguma carta (dá para adicionar à mão depois):<div class="texto-copia">${p.ignoradas.map(esc).join('\n')}</div></div>`;
    if (p.cartas.length) {
      h += `<div class="table-wrap"><table class="data-table"><thead><tr>${ehRafael ? '<th>Tipo</th>' : ''}<th>Administradora</th><th>Crédito</th><th>Entrada</th><th>Entrada parcelada</th><th>Parcelas</th><th>Prazo</th><th>Observações</th><th></th></tr></thead><tbody>`;
      p.cartas.forEach((c, i) => {
        h += `<tr data-i="${i}">
          ${ehRafael ? `<td><select class="pv-tipo"><option value="veiculo"${c.tipo === 'veiculo' ? ' selected' : ''}>Veículo</option><option value="imovel"${c.tipo === 'imovel' ? ' selected' : ''}>Imóvel</option></select></td>` : ''}
          <td><select class="pv-adm">${admOptions(c.adm)}</select></td>
          <td><input type="text" class="pv-cred" value="${M.formatBRL(c.credito)}" size="12"></td>
          <td><input type="text" class="pv-ent" value="${M.formatBRL(c.entrada)}" size="11"></td>
          <td><input type="text" class="pv-entp" value="${etapasTexto(c.entradaParcelas)}" size="12" placeholder="—"></td>
          <td><input type="text" class="pv-et" value="${etapasTexto(c.etapas)}" size="22"></td>
          <td class="mono">${M.prazo(c)}x</td>
          <td>${(c.codigo ? `<span class="selo cinza">cota ${esc(c.codigo)}</span>` : '') + (c.obs || []).map((o) => `<span class="selo">${esc(o)}</span>`).join('')}</td>
          <td><button class="rm-btn pv-rm" title="Tirar da lista">×</button></td></tr>`;
      });
      h += '</tbody></table></div>';
      const destino = ehRafael ? 'Adicionar ao estoque ' + (M.FORNECEDORES[p.forn].art || 'do') + ' ' + M.FORNECEDORES[p.forn].nome : `Salvar e substituir ${M.FORNECEDORES[p.forn].nome} · ${M.TIPOS[p.tipo]}`;
      h += `<div class="btn-row" style="margin-top:14px;"><span class="section-sub" style="margin:0;">${ehRafael ? 'Cartas repetidas só renovam a data.' : 'Hoje existem ' + ((LOTES[chaveLote(p.forn, p.tipo)] || {}).cartas || []).length + ' cartas nessa lista; elas serão trocadas por estas.'}</span>
        <button class="btn primary" id="btnSalvarPrevia">${destino}</button></div><div class="form-msg" id="previaMsg"></div>`;
    }
    box.innerHTML = h;
    box.querySelectorAll('.pv-rm').forEach((b) => b.addEventListener('click', () => { lerPreviaDaTela(); PREVIA.cartas.splice(+b.closest('tr').dataset.i, 1); renderPrevia(); }));
    const bs = $('btnSalvarPrevia'); if (bs) bs.addEventListener('click', salvarPrevia);
  }
  function lerPreviaDaTela() {
    document.querySelectorAll('#basePrevia tbody tr').forEach((tr) => {
      const c = PREVIA.cartas[+tr.dataset.i]; if (!c) return;
      const q = (s) => tr.querySelector(s);
      if (q('.pv-tipo')) c.tipo = q('.pv-tipo').value;
      c.adm = q('.pv-adm').value; c.credito = num(q('.pv-cred').value); c.entrada = num(q('.pv-ent').value);
      c.entradaParcelas = lerEtapasTexto(q('.pv-entp').value); c.etapas = lerEtapasTexto(q('.pv-et').value);
    });
  }
  async function salvarPrevia() {
    lerPreviaDaTela();
    const p = PREVIA;
    const ruins = p.cartas.filter((c) => !M.cartaValida(c));
    if (ruins.length) return msg('previaMsg', ruins.length + ' carta(s) com crédito ou parcelas inválidos. Corrija ou tire da lista.');
    const b = $('btnSalvarPrevia'); b.disabled = true; b.textContent = 'Salvando...';
    try {
      const agora = new Date().toISOString();
      if (M.FORNECEDORES[p.forn].modo === 'somar') {
        let txt = [];
        for (const t of Object.keys(M.TIPOS)) {
          const novas = p.cartas.filter((c) => c.tipo === t);
          if (!novas.length) continue;
          const exist = M.expirarRafael(((LOTES[chaveLote(p.forn, t)] || {}).cartas) || []);
          const r = M.mesclarRafael(exist, novas, agora);
          r.cartas.forEach((c, i) => { if (!c.id) c.id = novoId(p.forn, t, i); });
          await salvarLote(p.forn, t, r.cartas, true);
          txt.push(`${M.TIPOS[t]}: ${r.adicionadas} nova(s), ${r.renovadas} renovada(s)`);
        }
        montarBase();
        $('basePrevia').innerHTML = `<div class="message ok">Salvo. ${txt.join(' · ')}.</div>`;
      } else {
        const cartas = p.cartas.map((c, i) => Object.assign({}, c, { fornecedor: p.forn, tipo: p.tipo, id: novoId(p.forn, p.tipo, i), criadoEm: agora }));
        await salvarLote(p.forn, p.tipo, cartas);
        $('basePrevia').innerHTML = `<div class="message ok">Salvo. ${M.FORNECEDORES[p.forn].nome} · ${M.TIPOS[p.tipo]} agora tem ${cartas.length} cartas.</div>`;
      }
      $('baseTexto').value = ''; PREVIA = null;
    } catch (e) { msg('previaMsg', traduzErro(e)); b.disabled = false; b.textContent = 'Tentar de novo'; }
  }

  function selosCarta(c) {
    let s = '';
    if (M.ehOportunidade(c)) s += '<span class="selo verde">Oportunidade</span>';
    if (c.codigo) s += `<span class="selo cinza">cota ${esc(c.codigo)}</span>`;
    (c.obs || []).filter((o) => !/oportunidade/i.test(o)).forEach((o) => { s += `<span class="selo">${esc(o)}</span>`; });
    const val = M.FORNECEDORES[c.fornecedor] && M.FORNECEDORES[c.fornecedor].validadeDias;
    if (val && c.criadoEm) {
      const dias = Math.max(0, val - Math.floor((Date.now() - Date.parse(c.criadoEm)) / 86400000));
      s += `<span class="selo cinza">sai em ${dias} dia${dias === 1 ? '' : 's'}</span>`;
    }
    return s;
  }
  function parcelasCartaTxt(c) {
    return (M.ehOportunidade(c) ? 'entrada + ' + fmtFx(c.entradaParcelas) + ' · ' : '') + fmtFx(c.etapas);
  }

  function renderBase() {
    if (!podeBase()) return;
    // Situação por fornecedor e tipo
    let h = '<thead><tr><th>Fornecedor</th><th>Tipo</th><th>Cartas</th><th>Atualizado em</th><th>Por</th></tr></thead><tbody>';
    Object.keys(M.FORNECEDORES).forEach((f) => Object.keys(M.TIPOS).forEach((t) => {
      const l = LOTES[chaveLote(f, t)];
      const n = l ? (l.cartas || []).length : 0;
      h += `<tr><td>${M.FORNECEDORES[f].nome}</td><td>${M.TIPOS[t]}</td><td class="mono${n ? '' : ' lote-vazio'}">${n}</td><td class="mono">${l ? fmtData(l.atualizadoEm) : '—'}</td><td>${l ? esc(l.atualizadoPor) : '—'}</td></tr>`;
    }));
    $('baseLotes').innerHTML = h + '</tbody>';
    // filtros
    const fF = $('fForn'), fA = $('fAdm');
    const vF = fF.value, vA = fA.value;
    fF.innerHTML = '<option value="">Todos os fornecedores</option>' + Object.keys(M.FORNECEDORES).map((k) => `<option value="${k}">${M.FORNECEDORES[k].nome}</option>`).join('');
    const adms = [...new Set(BASE.map((c) => c.adm))].sort();
    fA.innerHTML = '<option value="">Todas as administradoras</option>' + adms.map((a) => `<option>${esc(a)}</option>`).join('');
    fF.value = vF; if (adms.includes(vA)) fA.value = vA;
    renderTabelaBase();
  }
  function renderTabelaBase() {
    const f = $('fForn').value, t = $('fTipo').value, a = $('fAdm').value, busca = num($('fBusca').value);
    let lista = BASE.filter((c) => (!f || c.fornecedor === f) && (!t || c.tipo === t) && (!a || c.adm === a));
    if (busca > 0) lista = lista.filter((c) => Math.abs(c.credito - busca) <= busca * 0.1 || Math.abs(c.entrada - busca) <= busca * 0.05);
    lista.sort((x, y) => x.credito - y.credito);
    const mostrar = lista.slice(0, 400);
    let h = `<thead><tr><th>Fornecedor</th><th>Tipo</th><th>Administradora</th><th>Crédito</th><th>Entrada</th><th>Parcelas</th><th>Prazo</th><th></th><th></th></tr></thead><tbody>`;
    mostrar.forEach((c) => {
      h += `<tr data-id="${esc(c.id)}"><td>${M.FORNECEDORES[c.fornecedor] ? M.FORNECEDORES[c.fornecedor].nome : esc(c.fornecedor)}</td><td>${M.TIPOS[c.tipo] || ''}</td><td>${esc(c.adm)}</td>
        <td class="mono">${BRL(c.credito)}</td><td class="mono">${BRL(c.entrada)}</td><td class="mono" style="white-space:normal;">${parcelasCartaTxt(c)}</td><td class="mono">${M.prazo(c)}x</td>
        <td>${selosCarta(c)}</td><td style="white-space:nowrap;"><button class="btn sm bt-edit">Editar</button> <button class="btn sm danger bt-del">Excluir</button></td></tr>`;
    });
    if (!mostrar.length) h += '<tr><td colspan="9" class="lote-vazio">Nenhuma carta com esses filtros.</td></tr>';
    h += '</tbody>';
    if (lista.length > mostrar.length) h += `<caption style="caption-side:bottom; text-align:left; padding-top:8px; color:var(--ink-dim); font-size:12px;">Mostrando ${mostrar.length} de ${lista.length}. Use os filtros para achar uma carta.</caption>`;
    $('baseTabela').innerHTML = h;
    $('baseTabela').querySelectorAll('.bt-del').forEach((b) => b.addEventListener('click', () => excluirCarta(b.closest('tr').dataset.id)));
    $('baseTabela').querySelectorAll('.bt-edit').forEach((b) => b.addEventListener('click', () => editarCarta(b.closest('tr').dataset.id)));
  }
  ['fForn', 'fTipo', 'fAdm'].forEach((id) => $(id).addEventListener('change', renderTabelaBase));
  $('fBusca').addEventListener('input', renderTabelaBase);

  function loteDaCarta(id) {
    for (const k of Object.keys(LOTES)) { const i = (LOTES[k].cartas || []).findIndex((c) => c.id === id); if (i >= 0) return { k, i, l: LOTES[k] }; }
    return null;
  }
  async function excluirCarta(id) {
    const r = loteDaCarta(id); if (!r) return;
    const c = r.l.cartas[r.i];
    if (!confirm(`Excluir a carta de ${BRL(c.credito)} (${c.adm})?`)) return;
    const novas = r.l.cartas.filter((x) => x.id !== id);
    try { await salvarLote(r.l.fornecedor, r.l.tipo, novas); } catch (e) { alert(traduzErro(e)); }
  }
  function formCartaHTML(c, nova) {
    return `
      <h3>${nova ? 'Adicionar carta' : 'Editar carta'}</h3>
      ${nova ? `<div class="grid" style="margin-bottom:12px;"><div class="form-row"><label>Fornecedor</label><select class="sel" id="ecForn">${Object.keys(M.FORNECEDORES).map((k) => `<option value="${k}">${M.FORNECEDORES[k].nome}</option>`).join('')}</select></div>
        <div class="form-row"><label>Tipo</label><select class="sel" id="ecTipo"><option value="veiculo">Veículos</option><option value="imovel">Imóveis</option></select></div></div>` : ''}
      <div class="form-row"><label>Administradora</label><select class="sel" id="ecAdm">${admOptions(c.adm || 'Caixa Consórcios')}</select></div>
      <div class="grid" style="margin-bottom:0;"><div class="form-row"><label>Crédito</label><input class="inp mono" id="ecCred" value="${c.credito ? BRL(c.credito) : ''}"></div>
        <div class="form-row"><label>Entrada (à vista)</label><input class="inp mono" id="ecEnt" value="${c.credito ? BRL(c.entrada) : ''}"></div></div>
      <div class="form-row"><label>Parcelas (ex: 08x 7.352 + 38x 6.145)</label><input class="inp mono" id="ecEt" value="${etapasTexto(c.etapas)}"></div>
      <div class="form-row"><label>Entrada parcelada — só carta Oportunidade (ex: 10x 11.150)</label><input class="inp mono" id="ecEntP" value="${etapasTexto(c.entradaParcelas)}"></div>
      <div class="form-row"><label>Observações (separadas por vírgula)</label><input class="inp" id="ecObs" value="${esc((c.obs || []).join(', '))}"></div>
      <div class="btn-row"><button class="btn" id="ecCancelar">Cancelar</button><button class="btn primary" id="ecSalvar">Salvar</button></div>
      <div class="form-msg" id="ecMsg"></div>`;
  }
  function lerFormCarta(base) {
    const c = Object.assign({}, base, {
      adm: $('ecAdm').value, credito: num($('ecCred').value), entrada: num($('ecEnt').value),
      etapas: lerEtapasTexto($('ecEt').value), entradaParcelas: lerEtapasTexto($('ecEntP').value),
      obs: $('ecObs').value.split(',').map((s) => s.trim()).filter(Boolean)
    });
    if (c.entradaParcelas.length && !c.obs.some((o) => /oportunidade/i.test(o))) c.obs.push('Oportunidade');
    return c;
  }
  function editarCarta(id) {
    const r = loteDaCarta(id); if (!r) return;
    const c = r.l.cartas[r.i];
    abrirModal(formCartaHTML(c, false));
    $('ecCancelar').addEventListener('click', fecharModal);
    $('ecSalvar').addEventListener('click', async () => {
      const nova = lerFormCarta(c);
      if (!M.cartaValida(nova)) return msg('ecMsg', 'Confira crédito, entrada e parcelas.');
      const lista = r.l.cartas.map((x) => x.id === id ? nova : x);
      try { await salvarLote(r.l.fornecedor, r.l.tipo, lista); fecharModal(); } catch (e) { msg('ecMsg', traduzErro(e)); }
    });
  }
  $('btnNovaCarta').addEventListener('click', () => {
    abrirModal(formCartaHTML({}, true));
    $('ecCancelar').addEventListener('click', fecharModal);
    $('ecSalvar').addEventListener('click', async () => {
      const forn = $('ecForn').value, tipo = $('ecTipo').value;
      const nova = lerFormCarta({ fornecedor: forn, tipo, id: novoId(forn, tipo, 0), criadoEm: new Date().toISOString(), codigo: '' });
      if (!M.cartaValida(nova)) return msg('ecMsg', 'Confira crédito, entrada e parcelas.');
      const lista = (((LOTES[chaveLote(forn, tipo)] || {}).cartas) || []).concat([nova]);
      try { await salvarLote(forn, tipo, lista); fecharModal(); } catch (e) { msg('ecMsg', traduzErro(e)); }
    });
  });

  /* ===================== PRECIFICAÇÃO (regra Jairo, na busca) ===================== */
  const PREC = (function () {
    const root = $('prec-busca');
    const chkP = root.querySelector('.prec-parceiro'), chkC = root.querySelector('.prec-cheio');
    const editBtn = root.querySelector('.prec-edit-btn'), box = root.querySelector('.prec-edit');
    const taxas = [...root.querySelectorAll('.prec-taxa')];
    const custo = root.querySelector('.prec-custo'), transf = root.querySelector('.prec-transf');
    let custoEditado = false;
    const fmt = (n) => String(n).replace('.', ',');
    function marcar() {
      taxas.forEach((i) => i.classList.toggle('alterado', Math.abs(num(i.value) - M.TAXAS_PADRAO[+i.dataset.faixa][i.dataset.quem]) > 1e-9));
      custo.classList.toggle('alterado', custoEditado);
      transf.classList.toggle('alterado', Math.abs(num(transf.value) - M.TRANSFERENCIA_PCT) > 1e-9);
    }
    function seg() { return $('bSeg').value; }
    function sincronizar() {
      if (!custoEditado) custo.value = fmt(M.SEGMENTOS[seg()].custo);
      $('precSegInfo').textContent = M.SEGMENTOS[seg()].nome + ' · ' + BRL(num(custo.value));
    }
    function restaurar() {
      taxas.forEach((i) => { i.value = fmt(M.TAXAS_PADRAO[+i.dataset.faixa][i.dataset.quem]); });
      custoEditado = false; transf.value = fmt(M.TRANSFERENCIA_PCT); sincronizar(); marcar();
    }
    restaurar();
    editBtn.addEventListener('click', () => { box.hidden = !box.hidden; editBtn.classList.toggle('on', !box.hidden); });
    taxas.concat([transf]).forEach((i) => i.addEventListener('input', marcar));
    custo.addEventListener('input', () => { custoEditado = true; marcar(); sincronizar(); });
    root.querySelector('.prec-reset').addEventListener('click', restaurar);
    $('bSeg').addEventListener('change', sincronizar);
    return {
      get() {
        const t = [0, 1, 2].map((f) => { const o = {}; ['alpha', 'jairo', 'parceiro'].forEach((q) => { o[q] = num(root.querySelector(`.prec-taxa[data-faixa="${f}"][data-quem="${q}"]`).value); }); return o; });
        return { segmento: seg(), parceiro: chkP.checked, cheio: chkC.checked, custoSegmento: num(custo.value), transferenciaPct: num(transf.value), taxas: t };
      }
    };
  })();

  /* ===================== CARDS DE PROPOSTA ===================== */
  const WA_SVG = '<svg class="wa-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#25D366"/><path d="M16 8.6c-4.08 0-7.4 3.32-7.4 7.4 0 1.3.34 2.52.94 3.58L8.6 23.4l3.94-1.03a7.35 7.35 0 0 0 3.46.87c4.08 0 7.4-3.32 7.4-7.4s-3.32-7.24-7.4-7.24zm0 13.4c-1.08 0-2.1-.3-2.98-.82l-.21-.12-2.33.61.62-2.27-.14-.24a6.03 6.03 0 0 1-.93-3.2c0-3.33 2.71-6.05 6.05-6.05s6.05 2.63 6.05 5.96c0 3.33-2.68 5.13-6.13 5.13zm3.31-4.54c-.18-.09-1.07-.53-1.24-.59-.17-.06-.29-.09-.41.09-.12.18-.46.59-.57.71-.11.12-.21.14-.39.05-.18-.09-.77-.28-1.47-.91-.54-.48-.91-1.08-1.02-1.26-.11-.18-.01-.28.08-.37.08-.08.18-.21.27-.31.09-.11.12-.18.18-.3.06-.12.03-.23-.02-.32-.05-.09-.41-.98-.56-1.34-.15-.36-.3-.31-.41-.31h-.35c-.12 0-.32.05-.49.23-.17.18-.63.62-.63 1.51s.65 1.76.74 1.88c.09.12 1.28 1.96 3.11 2.75.43.19.77.3 1.04.38.44.14.83.12 1.15.07.35-.05 1.07-.44 1.22-.86.15-.42.15-.78.1-.86-.05-.08-.17-.13-.34-.22z" fill="#fff"/></svg>';
  const IG_SVG = '<svg class="wa-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FFC107"/><stop offset="35%" stop-color="#E1306C"/><stop offset="70%" stop-color="#C13584"/><stop offset="100%" stop-color="#5851DB"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#igGrad)"/><rect x="9" y="9" width="14" height="14" rx="4.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="21.3" cy="10.7" r="1.15" fill="#fff"/></svg>';

  function perfilCard(marca) {
    const p = EU || {};
    return {
      nome: p.nome || 'Jairo Vieira', cargo: p.cargo || 'Estrategista de Consórcio',
      telefone: p.telefone || '', instagram: p.instagram || '',
      foto: p.fotoB64 || (marca === 'jairo' ? 'assets/jairo_foto.jpg' : avatarIniciais(p.nome))
    };
  }
  function rodapeCard(marca) {
    const p = perfilCard(marca);
    return `
      <div class="oferta-footer">
        <div class="oferta-name-block"><img class="oferta-avatar" src="${p.foto}" alt="">
          <div><div class="oferta-name" contenteditable="true" spellcheck="false">${esc(p.nome)}</div><div class="oferta-role" contenteditable="true" spellcheck="false">${esc(p.cargo)}</div></div></div>
        <div class="oferta-contact-block">
          ${p.telefone ? `<div class="oferta-contact-line">${WA_SVG}<span class="editable" contenteditable="true" spellcheck="false">${esc(p.telefone)}</span></div>` : ''}
          ${p.instagram ? `<div class="oferta-contact-line insta">${IG_SVG}<span class="editable" contenteditable="true" spellcheck="false">${esc(p.instagram.startsWith('@') ? p.instagram : '@' + p.instagram)}</span></div>` : ''}
        </div>
      </div>`;
  }
  function cabecalhoCard(id, marca, tag) {
    if (marca === 'alfa') {
      return `<div class="alfa-faixa"></div>
        <div class="oferta-header"><div class="oferta-logo-block"><img class="alfa-logo-img" src="assets/alfa_logo.png" alt="Alfa"></div>
          <div class="oferta-header-actions"><div class="oferta-tag">${tag}</div></div></div>`;
    }
    return `<div class="oferta-header"><div class="oferta-logo-block"><img class="oferta-logo-img for-dark" src="assets/logo_dark.png" alt="Jairo Vieira"><img class="oferta-logo-img for-light" src="assets/logo_light.png" alt="Jairo Vieira"></div>
      <div class="oferta-header-actions"><div class="oferta-tag">${tag}</div><button type="button" class="oferta-theme-toggle" data-tema="${id}" title="Alternar claro/escuro">☀️</button></div></div>`;
  }

  // Card de proposta a partir de uma avaliação do motor
  function cardPropostaHTML(id, a, marca) {
    const logoAdm = M.logoAdm(a.adm);
    const varias = a.cotas.length > 1;
    const extraConsorcio = a.entradaParcelada + a.transferenciaAParte;
    return `
      <div class="oferta-card ${marca === 'alfa' ? 'marca-alfa' : 'dark'}" id="${id}" data-valor="${a.credito}" data-entrada="${a.entradaFinal}" data-prazo="${a.prazo}" data-saldo="${a.saldo}" data-extra="${extraConsorcio}">
        ${cabecalhoCard(id, marca, 'Carta contemplada')}
        <div class="oferta-body">
          <div class="oferta-eyebrow">Proposta de carta de crédito</div>
          <div class="oferta-headline-row"><div class="oferta-headline">Carta de <span class="amount">${BRL(a.credito)}</span></div>
            ${logoAdm ? `<img class="oferta-admin-logo" src="${logoAdm}" alt="${esc(a.adm)}">` : ''}</div>
          <div class="oferta-title-sub">${varias ? a.cotas.length + ' cotas da ' + esc(a.adm) + ' em uma só proposta' : esc(a.adm)}</div>
          ${statstripHTML(a)}
          <div class="oferta-fr-note">*Fundo de reserva estimado (valor aproximado). É uma proteção do grupo contra inadimplência; se não for usado, costuma ser devolvido ao consorciado ao final do plano.</div>
          ${a.transferenciaAParte > 0 ? `<div class="alfa-aviso">Taxa de transferência de 1% do crédito (<strong>${BRL(a.transferenciaAParte)}</strong>) paga à parte, na transferência da cota.</div>` : ''}
          ${comparativoHTML(id)}
        </div>
        ${rodapeCard(marca)}
      </div>
      <div class="oferta-actions"><button class="btn primary" data-copiar-card="${id}">📋 Copiar imagem (WhatsApp)</button></div>`;
  }
  // Condições em destaque: "Entrada Parcelada: 1x de R$ ... + 10x de R$ ..." e "De 1 à 27 R$ ... / De 28 à 36 R$ ..."
  // Faixa de números do card. Entrada e parcelas compostas aparecem como "À VISTA R$ x + 10X DE R$ y"
  // e "DE 1 À 10 R$ x + DE 11 À 29 R$ y", com a legenda pequena acima de cada valor.
  function composto(partes) {
    return '<div class="value comp">' + partes.map((p) => `<span class="comp-parte"><span class="comp-leg">${p.leg}</span><span class="comp-val">${p.val}</span></span>`)
      .join('<span class="comp-mais">+</span>') + '</div>';
  }
  function statstripHTML(a) {
    const oport = a.entradaParcelada > 0;
    const per = M.periodosCliente(a);
    const legPer = (p) => p.de === p.ate ? 'No mês ' + p.de : 'De ' + p.de + ' à ' + p.ate;
    const entrada = oport
      ? `<div class="label">Entrada parcelada</div>${composto([{ leg: 'À vista', val: BRL(a.entradaFinal) }].concat(a.faixasEntrada.map((f) => ({ leg: f.n + 'x de', val: BRL(f.v) }))))}`
      : `<div class="label">Entrada</div><div class="value">${BRL(a.entradaFinal)}</div>`;
    const parcelas = per.length > 1
      ? `<div class="label">Parcelas</div>${composto(per.map((p) => ({ leg: legPer(p), val: BRL(p.valor) })))}`
      : `<div class="label">Parcela mensal</div><div class="value">${BRL((per[0] || { valor: a.parcelaInicial }).valor)}</div>`;
    const comp = oport || per.length > 1;
    return `
          <div class="oferta-statstrip${comp ? ' strip-comp' : ''}">
            <div class="oferta-stat">${entrada}</div>
            <div class="oferta-stat">${parcelas}${oport ? '<div class="stat-sub">parcelas da entrada já incluídas</div>' : ''}</div>
            <div class="oferta-stat"><div class="label">Prazo</div><div class="value">${a.prazo}x</div></div>
            <div class="oferta-stat"><div class="label">Taxa mensal</div><div class="value">${fmtTaxa(a.taxaMensal)}</div></div>
            <div class="oferta-stat"><div class="label">Fundo de reserva</div><div class="value fr-value">${BRL(a.fundoReserva)}</div><div class="fr-badge">↩ de retorno</div></div>
          </div>`;
  }
  function comparativoHTML(id) {
    return `<div class="oferta-comparativo" data-comp-id="${id}">
        <button type="button" class="comp-toggle-btn" data-comp="${id}"><span class="comp-title">Comparativo com financiamento</span><span class="comp-chevron">▸</span></button>
        <div class="comp-content"><div class="comp-rate-row"><span>Taxa de juros mensal do financiamento (%)</span><input type="text" inputmode="decimal" class="comp-rate-input" placeholder="ex: 1,50" data-comp-taxa="${id}"></div>
          <div class="comp-results" id="comp-res-${id}"><span class="comp-hint">Informe a taxa de juros do financiamento para comparar.</span></div>
          <div class="comp-disclaimer">Estimativa com Tabela Price no mesmo prazo; sistemas SAC, comuns no crédito imobiliário, podem reduzir o total pago no financiamento.</div></div></div>`;
  }
  function atualizarComparativo(id) {
    const card = $(id); if (!card) return;
    const d = (k) => parseFloat(card.dataset[k]) || 0;
    const valor = d('valor'), entrada = d('entrada'), prazo = d('prazo'), saldo = d('saldo'), extra = d('extra');
    const taxa = num(card.querySelector('.comp-rate-input').value);
    const el = $('comp-res-' + id);
    if (!(taxa > 0) || !(prazo > 0)) { el.innerHTML = '<span class="comp-hint">Informe a taxa de juros do financiamento para comparar.</span>'; return; }
    const i = taxa / 100, principal = Math.max(valor - entrada, 0);
    const parcelaFin = principal * i / (1 - Math.pow(1 + i, -prazo));
    const totalFin = entrada + parcelaFin * prazo;
    const totalCons = entrada + saldo + extra;
    const eco = totalFin - totalCons;
    el.innerHTML = `
      <div class="comp-row"><span>Parcela estimada no financiamento</span><strong>${BRL(parcelaFin)}</strong></div>
      <div class="comp-row"><span>Total pago no financiamento</span><strong>${BRL(totalFin)}</strong></div>
      <div class="comp-row"><span>Saldo devedor do consórcio</span><strong>${BRL(saldo)}</strong></div>
      <div class="comp-row"><span>Total pago no consórcio</span><strong>${BRL(totalCons)}</strong></div>
      <div class="comp-row highlight"><span>Economia estimada com o consórcio</span><strong class="${eco > 0.01 ? 'eco-positive' : (eco < -0.01 ? 'eco-negative' : 'eco-neutral')}">${BRL(eco)}</strong></div>`;
  }
  // Delegação de eventos dos cards (tema, comparativo, copiar)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tema],[data-comp],[data-copiar-card],[data-copiar-art]');
    if (!t) return;
    if (t.dataset.tema) { const c = $(t.dataset.tema); c.classList.toggle('dark'); t.textContent = c.classList.contains('dark') ? '☀️' : '🌙'; }
    if (t.dataset.comp) { const box = t.closest('.oferta-comparativo'); box.classList.toggle('expanded'); box.querySelector('.comp-chevron').textContent = box.classList.contains('expanded') ? '▾' : '▸'; }
    if (t.dataset.copiarCard) copiarImagem($(t.dataset.copiarCard), t, true);
    if (t.dataset.copiarArt) {
      ajustarFonteArte(t.dataset.copiarArt);
      const item = t.closest('.div-item');
      copiarImagem($(t.dataset.copiarArt), t, false, () => { if (item) marcarCopiado(item.dataset.chave, true); });
    }
  });
  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.compTaxa) atualizarComparativo(e.target.dataset.compTaxa); });

  function copiarImagem(el, btn, ehCard, aoCopiar) {
    if (!el) return;
    if (typeof html2canvas === 'undefined') { btn.textContent = '⚠️ Sem internet para gerar a imagem'; return; }
    const original = btn.dataset.orig || btn.textContent; btn.dataset.orig = original;
    btn.textContent = '⏳ Gerando imagem...'; btn.disabled = true;
    if (ehCard) el.classList.add('capturing');
    const fundo = ehCard ? getComputedStyle(el).backgroundColor : '#ffffff';
    html2canvas(el, { backgroundColor: fundo, scale: 2, useCORS: true }).then((canvas) => {
      if (ehCard) el.classList.remove('capturing');
      canvas.toBlob((blob) => {
        const volta = (txt) => { btn.textContent = txt; btn.disabled = false; setTimeout(() => { btn.textContent = btn.dataset.orig || original; }, 3000); };
        if (!blob) return volta('⚠️ Falhou, tente de novo');
        const baixar = () => { const a = document.createElement('a'); a.download = 'proposta-' + Date.now() + '.png'; a.href = canvas.toDataURL('image/png'); a.click(); volta('⬇️ Imagem baixada'); if (aoCopiar) aoCopiar(); };
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => { volta('✅ Copiado! Cole no WhatsApp'); if (aoCopiar) aoCopiar(); }).catch(baixar);
        } else baixar();
      }, 'image/png');
    }).catch(() => { if (ehCard) el.classList.remove('capturing'); btn.textContent = '⚠️ Falhou, tente de novo'; btn.disabled = false; });
  }
  function copiarTexto(texto, btn) {
    const original = btn.dataset.orig || btn.textContent; btn.dataset.orig = original;
    const ok = () => { btn.textContent = '✅ Texto copiado'; setTimeout(() => { btn.textContent = original; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok).catch(() => fallback());
    else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
  }

  /* ===================== BUSCA ===================== */
  $('bObjetivo').innerHTML = Object.keys(M.OBJETIVOS).map((k) => `<option value="${k}">${M.OBJETIVOS[k]}</option>`).join('');
  function ajustarObjetivo() {
    const o = $('bObjetivo').value;
    $('bAlvosWrap').hidden = o !== 'proximo';
    $('bCredito').placeholder = o === 'maior' ? 'opcional (vira o mínimo)' : '0,00';
  }
  $('bObjetivo').addEventListener('change', ajustarObjetivo);
  ajustarObjetivo();

  // Parâmetros de preço de quem está usando: faixas (regra Jairo) ou ágio em % (regra Alfa)
  function agioAtual() {
    const v = num($('bAgio').value);
    return v >= 0 && v <= 30 && $('bAgio').value.trim() !== '' ? v : M.AGIO_ALFA_PCT;
  }
  function paramsPreco() { return regraEU() === 'jairo' ? PREC.get() : { agioPct: agioAtual() }; }
  $('bAgio').addEventListener('input', () => {
    const v = $('bAgio').value.trim();
    $('bAgioAviso').textContent = v === '' || (num(v) >= 0 && num(v) <= 30) ? '' : 'Use um valor entre 0 e 30. Enquanto isso, vale 7%.';
    try { localStorage.setItem('alfa_agio_' + (EU && EU.uid || ''), v); } catch (e) {}
  });
  $('bAgioReset').addEventListener('click', () => { $('bAgio').value = String(M.AGIO_ALFA_PCT); $('bAgio').dispatchEvent(new Event('input')); });

  let OPCOES = [];
  $('btnBuscar').addEventListener('click', () => {
    $('manualWrap').hidden = true;
    const consulta = {
      segmento: $('bSeg').value, credito: num($('bCredito').value), objetivo: $('bObjetivo').value,
      entradaAlvo: num($('bEntAlvo').value), parcelaAlvo: num($('bParcAlvo').value),
      entradaMax: num($('bEntMax').value), parcelaMax: num($('bParcMax').value),
      tolerancia: Math.min(Math.max(num($('bTol').value) || 15, 1), 60) / 100, qtd: +$('bQtd').value,
      regra: regraEU(), params: paramsPreco()
    };
    const out = $('buscaResultados');
    if (!BASE.length) { out.innerHTML = '<div class="message warn">A base de cartas está vazia.</div>'; return; }
    out.innerHTML = '<div class="message info">Buscando...</div>';
    setTimeout(() => {
      const r = M.buscar(BASE, consulta);
      if (r.erro) { out.innerHTML = `<div class="message warn">${esc(r.erro)}</div>`; return; }
      renderResultados(r, consulta);
    }, 20);
  });

  function renderResultados(r, q) {
    const out = $('buscaResultados');
    OPCOES = r.opcoes.concat(r.relaxadas.map((x) => x.opcao));
    let h = `<div class="section-sub" style="margin-bottom:14px;">${r.elegiveis} cartas disponíveis para ${esc(M.SEGMENTOS[q.segmento].nome.toLowerCase())} · objetivo: <strong style="color:var(--ink);">${esc(M.OBJETIVOS[q.objetivo])}</strong></div>`;
    if (!r.elegiveis) h += '<div class="message warn">Não há cartas na base para esse segmento.</div>';
    else if (!r.opcoes.length) {
      h += `<div class="message warn" style="margin-bottom:16px;"><strong>Nenhuma junção atende a todos os critérios.</strong>${r.relaxadas.length ? ' Abaixo, as opções mais próximas, cada uma cedendo em um critério.' : ' Tente aumentar a diferença aceita no crédito ou rever os limites.'}</div>`;
    }
    if (r.capped) h += '<div class="message warn" style="margin-bottom:16px;">A base desse segmento é muito grande: a busca avaliou uma parte ampla das combinações, mas não todas.</div>';
    h += '<div id="listaOpcoes"></div>';
    out.innerHTML = h;
    const lista = $('listaOpcoes');
    r.opcoes.forEach((a, i) => lista.insertAdjacentHTML('beforeend', opcaoHTML(a, i, q, '')));
    r.relaxadas.forEach((x, j) => lista.insertAdjacentHTML('beforeend', opcaoHTML(x.opcao, r.opcoes.length + j, q, x.rotulo)));
    if (OPCOES.length > 1) lista.insertAdjacentHTML('beforeend', tabelaComparativa(OPCOES));
    ligarOpcoes();
  }

  function opcaoHTML(a, i, q, cede) {
    const nForn = M.FORNECEDORES[a.fornecedor] ? M.FORNECEDORES[a.fornecedor].nome : a.fornecedor;
    const delta = q && q.credito > 0 ? a.credito - q.credito : null;
    const jairo = a.regra === 'jairo';
    const acimaTeto = jairo && a.pctEntrada > M.TETO_PCT;
    let badges = '';
    if (cede) badges += `<span class="selo vermelho">cede: ${esc(cede)}</span>`;
    if (a.oportunidade) badges += '<span class="selo verde">Oportunidade</span>';
    if (a.compartilhaCom && a.compartilhaCom.length) badges += `<span class="selo vermelho">usa carta também da opção ${a.compartilhaCom.join(', ')} — só uma pode ser fechada</span>`;
    if (acimaTeto) badges += `<span class="selo vermelho">entrada acima de 35%</span>`;
    const p = a.preco;
    const linhas = [];
    linhas.push(['Entrada dos fornecedores', BRL(a.entradaForn)]);
    if (jairo) {
      linhas.push(['Custo do segmento', '+ ' + BRL(p.custoSegmento)]);
      linhas.push(['Transferência (1%)', '+ ' + BRL(p.transferencia)]);
      linhas.push(['Comissão' + (q && q.params && q.params.parceiro ? ' (com parceiro)' : ''), '+ ' + BRL(p.comissao)]);
      linhas.push(['Divisão da comissão', 'Alpha ' + BRL(p.split.alpha) + ' · Jairo ' + BRL(p.split.jairo) + (p.split.parceiro ? ' · Parceiro ' + BRL(p.split.parceiro) : '')]);
    } else {
      linhas.push(['Ágio (' + String(p.agioPct).replace('.', ',') + '% do crédito)', '+ ' + BRL(p.acrescimo)]);
      linhas.push(['Taxa de transferência (paga à parte)', BRL(a.transferenciaAParte)]);
    }
    linhas.push(['Entrada final' + (a.entradaParcelada > 0 ? ' (à vista)' : ''), BRL(a.entradaFinal) + ' · ' + pct(a.pctEntrada) + ' do crédito']);
    if (a.entradaParcelada > 0) {
      linhas.push(['Parcelas da entrada', fmtFx(a.faixasEntrada) + ' (maior mês: ' + BRL(a.desembolsoMax) + ')']);
      linhas.push(['Entrada total (à vista + parcelas da entrada)', BRL(a.entradaTotal)]);
    }
    linhas.push(['Saldo devedor', BRL(a.saldo)]);
    linhas.push(['Custo total ÷ crédito', (a.custoRelativo * 100).toFixed(1).replace('.', ',') + '%']);
    linhas.push(['Custo efetivo (TIR)', a.tirMensal == null ? '—' : pct(a.tirMensal, 2) + ' a.m. · ' + pct(a.tirAnual, 1) + ' a.a.']);
    linhas.push(['Taxa mensal linear (a do card)', fmtTaxa(a.taxaMensal)]);
    linhas.push(['Fundo de reserva (aprox.)', BRL(a.fundoReserva)]);
    const cotas = a.cotas.map((c) => `<div>${BRL(c.credito)} · entrada ${BRL(c.entrada)}${M.ehOportunidade(c) ? ' + ' + fmtFx(c.entradaParcelas) : ''} · ${fmtFx(c.etapas)} ${selosCarta(c)}</div>`).join('');
    return `
      <div class="op-card" data-op="${i}">
        <div class="op-head"><div class="op-rank">Opção ${i + 1} · ${esc(nForn)} · ${esc(a.adm)} · ${a.cotas.length} carta${a.cotas.length > 1 ? 's' : ''}</div><div>${badges}</div></div>
        <div class="op-stats">
          <div class="op-stat"><div class="label">Crédito</div><div class="value">${BRL(a.credito)}</div>${delta != null ? `<div class="sub ${Math.abs(delta) <= q.credito * 0.03 ? 'pos' : ''}">${delta >= 0 ? '+' : ''}${BRL(delta)} do pedido</div>` : ''}</div>
          <div class="op-stat"><div class="label">Entrada${a.entradaParcelada > 0 ? ' à vista' : ''}</div><div class="value${acimaTeto ? '" style="color:var(--danger-bright);' : ''}">${BRL(a.entradaFinal)}</div><div class="sub">${pct(a.pctEntrada)} do crédito${a.transferenciaAParte > 0 ? ' · + ' + BRL(a.transferenciaAParte) + ' de transferência' : ''}</div></div>
          <div class="op-stat"><div class="label">Parcelas</div><div class="value small">${fmtFx(a.faixas)}</div>${a.entradaParcelada > 0 ? `<div class="sub">+ entrada: ${fmtFx(a.faixasEntrada)}</div>` : ''}</div>
          <div class="op-stat"><div class="label">Prazo</div><div class="value">${a.prazo}x</div></div>
        </div>
        <details class="op-detalhes"><summary>Detalhes para a equipe</summary>
          ${linhas.map((l) => `<div class="pb-row"><span>${l[0]}</span><span>${l[1]}</span></div>`).join('')}
          <div class="cotas-list"><div style="font-family:Inter,sans-serif; color:var(--ink-dim); font-size:11px; text-transform:uppercase; letter-spacing:.05em;">Cotas usadas</div>${cotas}</div>
        </details>
        <div class="op-actions"><button class="btn sm" data-acao="texto">Copiar texto</button><button class="btn sm" data-acao="vertexto">Ver texto</button><button class="btn primary sm" data-acao="card">Gerar card</button></div>
        <div class="card-slot"></div>
      </div>`;
  }
  function tabelaComparativa(ops) {
    return `<div class="stock-card" style="margin-top:6px;"><div class="section-title" style="font-size:16px;">Comparando as opções</div>
      <div class="table-wrap"><table class="data-table comp-table"><thead><tr><th>Opção</th><th>Crédito</th><th>Entrada</th><th>Parcela inicial</th><th>Prazo</th><th>Saldo devedor</th></tr></thead><tbody>
      ${ops.map((a, i) => `<tr><td>${i + 1}</td><td class="mono">${BRL(a.credito)}</td><td class="mono">${BRL(a.entradaFinal)}</td><td class="mono">${BRL(a.parcelaInicial)}</td><td class="mono">${a.prazo}x</td><td class="mono">${BRL(a.saldo)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  function ligarOpcoes() {
    document.querySelectorAll('.op-card [data-acao]').forEach((b) => b.addEventListener('click', () => {
      const box = b.closest('.op-card'); const a = OPCOES[+box.dataset.op]; const slot = box.querySelector('.card-slot');
      if (b.dataset.acao === 'texto') copiarTexto(M.textoProposta(a), b);
      if (b.dataset.acao === 'vertexto') slot.innerHTML = `<div class="texto-copia">${esc(M.textoProposta(a))}</div>`;
      if (b.dataset.acao === 'card') slot.innerHTML = cardPropostaHTML('card-op-' + box.dataset.op + '-' + Date.now(), a, marcaEU());
    }));
  }

  /* ---------------- Montar manualmente ---------------- */
  const MANUAL = new Set();
  $('btnManual').addEventListener('click', () => { $('manualWrap').hidden = !$('manualWrap').hidden; if (!$('manualWrap').hidden) { preencherFiltrosManual(); renderManual(); } });
  $('bSeg').addEventListener('change', () => { MANUAL.clear(); if (!$('manualWrap').hidden) { preencherFiltrosManual(); renderManual(); } });
  function preencherFiltrosManual() {
    const lista = M.cartasDoSegmento(BASE, $('bSeg').value);
    const vF = $('mFornecedor').value, vA = $('mAdm').value;
    const forns = [...new Set(lista.map((c) => c.fornecedor))];
    const adms = [...new Set(lista.map((c) => c.adm))].sort();
    $('mFornecedor').innerHTML = '<option value="">Todos os fornecedores</option>' + forns.map((f) => `<option value="${f}">${M.FORNECEDORES[f] ? M.FORNECEDORES[f].nome : f}</option>`).join('');
    $('mAdm').innerHTML = '<option value="">Todas as administradoras</option>' + adms.map((a) => `<option>${esc(a)}</option>`).join('');
    if (forns.includes(vF)) $('mFornecedor').value = vF;
    if (adms.includes(vA)) $('mAdm').value = vA;
  }
  function renderManual() {
    const f = $('mFornecedor').value, a = $('mAdm').value, b = num($('mBusca').value);
    let lista = M.cartasDoSegmento(BASE, $('bSeg').value).filter((c) => (!f || c.fornecedor === f) && (!a || c.adm === a));
    if (b > 0) lista = lista.filter((c) => Math.abs(c.credito - b) <= b * 0.15);
    lista.sort((x, y) => x.credito - y.credito);
    const mostrar = lista.slice(0, 300);
    let h = '<thead><tr><th></th><th>Fornecedor</th><th>Administradora</th><th>Crédito</th><th>Entrada</th><th>Parcelas</th><th>Prazo</th><th></th></tr></thead><tbody>';
    mostrar.forEach((c) => {
      const on = MANUAL.has(c.id);
      h += `<tr class="${on ? 'sel-row' : ''}"><td><input type="checkbox" data-mid="${esc(c.id)}"${on ? ' checked' : ''}></td><td>${M.FORNECEDORES[c.fornecedor] ? M.FORNECEDORES[c.fornecedor].nome : ''}</td><td>${esc(c.adm)}</td>
        <td class="mono">${BRL(c.credito)}</td><td class="mono">${BRL(c.entrada)}</td><td class="mono" style="white-space:normal;">${parcelasCartaTxt(c)}</td><td class="mono">${M.prazo(c)}x</td><td>${selosCarta(c)}</td></tr>`;
    });
    if (!mostrar.length) h += '<tr><td colspan="8" class="lote-vazio">Nenhuma carta com esses filtros.</td></tr>';
    $('mTabela').innerHTML = h + '</tbody>';
    $('mTabela').querySelectorAll('[data-mid]').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) MANUAL.add(cb.dataset.mid); else MANUAL.delete(cb.dataset.mid);
      cb.closest('tr').classList.toggle('sel-row', cb.checked); resumoManual();
    }));
    resumoManual();
  }
  function cotasManual() { return BASE.filter((c) => MANUAL.has(c.id)); }
  function resumoManual() {
    const cs = cotasManual();
    const tot = cs.reduce((s, c) => s + c.credito, 0);
    const erro = cs.length ? M.validarJuncao(cs) : '';
    $('mResumo').innerHTML = cs.length ? `${cs.length} carta(s) · crédito ${BRL(tot)}${erro ? ` · <span style="color:var(--danger-bright);">${esc(erro)}</span>` : ''}` : 'Nenhuma carta marcada.';
  }
  ['mFornecedor', 'mAdm'].forEach((id) => $(id).addEventListener('change', renderManual));
  $('mBusca').addEventListener('input', renderManual);
  $('mLimpar').addEventListener('click', () => { MANUAL.clear(); renderManual(); });
  $('mCalcular').addEventListener('click', () => {
    const cs = cotasManual();
    const erro = M.validarJuncao(cs);
    if (erro) { $('buscaResultados').innerHTML = `<div class="message warn">${esc(erro)}</div>`; return; }
    const a = M.avaliar(cs, { regra: regraEU(), params: paramsPreco(), segmento: $('bSeg').value });
    a.compartilhaCom = [];
    OPCOES = [a];
    $('buscaResultados').innerHTML = '<div class="section-sub" style="margin-bottom:14px;">Cálculo das cartas escolhidas</div>' + opcaoHTML(a, 0, { credito: 0, params: paramsPreco() }, '');
    ligarOpcoes();
    $('buscaResultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ===================== DIVULGAÇÃO (só administrador) ===================== */
  // Artes com a identidade Jairo Vieira. Posições em % da imagem (xPct = borda esquerda do texto; yPct = centro).
  const ARTES = {
    motos: { nome: 'Motos', img: 'assets/divulgacao_template_5.jpg',
      pos: { valorCarta: { xPct: 63.4, yPct: 38.2 }, entrada: { xPct: 63.4, yPct: 49.2 }, parcela: { xPct: 63.4, yPct: 59.8 }, prazo: { xPct: 63.4, yPct: 70.3 }, taxaMensal: { xPct: 56.8, yPct: 82.4 }, fundoReserva: { xPct: 79.8, yPct: 82.4 } },
      larguraDisp: { taxaMensal: 13.8, fundoReserva: 13.8 }, admLogoPos: { topPct: 34.0, rightPct: 4.6 } },
    solar: { nome: 'Energia Solar', img: 'assets/divulgacao_template_7.jpg',
      pos: { valorCarta: { xPct: 63.1, yPct: 41.4 }, entrada: { xPct: 63.4, yPct: 50.4 }, parcela: { xPct: 63.5, yPct: 59.5 }, prazo: { xPct: 63.5, yPct: 68.4 }, taxaMensal: { xPct: 56.8, yPct: 79.4 }, fundoReserva: { xPct: 79.5, yPct: 79.4 } },
      larguraDisp: { taxaMensal: 14.3, fundoReserva: 14.4 }, admLogoPos: { topPct: 37.8, rightPct: 4.4 } },
    implementos: { nome: 'Implementos Rodoviários', img: 'assets/divulgacao_template_6.jpg',
      pos: { valorCarta: { xPct: 63.2, yPct: 39.4 }, entrada: { xPct: 63.3, yPct: 48.2 }, parcela: { xPct: 63.3, yPct: 57.0 }, prazo: { xPct: 63.4, yPct: 65.9 }, taxaMensal: { xPct: 56.6, yPct: 77.6 }, fundoReserva: { xPct: 79.5, yPct: 77.6 } },
      larguraDisp: { taxaMensal: 14.1, fundoReserva: 14.5 }, admLogoPos: { topPct: 36.0, rightPct: 4.1 },
      promo: { img: 'assets/divulgacao_promo_implementos.jpg', pos: { valorCarta: { xPct: 56.3, yPct: 27.7, fontPct: 3.2, maxW: 39 }, entradaCheia: { xPct: 56.4, yPct: 43.8, fontPct: 3.2, maxW: 39, strike: true }, entradaPromo: { xPct: 74.8, yPct: 56.7, fontPct: 4.9, maxW: 40, align: 'center', destaque: true }, economia: { xPct: 87.7, yPct: 65.0, fontPct: 2.4, maxW: 12.4, align: 'center' }, parcela: { xPct: 62.1, yPct: 78.8, fontPct: 2.6, maxW: 15.6, align: 'center' }, prazo: { xPct: 85.3, yPct: 78.8, fontPct: 2.6, maxW: 17, align: 'center' } }, admLogoPos: { topPct: 23.4, rightPct: 4.5 } } },
    leves: { nome: 'Veículos Leves', img: 'assets/divulgacao_template_1.jpg',
      pos: { valorCarta: { xPct: 60.8, yPct: 41.7 }, entrada: { xPct: 60.8, yPct: 50.6 }, parcela: { xPct: 61.0, yPct: 59.6 }, prazo: { xPct: 61.0, yPct: 68.7 }, taxaMensal: { xPct: 54.2, yPct: 80.1 }, fundoReserva: { xPct: 77.2, yPct: 80.1 } },
      larguraDisp: { taxaMensal: 13.6, fundoReserva: 15.8 }, admLogoPos: { topPct: 38.2, rightPct: 5.3 } },
    pesados: { nome: 'Veículos Pesados', img: 'assets/divulgacao_template_2.jpg',
      pos: { valorCarta: { xPct: 63.3, yPct: 41.5 }, entrada: { xPct: 63.5, yPct: 50.5 }, parcela: { xPct: 63.6, yPct: 59.6 }, prazo: { xPct: 63.6, yPct: 68.4 }, taxaMensal: { xPct: 56.9, yPct: 79.5 }, fundoReserva: { xPct: 79.7, yPct: 79.4 } },
      larguraDisp: { taxaMensal: 14.4, fundoReserva: 14.4 }, admLogoPos: { topPct: 37.9, rightPct: 4.3 } },
    maquinas: { nome: 'Máquinas da Linha Amarela', img: 'assets/divulgacao_template_3.jpg',
      pos: { valorCarta: { xPct: 63.3, yPct: 41.9 }, entrada: { xPct: 63.5, yPct: 50.7 }, parcela: { xPct: 63.6, yPct: 59.8 }, prazo: { xPct: 63.7, yPct: 68.5 }, taxaMensal: { xPct: 56.9, yPct: 79.4 }, fundoReserva: { xPct: 79.7, yPct: 79.4 } },
      larguraDisp: { taxaMensal: 14.4, fundoReserva: 14.3 }, admLogoPos: { topPct: 38.3, rightPct: 4.3 } },
    imoveis: { nome: 'Imobiliário', img: 'assets/divulgacao_template_4.jpg',
      pos: { valorCarta: { xPct: 63.2, yPct: 41.5 }, entrada: { xPct: 63.4, yPct: 50.5 }, parcela: { xPct: 63.5, yPct: 59.5 }, prazo: { xPct: 63.6, yPct: 68.4 }, taxaMensal: { xPct: 56.9, yPct: 79.4 }, fundoReserva: { xPct: 79.6, yPct: 79.5 } },
      larguraDisp: { taxaMensal: 14.3, fundoReserva: 14.3 }, admLogoPos: { topPct: 38.0, rightPct: 4.4 } }
  };
  const ORDEM_SEG = ['leves', 'pesados', 'motos', 'maquinas', 'implementos', 'solar', 'imoveis'];
  const FONT_PCT = 2.6, ADM_LOGO_W = 11;
  const DIV_POR_PAGINA = 6;

  // Artes novas (1122 x 1402): cada campo é a caixa branca medida na arte, em pixels [x, y, largura, altura]
  const ART_W = 1122, ART_H = 1402;
  const PROMO2 = {
    leves: { img: 'assets/divulgacao_promo2_leves.jpg', logo: [430, 533, 83, 36], valor: [75, 586, 452, 64], cheia: [155, 726, 307, 68], apenas: [493, 771, 547, 129], eco: [652, 956, 201, 50], parcela: [177, 1104, 336, 73], prazo: [715, 1104, 334, 74] },
    pesados: { img: 'assets/divulgacao_promo2_pesados.jpg', logo: [430, 533, 82, 37], valor: [75, 587, 449, 64], cheia: [156, 725, 308, 69], apenas: [492, 768, 544, 130], eco: [649, 950, 205, 51], parcela: [177, 1100, 334, 75], prazo: [714, 1100, 333, 74] },
    imoveis: { img: 'assets/divulgacao_promo2_imoveis.jpg', logo: [431, 533, 82, 37], valor: [75, 587, 450, 64], cheia: [156, 725, 309, 69], apenas: [492, 767, 545, 131], eco: [649, 949, 206, 53], parcela: [177, 1099, 334, 75], prazo: [714, 1100, 333, 74] },
    maquinas: { img: 'assets/divulgacao_promo2_maquinas.jpg', logo: [432, 534, 81, 37], valor: [75, 586, 451, 65], cheia: [156, 725, 309, 68], apenas: [493, 769, 545, 130], eco: [650, 951, 204, 51], parcela: [177, 1103, 334, 74], prazo: [715, 1103, 333, 74] }
  };
  const OPORT = {
    pesados: { img: 'assets/divulgacao_oport_pesados.jpg', ent: [597, 633, 404, 106], tot: [615, 759, 199, 53], cred: [70, 925, 273, 65], parcela: [437, 925, 257, 65], prazo: [787, 925, 265, 65], valid: [681, 1033, 154, 41], logoY: 889 },
    leves: { img: 'assets/divulgacao_oport_leves.jpg', ent: [595, 658, 424, 105], tot: [614, 783, 205, 55], cred: [72, 952, 272, 68], parcela: [438, 952, 255, 68], prazo: [786, 952, 264, 68], valid: [680, 1060, 154, 42], logoY: 914 },
    solar: { img: 'assets/divulgacao_oport_solar.jpg', ent: [596, 600, 378, 106], tot: [615, 725, 199, 54], cred: [70, 892, 274, 66], parcela: [437, 892, 257, 66], prazo: [787, 892, 264, 66], valid: [681, 1000, 154, 42], logoY: 857 },
    imoveis: { img: 'assets/divulgacao_oport_imoveis.jpg', ent: [596, 600, 408, 106], tot: [615, 725, 199, 54], cred: [70, 892, 274, 65], parcela: [437, 892, 257, 65], prazo: [787, 892, 265, 65], valid: [681, 1000, 153, 42], logoY: 857 },
    implementos: { img: 'assets/divulgacao_oport_implementos.jpg', ent: [596, 633, 406, 105], tot: [615, 759, 199, 53], cred: [70, 925, 274, 65], parcela: [437, 925, 257, 65], prazo: [786, 925, 266, 65], valid: [681, 1033, 153, 41], logoY: 890 },
    maquinas: { img: 'assets/divulgacao_oport_maquinas.jpg', ent: [596, 633, 379, 105], tot: [615, 758, 199, 54], cred: [70, 925, 274, 65], parcela: [437, 925, 257, 65], prazo: [787, 925, 265, 65], valid: [681, 1033, 154, 41], logoY: 890 },
    motos: { img: 'assets/divulgacao_oport_motos.jpg', ent: [595, 657, 395, 106], tot: [614, 783, 198, 55], cred: [71, 952, 273, 68], parcela: [437, 952, 257, 68], prazo: [786, 951, 263, 68], valid: [680, 1060, 153, 41], logoY: 916 }
  };
  const pctBox = (r) => `left:${r[0] / ART_W * 100}%; top:${r[1] / ART_H * 100}%; width:${r[2] / ART_W * 100}%; height:${r[3] / ART_H * 100}%;`;
  // k = tamanho da letra em relação à altura da caixa
  const campo = (r, html, k, extra) => `<div class="df-box${extra ? ' ' + extra : ''}" data-k="${k || 0.5}" style="${pctBox(r)}">${html}</div>`;
  const dataMais = (dias) => { const d = new Date(Date.now() + dias * 86400000); return d.toLocaleDateString('pt-BR'); };

  function arteHTML(id, it, modo) {
    const c = it.carta;
    const logo = M.logoAdm(c.adm);
    if (modo === 'o' || (modo === 'p' && PROMO2[it.seg])) {
      const L = modo === 'o' ? OPORT[it.seg] : PROMO2[it.seg];
      const f = [];
      if (modo === 'p') {
        f.push(campo(L.valor, BRL(c.credito)), campo(L.cheia, `<span class="df-strike">${BRL(it.entradaCheia)}<i class="df-strike-line"></i></span>`), campo(L.apenas, BRL(it.entradaFinal), 0.42),
          campo(L.eco, BRL(Math.max(it.economia, 0))), campo(L.parcela, BRL(it.parcela)), campo(L.prazo, it.prazo + 'x'));
        if (logo) f.push(`<div class="df-logo" style="${pctBox(L.logo)}"><img src="${logo}" alt=""></div>`);
      } else {
        // Entrada à vista em destaque; parcelas da entrada embaixo, menores
        const parcEnt = (it.entradaParcelas || []).map((e) => `<div class="df-sub">+ ${e.n}x de ${BRL(e.v)}</div>`).join('');
        f.push(campo(L.ent, `<div class="df-destaque">${BRL(it.entradaFinal)}</div>${parcEnt}`, parcEnt ? 0.3 : 0.42, 'df-col'),
          campo(L.tot, BRL(it.entradaTotal)), campo(L.cred, BRL(c.credito)), campo(L.parcela, BRL(it.parcela)), campo(L.prazo, it.prazo + 'x'),
          campo(L.valid, `<span contenteditable="true" spellcheck="false" title="Clique para mudar a data">${esc(it.vencimento || dataMais(7))}</span>`, 0.55));
        if (logo) f.push(`<div class="df-logo df-chip" style="${pctBox([287, L.logoY - 21, 96, 42])}"><img src="${logo}" alt=""></div>`);
      }
      return `<div class="div-preview-container" id="${id}" style="height:0; padding-top:${ART_H / ART_W * 100}%;"><img class="div-base" src="${L.img}" data-arte="${id}">${f.join('')}</div>`;
    }
    return arteAntigaHTML(id, it, modo === 'p');
  }

  // Artes antigas (cards normais e o promocional de implementos), posicionadas por ponto
  function arteAntigaHTML(id, it, promo) {
    const arte = ARTES[it.seg];
    const layout = promo ? arte.promo : arte;
    const larg = promo ? {} : (arte.larguraDisp || {});
    const ov = (k, texto) => {
      const p = layout.pos[k]; if (!p) return '';
      const centro = p.align === 'center';
      const cor = p.destaque ? '#f3c76b' : '#1e1712';
      const sombra = p.destaque ? '0 2px 10px rgba(0,0,0,0.8)' : '0 1px 3px rgba(255,255,255,0.5)';
      const conteudo = p.strike ? `<span class="df-strike">${texto}<i class="df-strike-line"></i></span>` : texto;
      return `<div class="div-field-overlay${centro ? ' center' : ''}" data-fs="${p.fontPct || FONT_PCT}" data-maxw="${p.maxW || larg[k] || ''}" style="left:${p.xPct}%; top:${p.yPct}%; text-align:${centro ? 'center' : 'left'}; font-family:'JetBrains Mono',monospace; font-weight:800; color:${cor}; text-shadow:${sombra};">${conteudo}</div>`;
    };
    const c = it.carta;
    const ovs = [ov('valorCarta', BRL(c.credito)), ov('parcela', BRL(it.parcela)), ov('prazo', it.prazo + 'x')];
    if (promo) {
      ovs.push(ov('entradaCheia', BRL(it.entradaCheia)), ov('entradaPromo', BRL(it.entradaFinal)), ov('economia', BRL(Math.max(it.economia, 0))));
    } else {
      ovs.push(ov('entrada', BRL(it.entradaFinal)), ov('taxaMensal', it.taxaMensal == null ? 'a confirmar' : it.taxaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'), ov('fundoReserva', BRL(it.fundoReserva)));
    }
    const logo = M.logoAdm(c.adm);
    if (logo) { const lp = layout.admLogoPos; ovs.push(`<img src="${logo}" class="div-adm-logo" style="position:absolute; z-index:3; top:${lp.topPct}%; right:${lp.rightPct}%; transform:translateY(-50%);">`); }
    return `<div class="div-preview-container" id="${id}" style="height:0; padding-top:150%;"><img class="div-base" src="${layout.img}" data-arte="${id}">${ovs.join('')}</div>`;
  }
  function ajustarFonteArte(id) {
    const box = $(id); if (!box) return;
    const w = box.getBoundingClientRect().width; if (!w) return;
    box.querySelectorAll('.div-field-overlay').forEach((el) => {
      let t = w * ((parseFloat(el.dataset.fs) || FONT_PCT) / 100);
      el.style.fontSize = t + 'px';
      const mw = parseFloat(el.dataset.maxw); if (!mw) return;
      while (el.scrollWidth > w * (mw / 100) && t > 6) { t -= 0.5; el.style.fontSize = t + 'px'; }
    });
    // campos por caixa: letra proporcional à altura da caixa, encolhe se não couber na largura
    box.querySelectorAll('.df-box').forEach((el) => {
      const h = el.getBoundingClientRect().height;
      let t = h * (parseFloat(el.dataset.k) || 0.5);
      el.style.fontSize = t + 'px';
      while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && t > 6) { t -= 0.5; el.style.fontSize = t + 'px'; }
    });
    const lg = box.querySelector('.div-adm-logo'); if (lg) lg.style.width = (w * ADM_LOGO_W / 100) + 'px';
  }
  function ajustarTodasArtes() { document.querySelectorAll('#divResultados .div-preview-container').forEach((b) => ajustarFonteArte(b.id)); }
  window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(ajustarTodasArtes, 150); });

  let DIV = null;
  // Cards já copiados: ficam salvos no banco (valem no celular e no computador)
  let COPIADOS = null;
  const chaveDiv = (it, modo) => M.assinatura(it.carta) + '|' + it.seg + '|' + modo;
  // Também guarda neste aparelho, para a marca nunca se perder se o banco falhar
  let AVISO_COPIADOS = '';
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem('alfa_copiados') || '{}'); } catch (e) { return {}; } };
  const gravarLocal = () => { try { localStorage.setItem('alfa_copiados', JSON.stringify(COPIADOS)); } catch (e) {} };
  async function carregarCopiados() {
    const local = lerLocal();
    let remoto = {};
    try { const fb = await fbx(); const s = await fb.getDoc(fb.doc(fb.db, 'divulgacao', 'copiados')); remoto = s.exists() ? (s.data().itens || {}) : {}; AVISO_COPIADOS = ''; }
    catch (e) { AVISO_COPIADOS = avisoRegra(e); }
    COPIADOS = Object.assign({}, local, remoto, COPIADOS || {});
  }
  function avisoRegra(e) {
    return (e && e.code === 'permission-denied')
      ? '⚠️ Marcas salvas só neste aparelho: falta colar a regra "divulgacao" no Firebase.'
      : '⚠️ Marcas salvas só neste aparelho (sem conexão com o banco).';
  }
  async function salvarCopiados() {
    const lim = Date.now() - 90 * 86400000; // marcas com mais de 90 dias saem
    Object.keys(COPIADOS).forEach((k) => { if (Date.parse(COPIADOS[k]) < lim) delete COPIADOS[k]; });
    gravarLocal();
    try { const fb = await fbx(); await fb.setDoc(fb.doc(fb.db, 'divulgacao', 'copiados'), { itens: COPIADOS, atualizadoEm: new Date().toISOString() }); AVISO_COPIADOS = ''; }
    catch (e) { AVISO_COPIADOS = avisoRegra(e); }
    resumoDiv();
  }
  function tagCopiado(iso) { const d = new Date(iso); return `<span class="tag-copiado">✓ Copiado em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>`; }
  function estadoItem(el) {
    const iso = COPIADOS && COPIADOS[el.dataset.chave];
    el.classList.toggle('copiado', !!iso);
    el.querySelector('.slot-copiado').innerHTML = iso ? tagCopiado(iso) : '';
    el.querySelector('.desmarcar').hidden = !iso;
    const b = el.querySelector('[data-copiar-art]');
    b.dataset.orig = iso ? '📋 Copiar de novo' : '📋 Copiar imagem';
    if (!/^(✅|⬇️|⏳)/.test(b.textContent)) b.textContent = b.dataset.orig;
  }
  async function marcarCopiado(chave, sim) {
    if (!COPIADOS) COPIADOS = {};
    if (sim) COPIADOS[chave] = new Date().toISOString(); else delete COPIADOS[chave];
    document.querySelectorAll('#divResultados .div-item').forEach((el) => { if (el.dataset.chave === chave) estadoItem(el); });
    resumoDiv();
    await salvarCopiados();
  }
  function resumoDiv() {
    const itens = [...document.querySelectorAll('#divResultados .div-item')];
    let total = 0, ja = 0;
    if (DIV) ORDEM_SEG.forEach((seg) => { const s = DIV.segmentos[seg]; if (!s) return;
      s.promo.forEach((it) => { total++; if (COPIADOS && COPIADOS[chaveDiv(it, 'p')]) ja++; });
      s.normal.forEach((it) => { total++; if (COPIADOS && COPIADOS[chaveDiv(it, 'n')]) ja++; }); });
    if (DIV) DIV.oportunidades.forEach((it) => { total++; if (COPIADOS && COPIADOS[chaveDiv(it, 'o')]) ja++; });
    $('divResumo').textContent = (total ? `${total} cards prontos · ${ja} já copiado${ja === 1 ? '' : 's'}` + (DIV.oportunidades.length ? ' (' + DIV.oportunidades.length + ' de Oportunidade)' : '') : '') + (DIV && DIV.foraParcela ? ` · ${DIV.foraParcela} fora pela parcela` : '') + (AVISO_COPIADOS ? '  ' + AVISO_COPIADOS : '');
    return itens;
  }
  function itemDivHTML(it, modo, k) {
    const id = 'arte-' + it.seg + '-' + k + '-' + modo;
    const c = it.carta;
    const chave = chaveDiv(it, modo);
    const iso = COPIADOS && COPIADOS[chave];
    const tag = modo === 'p' ? '<span class="tag-promo">Promocional</span>' : (modo === 'o' ? '<span class="tag-promo">Oportunidade · ' + ARTES[it.seg].nome + '</span>' : '');
    const extra = modo === 'p' ? ' · economia ' + BRL(it.economia) : (modo === 'o' ? ' · entrada total ' + BRL(it.entradaTotal) + ' · clique na data para mudar a validade' : '');
    return `<div class="div-item${iso ? ' copiado' : ''}" data-chave="${esc(chave)}">${tag}<span class="slot-copiado">${iso ? tagCopiado(iso) : ''}</span>
      ${arteHTML(id, it, modo)}
      <div class="meta">${M.FORNECEDORES[c.fornecedor] ? M.FORNECEDORES[c.fornecedor].nome : ''} · ${esc(c.adm)} · entrada ${pct(it.pctEntrada)} · parcela ${pct(it.pctParcela)}${extra}${c.codigo ? ' · cota ' + esc(c.codigo) : ''}</div>
      <button class="btn primary sm" data-copiar-art="${id}">${iso ? '📋 Copiar de novo' : '📋 Copiar imagem'}</button>
      <button class="desmarcar"${iso ? '' : ' hidden'}>desmarcar como copiado</button></div>`;
  }
  // Parcela máxima por segmento (% do crédito): editável, salva no banco junto com a divulgação
  let TETOS = null;
  const NOMES_SEG = { motos: 'Motos', solar: 'Energia solar', leves: 'Veículos leves', implementos: 'Implementos', pesados: 'Caminhões', maquinas: 'Máquinas', imoveis: 'Imóveis' };
  const fmtNum = (n) => String(n).replace('.', ',');
  async function carregarTetos() {
    if (TETOS) return;
    TETOS = Object.assign({}, M.PARCELA_PCT_PADRAO);
    try { const l = JSON.parse(localStorage.getItem('alfa_tetos') || 'null'); if (l) Object.assign(TETOS, l); } catch (e) {}
    try { const fb = await fbx(); const s = await fb.getDoc(fb.doc(fb.db, 'divulgacao', 'config')); if (s.exists() && s.data().parcelaPct) Object.assign(TETOS, s.data().parcelaPct); } catch (e) {}
    montarCamposTetos();
  }
  function montarCamposTetos() {
    $('divTetosCampos').innerHTML = Object.keys(NOMES_SEG).map((k) => `<div class="field"><label for="teto-${k}">${NOMES_SEG[k]}</label><div class="input-row"><span class="prefix">%</span><input type="text" inputmode="decimal" id="teto-${k}" data-seg="${k}" value="${fmtNum(TETOS[k])}"></div></div>`).join('');
    $('divTetosResumo').textContent = Object.keys(NOMES_SEG).map((k) => NOMES_SEG[k] + ' ' + fmtNum(TETOS[k]) + '%').join(' · ');
  }
  $('btnSalvarTetos').addEventListener('click', async () => {
    const novos = {};
    let erro = '';
    document.querySelectorAll('#divTetosCampos input').forEach((i) => { const v = num(i.value); if (!(v > 0 && v <= 20)) erro = 'Use valores entre 0,1 e 20.'; novos[i.dataset.seg] = v; });
    if (erro) { $('divTetosMsg').textContent = erro; return; }
    TETOS = novos; montarCamposTetos();
    try { localStorage.setItem('alfa_tetos', JSON.stringify(TETOS)); } catch (e) {}
    try { const fb = await fbx(); await fb.setDoc(fb.doc(fb.db, 'divulgacao', 'config'), { parcelaPct: TETOS, atualizadoEm: new Date().toISOString() }); $('divTetosMsg').textContent = 'Salvo.'; }
    catch (e) { $('divTetosMsg').textContent = 'Salvo só neste aparelho (' + traduzErro(e) + ').'; }
    gerarDivulgacao();
  });
  $('btnTetosPadrao').addEventListener('click', () => { TETOS = Object.assign({}, M.PARCELA_PCT_PADRAO); montarCamposTetos(); $('divTetosMsg').textContent = 'Padrão restaurado. Clique em salvar para aplicar.'; });

  async function gerarDivulgacao() {
    if (!ehAdmin()) return;
    await carregarCopiados();
    await carregarTetos();
    DIV = M.selecionarDivulgacao(BASE, { parcelaPct: TETOS });
    const out = $('divResultados');
    let h = '', total = 0;
    ORDEM_SEG.forEach((seg) => {
      const s = DIV.segmentos[seg]; if (!s) return;
      total += s.promo.length + s.normal.length;
      h += `<div class="div-seg" data-seg="${seg}"><div class="div-seg-head"><div class="section-title" style="margin:0;">${ARTES[seg].nome}</div>
        <span class="section-sub" style="margin:0;">${s.promo.length} promocional · ${s.normal.length} normal</span></div><div class="div-grid">`;
      s.promo.forEach((it, k) => { h += itemDivHTML(it, 'p', k); });
      s.normal.slice(0, DIV_POR_PAGINA).forEach((it, k) => { h += itemDivHTML(it, 'n', k); });
      h += '</div>';
      if (s.normal.length > DIV_POR_PAGINA) h += `<div class="btn-row" style="margin-top:14px;"><button class="btn sm" data-mais="${seg}">Mostrar todos (${s.normal.length})</button></div>`;
      h += '</div>';
    });
    // Oportunidades: todas entram (uma arte por segmento em que a carta se encaixa)
    if (DIV.oportunidades.length) {
      h += `<div class="div-seg" data-seg="oport"><div class="div-seg-head"><div class="section-title" style="margin:0;">Oportunidades</div><span class="section-sub" style="margin:0;">${DIV.oportunidades.length} card(s)</span></div><div class="div-grid">`;
      DIV.oportunidades.forEach((it, k) => { h += itemDivHTML(it, 'o', k); });
      h += '</div></div>';
    }
    out.innerHTML = h || '<div class="message warn">Nenhuma carta da base entra nos critérios de divulgação agora.</div>';
    resumoDiv();
    out.querySelectorAll('[data-mais]').forEach((b) => b.addEventListener('click', () => {
      const seg = b.dataset.mais, s = DIV.segmentos[seg];
      const grid = out.querySelector(`.div-seg[data-seg="${seg}"] .div-grid`);
      grid.insertAdjacentHTML('beforeend', s.normal.slice(DIV_POR_PAGINA).map((it, k) => itemDivHTML(it, 'n', k + DIV_POR_PAGINA)).join(''));
      b.parentElement.remove(); prepararArtes();
    }));
    prepararArtes();
  }
  function prepararArtes() {
    document.querySelectorAll('#divResultados img[data-arte]').forEach((img) => {
      if (img.dataset.ok) return; img.dataset.ok = '1';
      const pronto = () => { const box = $(img.dataset.arte); if (box && img.naturalWidth) box.style.paddingTop = (img.naturalHeight / img.naturalWidth * 100) + '%'; requestAnimationFrame(() => ajustarFonteArte(img.dataset.arte)); };
      if (img.complete) pronto(); else img.addEventListener('load', pronto);
    });
  }
  $('btnGerarDiv').addEventListener('click', gerarDivulgacao);
  $('divOcultarCopiados').addEventListener('change', (e) => { $('divResultados').classList.toggle('ocultar-copiados', e.target.checked); });
  $('divResultados').addEventListener('click', (e) => {
    const b = e.target.closest('.desmarcar'); if (!b) return;
    marcarCopiado(b.closest('.div-item').dataset.chave, false);
  });

  /* ===================== CONSÓRCIO NOVO (só administrador) ===================== */
  const NOVO_ICONES = {
    carro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><path d="M3.5 11h17a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1z"/><path d="M5 17.5V19M19 17.5V19"/><circle cx="7" cy="14.2" r="1"/><circle cx="17" cy="14.2" r="1"/></svg>',
    moto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5l4-6h5l4 6"/><path d="M14.5 10.5L13 6.5h2.5M9.5 10.5L8 8H5.5"/></svg>',
    imovel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3.5l9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/></svg>',
    caminhao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 9.5h4l3 3.5v3.5h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    servicos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.2-.6-.6-2.2z"/></svg>',
    adm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 4l9 5.5"/><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7"/><path d="M3 20h18"/></svg>',
    parcela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="2.2"/><path d="M9 3.5v2M12 3v2.5M15 3.5v2"/></svg>',
    prazo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"/></svg>',
    taxa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 17l6-6"/><circle cx="9.5" cy="11.5" r="1"/><circle cx="14.5" cy="16.5" r="1"/></svg>'
  };
  $('admNovo').innerHTML = M.ADMS.map((a) => `<option>${esc(a.nome)}</option>`).join('');
  $('admNovo').value = 'Bradesco Consórcios';
  function renderNovo() {
    const id = 'oferta-novo';
    const antigo = $(id); const claro = antigo && !antigo.classList.contains('dark');
    const d = {
      tipo: $('novoTipo').value, valor: num($('novoValor').value), status: $('novoStatus').value, adm: $('admNovo').value,
      parcela: num($('novoParcela').value), tipoParcela: $('novoTipoParcela').value, prazo: num($('novoPrazo').value),
      taxa: num($('novoTaxaAdm').value), periodo: $('novoTaxaPeriodo').value
    };
    const item = (ic, label, valor, sub) => `<div class="novo-item"><div class="novo-item-icon">${NOVO_ICONES[ic]}</div><div style="min-width:0;"><div class="label">${label}</div><div class="value">${valor}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
    const logo = M.logoAdm(d.adm);
    const admHTML = logo ? `<div class="novo-adm-chip"><img src="${logo}" alt="${esc(d.adm)}"></div>` : esc(d.adm || 'a confirmar');
    const taxaTxt = d.taxa > 0 ? d.taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%' + (d.periodo === 'total' ? ' total' : ' ' + d.periodo) : 'a confirmar';
    $('ofertaNovoWrap').innerHTML = `
      <div class="oferta-card dark" id="${id}">
        ${cabecalhoCard(id, 'jairo', 'Consórcio novo')}
        <div class="oferta-body">
          <div class="novo-hero"><div class="novo-hero-icon">${NOVO_ICONES[d.tipo] || NOVO_ICONES.carro}</div>
            <div><div class="label">Valor total da carta:</div><div class="valor">${d.valor > 0 ? BRL(d.valor) : 'R$ —'}</div>${d.status ? `<div class="status">${esc(d.status)}</div>` : ''}</div></div>
          <div class="novo-grid">
            ${item('adm', 'Administradora', admHTML)}
            ${item('parcela', 'Valor da parcela', d.parcela > 0 ? BRL(d.parcela) : 'a confirmar', d.tipoParcela ? '*' + esc(d.tipoParcela) : '')}
            ${item('prazo', 'Parcelas', d.prazo > 0 ? Math.round(d.prazo) : 'a confirmar')}
            ${item('taxa', 'Taxa de adm', taxaTxt)}
          </div>
        </div>
        ${rodapeCard('jairo')}
      </div>
      <div class="oferta-actions"><button class="btn primary" data-copiar-card="${id}">📋 Copiar imagem (WhatsApp)</button></div>`;
    if (claro) { $(id).classList.remove('dark'); const tb = $(id).querySelector('[data-tema]'); if (tb) tb.textContent = '🌙'; }
  }
  ['novoTipo', 'admNovo', 'novoValor', 'novoStatus', 'novoParcela', 'novoTipoParcela', 'novoPrazo', 'novoTaxaAdm', 'novoTaxaPeriodo']
    .forEach((id) => { $(id).addEventListener('input', renderNovo); $(id).addEventListener('change', renderNovo); });

  /* ===================== USUÁRIOS (só administrador) ===================== */
  async function carregarUsuarios() {
    if (!ehAdmin()) return;
    const tab = $('tabUsuarios');
    tab.innerHTML = '<tbody><tr><td>Carregando...</td></tr></tbody>';
    try {
      const fb = await fbx();
      const snap = await fb.getDocs(fb.collection(fb.db, 'usuarios'));
      const us = snap.docs.map((d) => limparPerfil(Object.assign({ uid: d.id }, d.data()))).sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || (a.nome || '').localeCompare(b.nome || ''));
      let h = '<thead><tr><th></th><th>Nome</th><th>Usuário / e-mail</th><th>WhatsApp</th><th>Status</th><th>Precificação</th><th>Card</th><th>Alimenta a base</th><th></th></tr></thead><tbody>';
      us.forEach((u) => {
        const eu = u.uid === EU.uid;
        const opt = (v, l, s) => `<option value="${v}"${v === s ? ' selected' : ''}>${l}</option>`;
        h += `<tr data-uid="${u.uid}" data-user="${esc(u.username)}">
          <td><img src="${u.fotoB64 || avatarIniciais(u.nome)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" alt=""></td>
          <td>${esc(u.nome)}${u.role === 'admin' ? ' <span class="selo">admin</span>' : ''}</td>
          <td><span class="mono">${esc(u.username)}</span><br><span style="color:var(--ink-dim); font-size:11.5px;">${esc(u.email)}</span></td>
          <td class="mono">${esc(u.telefone)}</td>
          <td>${eu ? '<span class="selo verde">ativo</span>' : `<select class="us-status">${opt('pendente', 'Pendente', u.status)}${opt('ativo', 'Ativo', u.status)}${opt('bloqueado', 'Bloqueado', u.status)}</select>`}</td>
          <td><select class="us-regra">${opt('alfa', 'Alfa (7%)', u.regra || 'alfa')}${opt('jairo', 'Jairo (faixas)', u.regra)}</select></td>
          <td><select class="us-marca">${opt('alfa', 'Alfa', u.marca || 'alfa')}${opt('jairo', 'Jairo Vieira', u.marca)}</select></td>
          <td>${eu ? '<span class="selo verde">sim</span>' : `<input type="checkbox" class="us-base"${u.podeBase ? ' checked' : ''}>`}</td>
          <td style="white-space:nowrap;"><button class="btn sm primary us-salvar">Salvar</button> <button class="btn sm us-reset"${u.email ? '' : ' disabled'} data-email="${esc(u.email)}">Redefinir senha</button>${eu ? '' : ' <button class="btn sm danger us-del">Excluir</button>'}</td></tr>`;
      });
      tab.innerHTML = h + '</tbody>';
      tab.querySelectorAll('.us-salvar').forEach((b) => b.addEventListener('click', async () => {
        const tr = b.closest('tr'); const dados = { regra: tr.querySelector('.us-regra').value, marca: tr.querySelector('.us-marca').value };
        if (tr.querySelector('.us-status')) dados.status = tr.querySelector('.us-status').value;
        if (tr.querySelector('.us-base')) dados.podeBase = tr.querySelector('.us-base').checked;
        b.disabled = true; b.textContent = 'Salvando...';
        try {
          const fb = await fbx(); await fb.updateDoc(fb.doc(fb.db, 'usuarios', tr.dataset.uid), dados);
          b.textContent = 'Salvo ✓';
          if (tr.dataset.uid === EU.uid) { Object.assign(EU, dados); aplicarPerfil(); }
        } catch (e) { b.textContent = 'Falhou'; alert(traduzErro(e)); }
        setTimeout(() => { b.disabled = false; b.textContent = 'Salvar'; }, 1800);
      }));
      tab.querySelectorAll('.us-reset').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Enviar para ' + b.dataset.email + ' um link para criar uma senha nova?')) return;
        try { const fb = await fbx(); await fb.sendPasswordResetEmail(fb.auth, b.dataset.email); b.textContent = 'Link enviado'; } catch (e) { alert(traduzErro(e)); }
      }));
      tab.querySelectorAll('.us-del').forEach((b) => b.addEventListener('click', async () => {
        const tr = b.closest('tr');
        if (!confirm('Excluir o perfil de ' + tr.children[1].textContent.trim() + '? A pessoa perde o acesso (para voltar, terá de criar outra conta com outro e-mail).')) return;
        try {
          const fb = await fbx(); const batch = fb.writeBatch(fb.db);
          batch.delete(fb.doc(fb.db, 'usuarios', tr.dataset.uid));
          if (tr.dataset.user) batch.delete(fb.doc(fb.db, 'logins', tr.dataset.user));
          await batch.commit(); carregarUsuarios();
        } catch (e) { alert(traduzErro(e)); }
      }));
    } catch (e) { tab.innerHTML = `<tbody><tr><td>${esc(traduzErro(e))}</td></tr></tbody>`; }
  }
  $('btnAtualizarUsuarios').addEventListener('click', carregarUsuarios);

  /* ===================== INÍCIO ===================== */
  (async function iniciar() {
    painel('painelCarregando');
    let fb;
    try { fb = await fbx(); }
    catch (e) { painel('painelLogin'); msg('loginMsg', 'Não consegui carregar o Firebase. Confira sua internet e recarregue a página.'); return; }
    fb.onAuthStateChanged(fb.auth, async (user) => {
      if (fluxo) return;
      if (!user) { await mostrarInicio(); return; }
      try {
        const p = await carregarPerfil(user.uid);
        if (!p) { await fb.signOut(fb.auth); await mostrarInicio(); msg('loginMsg', 'Conta sem perfil. Fale com o administrador.'); return; }
        await entrar(p);
      } catch (e) { painel('painelLogin'); msg('loginMsg', traduzErro(e)); }
    });
  })();

  // Exposto só para testes automáticos
  window.__alfa = { renderResultados, cardPropostaHTML, gerarDivulgacao, set BASE(v) { BASE = v; }, get BASE() { return BASE; }, set EU(v) { EU = v; aplicarPerfil(); }, montarBaseCom(lotes) { LOTES = lotes; montarBase(); }, renderNovo, renderBase };
})();
