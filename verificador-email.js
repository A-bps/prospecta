#!/usr/bin/env node
// Verificador de e-mail do Prospecta (mesma técnica do Reoon e similares: regras + DNS + conversa SMTP; sem IA e sem limite mensal).
// Dois usos:
//   1) como módulo, dentro da ponte (iniciar-prospecta.js):  const { verificarEmail, redeSmtp } = require('./verificador-email.js')
//   2) sozinho, como servidor (num VPS com porta 25 liberada):  VERIFY_TOKEN=segredo node verificador-email.js
//      escuta em 127.0.0.1:8790 (acesso pelo túnel SSH), exige o cabeçalho X-Token e responde
//        GET /status                 -> { smtp, v4, v6, maquina }
//        GET /verificar-email?email= -> { email, status, motivo, ... }
//
// Etapas: 1 sintaxe · 2 endereço de sistema (noreply...) e domínio descartável · 3 erro de digitação (gmial.com) · 4 DNS: o domínio recebe e-mail (MX)
// 5 SMTP: conecta no servidor do domínio (porta 25), diz quem é e pergunta "aceita a caixa fulano@?" (RCPT TO); sem enviar nada.
//   Também pergunta por uma caixa inventada: se aceitar, o domínio aceita tudo (catch-all) e não dá para provar a caixa.
// Status: valido (servidor confirmou) · invalido (sintaxe, domínio morto, descartável ou caixa inexistente) · arriscado (catch-all)
//         nao_confirmado (domínio ok, mas o servidor não deixou checar: porta 25 fechada, Hotmail/Yahoo, IP recusado, greylist).
// ponytail: sem IP limpo e porta 25 liberada, parte dos servidores não responde; Hotmail pessoal e Yahoo nunca são testados por SMTP.
const net = require('net');
const os = require('os');
const crypto = require('crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESCARTAVEL = new Set('mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamailblock.com sharklasers.com grr.la 10minutemail.com 10minutemail.net 20minutemail.com tempmail.com temp-mail.org temp-mail.io tempmailo.com tempail.com yopmail.com yopmail.fr trashmail.com trashmail.net trashmail.de getnada.com nada.email dispostable.com maildrop.cc throwawaymail.com fakeinbox.com mailnesia.com mintemail.com spamgourmet.com mohmal.com emailondeck.com burnermail.io discard.email mailcatch.com moakt.com tmpmail.org tmpmail.net inboxkitten.com anonbox.net spambox.us mytemp.email fakemail.net emailfake.com mailtemp.net harakirimail.com mailforspam.com spam4.me getairmail.com tempinbox.com jetable.org'.split(' '));
const SISTEMA = /^(no-?reply|noreply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|spam|bounces?|root|hostmaster)$/;
const PAPEL = /^(info|contato|contact|sac|atendimento|vendas|comercial|admin|administrativo|financeiro|suporte|support|sales|marketing|faleconosco|recepcao|secretaria|rh|ola|oi|hello|office|cadastro|agendamento|reservas)$/;
const GRATUITO = new Set('gmail.com googlemail.com hotmail.com outlook.com live.com msn.com yahoo.com yahoo.com.br icloud.com me.com uol.com.br bol.com.br terra.com.br ig.com.br globo.com globomail.com proton.me protonmail.com'.split(' '));
// Lista fixa de erros comuns (busca por "parecido" reprovaria domínios reais como mail.com).
const ERRO_DIGITACAO = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmil.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.com.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'htomail.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.com.b': 'yahoo.com.br', 'uol.com': 'uol.com.br', 'terra.com': 'terra.com.br', 'bol.com': 'bol.com.br', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com' };
// Resolvedor próprio: o do Node pode herdar um DNS local morto (127.0.0.1), então usamos os do sistema que não sejam locais + os públicos.
const RDNS = new (require('dns').promises.Resolver)();
RDNS.setServers([...require('dns').getServers().filter((s) => !/^(127\.|::1$)/.test(s)), '1.1.1.1', '8.8.8.8']);
const dnsCache = new Map();
async function mxDe(dom) {
  const c = dnsCache.get(dom); if (c && Date.now() - c.t < 3_600_000) return c.v;
  let v;
  try {
    const r = (await RDNS.resolveMx(dom)).sort((a, b) => a.priority - b.priority);
    v = r.length === 1 && r[0].exchange === '' ? { erro: 'o domínio declara que não recebe e-mail' } : { mx: r.map((x) => x.exchange) };
  } catch (e) {
    if (e.code === 'ENOTFOUND') v = { erro: 'o domínio não existe' };
    else if (e.code === 'ENODATA') { // sem MX: a regra do e-mail manda tentar o endereço do próprio domínio
      try { v = (await RDNS.resolve4(dom)).length ? { mx: [dom] } : { erro: 'o domínio não tem servidor de e-mail' }; } catch { v = { erro: 'o domínio não tem servidor de e-mail' }; }
    } else return { temp: 'o DNS não respondeu (' + e.code + ')' };
  }
  dnsCache.set(dom, { v, t: Date.now() }); return v;
}
// Conversa SMTP em uma conexão: banner, EHLO, MAIL FROM, um RCPT TO por endereço, QUIT. Devolve as respostas {code,msg}.
function smtpConversa(host, helo, from, rcpts) {
  return new Promise((ok) => {
    const s = net.connect({ host, port: 25 }); s.setTimeout(10000);
    const cmds = [`EHLO ${helo}`, `MAIL FROM:<${from}>`, ...rcpts.map((r) => `RCPT TO:<${r}>`)], resp = []; let buf = '', done = false;
    const fim = (x) => { if (done) return; done = true; s.destroy(); ok({ resp, ...x }); };
    s.on('timeout', () => fim({ erro: 'tempo esgotado' })); s.on('error', (e) => fim({ erro: e.code || 'falha de conexão' })); s.on('close', () => fim({ erro: 'conexão fechada' }));
    s.on('data', (d) => {
      buf += d.toString('latin1'); let m;
      while ((m = /^(?:\d{3}-.*\r?\n)*(\d{3}) ?(.*)\r?\n/.exec(buf))) {
        buf = buf.slice(m[0].length); resp.push({ code: Number(m[1]), msg: m[0].replace(/\r?\n/g, ' ').slice(0, 300) });
        const i = resp.length - 1; // 0 banner, 1 EHLO, 2 MAIL, 3.. RCPT
        if (i === 0 && resp[0].code !== 220) return fim({ erro: 'servidor recusou a conexão' });
        if (i >= 1 && i <= 2 && resp[i].code !== 250) return fim({ fase: i === 1 ? 'ehlo' : 'mail' });
        if (i === cmds.length) { s.write('QUIT\r\n'); return fim({}); }
        s.write(cmds[i] + '\r\n');
      }
    });
  });
}
function classeRcpt(r) {
  if (!r) return 'incerto';
  if (r.code >= 200 && r.code < 300) return 'ok';
  if (r.code >= 400 && r.code < 500) return 'temp';
  const t = r.msg;
  if (/user unknown|unknown user|no such user|does not exist|doesn't exist|not exist|invalid (recipient|mailbox|address)|mailbox (unavailable|not found|disabled)|recipient (not found|rejected|unknown)|unknown recipient|address rejected|no mailbox|not a valid|5\.1\.[1-6]\b|5\.1\.10\b/i.test(t)) return 'inexistente';
  if (/\b5\.7\.|block|blacklist|blocklist|spam|denied|reputation|policy|pbl|spamhaus|not (allowed|permitted)|relay|banned|access/i.test(t)) return 'bloqueio';
  return 'incerto';
}
const catchAllDe = new Map(), mxMorto = new Map(), filaDom = new Map();
const serial = (dom, fn) => { const p = (filaDom.get(dom) || Promise.resolve()).then(() => sleep(800)).then(fn); filaDom.set(dom, p.catch(() => {})); return p; };
// Só o e-mail pessoal da Microsoft (hotmail/outlook.com) e o Yahoo/AOL respondem "ok" a qualquer caixa ou bloqueiam; Microsoft 365 empresarial responde de verdade.
const SMTP_SKIP = [[/olc\.protection\.outlook\.com|hotmail\.com|msn\.com/i, 'o Hotmail/Outlook pessoal não deixa checar a caixa'], [/yahoodns\.net|yahoo|aol\./i, 'o Yahoo/AOL não deixa checar a caixa']];
// A porta 25 de saída é bloqueada pelos provedores residenciais brasileiros em IPv4, mas costuma ficar aberta em IPv6: testamos as duas.
let redeTeste = { t: 0, v: { v4: false, v6: false } };
async function redeSmtp() {
  if (Date.now() - redeTeste.t < 5 * 60_000) return redeTeste.v;
  const prova = (fam) => new Promise((ok) => {
    (fam === 6 ? RDNS.resolve6 : RDNS.resolve4).call(RDNS, 'gmail-smtp-in.l.google.com').then((a) => {
      const s = net.connect({ host: a[0], port: 25 }); s.setTimeout(6000);
      s.on('connect', () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); s.on('timeout', () => { s.destroy(); ok(false); });
    }, () => ok(false));
  });
  const [v4, v6] = await Promise.all([prova(4), prova(6)]); redeTeste = { t: Date.now(), v: { v4, v6 } }; return redeTeste.v;
}
// Escolhe o primeiro servidor de e-mail do domínio que dá para alcançar: IPv6 se a rede deixa, senão IPv4 se a porta 25 IPv4 estiver aberta.
async function alvoSmtp(mxs) {
  const rede = await redeSmtp(); let vivos = 0;
  for (const h of mxs.slice(0, 3)) {
    if (mxMorto.get(h) > Date.now()) continue; vivos++;
    if (rede.v6) { try { const a = await RDNS.resolve6(h); if (a.length) return { ip: a[0], h }; } catch { /* sem IPv6 */ } }
    if (rede.v4) { try { const a = await RDNS.resolve4(h); if (a.length) return { ip: a[0], h }; } catch { /* sem IPv4 */ } }
  }
  const motivo = !rede.v4 && !rede.v6 ? 'a porta 25 desta máquina está fechada'
    : !vivos ? 'o servidor não respondeu nas últimas tentativas'
    : rede.v6 && !rede.v4 ? 'o servidor só aceita IPv4 e esta máquina não alcança a porta 25 em IPv4' : 'não consegui alcançar o servidor';
  return { motivo };
}
async function smtpCheck(addr, dom, mxs) {
  const skip = SMTP_SKIP.find(([re]) => mxs.some((h) => re.test(h))); if (skip) return { status: 'nao_confirmado', motivo: 'domínio ok, mas ' + skip[1] };
  const alvo = await alvoSmtp(mxs); if (alvo.motivo) return { status: 'nao_confirmado', motivo: 'domínio ok, mas ' + alvo.motivo };
  const falso = 'zx' + crypto.randomBytes(5).toString('hex') + 'q@' + dom, jaCatch = catchAllDe.get(dom);
  const r = await serial(dom, () => smtpConversa(alvo.ip, os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'verificador', process.env.VERIFY_FROM || 'verificacao@example.com', jaCatch ? [addr] : [addr, falso]));
  if (r.erro) { if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|tempo esgotado|ECONNRESET/.test(r.erro)) mxMorto.set(alvo.h, Date.now() + 30 * 60_000); return { status: 'nao_confirmado', motivo: 'domínio ok, mas o servidor não respondeu (' + r.erro + ')' }; }
  if (r.fase) return { status: 'nao_confirmado', motivo: 'domínio ok, mas o servidor recusou a checagem' };
  const a = classeRcpt(r.resp[3]);
  if (a === 'inexistente') return { status: 'invalido', motivo: 'o servidor diz que a caixa não existe' };
  if (a === 'temp') return { status: 'nao_confirmado', motivo: 'domínio ok, o servidor pediu para tentar depois (greylist)' };
  if (a === 'bloqueio') return { status: 'nao_confirmado', motivo: 'domínio ok, mas o servidor recusou o IP desta máquina (provável lista anti-spam)' };
  if (a !== 'ok') return { status: 'nao_confirmado', motivo: 'domínio ok, resposta do servidor inconclusiva' };
  if (jaCatch || classeRcpt(r.resp[4]) === 'ok') { catchAllDe.set(dom, true); return { status: 'arriscado', motivo: 'o domínio aceita qualquer endereço: não dá para provar que a caixa existe' }; }
  return { status: 'valido', motivo: 'o servidor confirmou a caixa' };
}
async function verificarEmail(raw) {
  const email = String(raw || '').trim().toLowerCase().replace(/^mailto:/, ''), r = { email };
  const m = /^([a-z0-9._%+'-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(email);
  if (!m || email.length > 254 || m[1].length > 64 || /\.\.|^\.|\.$/.test(m[1]) || !/[a-z]{2,}$/.test(m[2])) return { ...r, status: 'invalido', motivo: 'formato de e-mail inválido' };
  const [, local, dom] = m;
  if (DESCARTAVEL.has(dom)) return { ...r, status: 'invalido', motivo: 'e-mail descartável (caixa temporária)' };
  if (SISTEMA.test(local)) return { ...r, status: 'invalido', motivo: 'endereço de sistema (' + local + '), não é uma pessoa' };
  if (ERRO_DIGITACAO[dom]) return { ...r, status: 'invalido', motivo: `provável erro de digitação (seria ${ERRO_DIGITACAO[dom]}?)`, sugestao: local + '@' + ERRO_DIGITACAO[dom] };
  const d = await mxDe(dom);
  if (d.temp) return { ...r, status: 'nao_confirmado', motivo: d.temp };
  if (d.erro) return { ...r, status: 'invalido', motivo: d.erro };
  const extra = { papel: PAPEL.test(local), gratuito: GRATUITO.has(dom) };
  return { ...r, ...extra, ...(await smtpCheck(email, dom, d.mx)) };
}
module.exports = { verificarEmail, redeSmtp };

// ---- Modo servidor (VPS): exige X-Token, escuta só em 127.0.0.1 (use túnel SSH) e limita pedidos simultâneos ----
if (require.main === module) {
  const http = require('http');
  const PORT = Number(process.env.PORT) || 8790, BIND = process.env.BIND || '127.0.0.1', TOKEN = process.env.VERIFY_TOKEN || '';
  if (TOKEN.length < 16) { console.error('Defina VERIFY_TOKEN com um texto secreto de pelo menos 16 caracteres.'); process.exit(1); }
  const tokenOk = (t) => { const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  let ativos = 0;
  http.createServer(async (req, res) => {
    if (!tokenOk(req.headers['x-token'])) return json(res, 401, { erro: 'não autorizado' });
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/status') { const r = await redeSmtp(); return json(res, 200, { smtp: r.v4 || r.v6, v4: r.v4, v6: r.v6, maquina: os.hostname() }); }
      if (url.pathname === '/verificar-email') {
        if (ativos >= 8) return json(res, 429, { erro: 'muitos pedidos ao mesmo tempo' });
        ativos++; try { return json(res, 200, await verificarEmail(url.searchParams.get('email') || '')); } finally { ativos--; }
      }
      json(res, 404, { erro: 'não encontrado' });
    } catch (e) { json(res, 500, { erro: String(e.message || e) }); }
  }).listen(PORT, BIND, () => console.log(`Verificador de e-mail em http://${BIND}:${PORT} (máquina ${os.hostname()})`));
}
