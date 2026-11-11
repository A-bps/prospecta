// Verificação de e-mail por APIs de terceiros (Reoon, QuickEmailVerification, Emailable).
// Só é chamada para os e-mails que a checagem local não conseguiu confirmar (selo "?"): assim a cota grátis de cada serviço rende mais.
// Chaves: arquivo chaves-email.txt (uma por linha, "servico=chave"; a ordem das linhas é a prioridade) ou variáveis REOON_KEY, QEV_KEY, EMAILABLE_KEY.
// Serviços: reoon, quickemailverification, emailable. Quando um serviço esgota a cota ou rejeita a chave, passa para o próximo.
// Os endereços e campos vêm da documentação oficial de cada serviço (lida em 2026-11-09); trocar a base por API_BASE_REOON / API_BASE_QEV / API_BASE_EMAILABLE só serve para teste.
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, 'chaves-email.txt');
const BASE = (n, d) => process.env['API_BASE_' + n] || d;
const erro = (codigo, msg) => Object.assign(new Error(msg || codigo), { codigo });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(100_000) });
    if (r.status === 249) { await dormir(5000); continue; } // Emailable: "demorou, tente de novo"
    if (r.status === 401 || r.status === 403) throw erro('chave', 'chave recusada (' + r.status + ')');
    if (r.status === 402 || r.status === 429) throw erro('cota', 'cota ou limite (' + r.status + ')');
    if (!r.ok) throw erro('falha', 'o serviço respondeu ' + r.status);
    return r.json();
  }
  throw erro('falha', 'o serviço demorou demais');
}
const url = (base, params) => { const u = new URL(base); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); return u; };

const PROVEDORES = {
  reoon: {
    nome: 'Reoon',
    chamar: (email, key) => pedir(url(BASE('REOON', 'https://emailverifier.reoon.com') + '/api/v1/verify', { email, key, mode: 'power' })),
    norm(j) {
      if (j.status === 'error' || j.error) { const t = String(j.reason || j.error || ''); throw erro(/credit|limit|quota/i.test(t) ? 'cota' : /key/i.test(t) ? 'chave' : 'falha', t); }
      switch (j.status) {
        case 'safe': return { status: 'valido', motivo: 'a caixa existe e recebe e-mail' };
        case 'invalid': return { status: 'invalido', motivo: 'a caixa não existe' };
        case 'disabled': return { status: 'invalido', motivo: 'a caixa está desativada' };
        case 'disposable': return { status: 'invalido', motivo: 'e-mail descartável' };
        case 'spamtrap': return { status: 'invalido', motivo: 'armadilha de spam' };
        case 'catch_all': return { status: 'arriscado', motivo: 'o domínio aceita qualquer endereço' };
        case 'inbox_full': return { status: 'arriscado', motivo: 'a caixa existe, mas está cheia' };
        case 'role_account': return j.is_deliverable === true ? { status: 'valido', motivo: 'endereço de função, entregável' } : null;
        default: return null; // unknown: não gasta crédito, tenta o próximo serviço
      }
    },
  },
  quickemailverification: {
    nome: 'QuickEmailVerification',
    chamar: (email, key) => pedir(url(BASE('QEV', 'https://api.quickemailverification.com') + '/v1/verify', { email, apikey: key })),
    norm(j) {
      if (j.success === false) { const t = String(j.message || ''); throw erro(/credit|limit|quota/i.test(t) ? 'cota' : /key/i.test(t) ? 'chave' : 'falha', t); }
      if (j.disposable === true || j.disposable === 'true') return { status: 'invalido', motivo: 'e-mail descartável' };
      if (j.result === 'invalid') return { status: 'invalido', motivo: j.reason === 'invalid_domain' ? 'o domínio não existe' : j.reason === 'no_mx_record' ? 'o domínio não recebe e-mail' : 'a caixa não existe' };
      if (j.result === 'valid') return (j.accept_all === true || j.accept_all === 'true') ? { status: 'arriscado', motivo: 'o domínio aceita qualquer endereço' } : { status: 'valido', motivo: 'a caixa existe e recebe e-mail' };
      return null; // unknown (greylist, timeout...): não gasta crédito
    },
  },
  emailable: {
    nome: 'Emailable',
    chamar: (email, key) => pedir(url(BASE('EMAILABLE', 'https://api.emailable.com') + '/v1/verify', { email, api_key: key })),
    norm(j) {
      if (j.message && !j.state) { const t = String(j.message); throw erro(/credit|limit|quota/i.test(t) ? 'cota' : /key|token|auth/i.test(t) ? 'chave' : 'falha', t); }
      if (j.disposable === true) return { status: 'invalido', motivo: 'e-mail descartável' };
      if (j.state === 'undeliverable') return { status: 'invalido', motivo: j.reason === 'invalid_domain' ? 'o domínio não existe' : 'a caixa não existe' };
      if (j.state === 'deliverable') return j.accept_all === true ? { status: 'arriscado', motivo: 'o domínio aceita qualquer endereço' } : { status: 'valido', motivo: 'a caixa existe e recebe e-mail' };
      if (j.state === 'risky') return { status: 'arriscado', motivo: 'risco de não entregar (' + (j.reason || 'sem detalhe') + ')' };
      return null;
    },
  },
};
const ENV = { reoon: 'REOON_KEY', quickemailverification: 'QEV_KEY', emailable: 'EMAILABLE_KEY' };

function chaves() { // [[servico, chave], ...] na ordem de prioridade
  const out = [];
  if (fs.existsSync(ARQ)) for (const l of fs.readFileSync(ARQ, 'utf8').split(/\r?\n/)) { const m = /^\s*([a-z]+)\s*=\s*(\S+)\s*$/i.exec(l); if (m && PROVEDORES[m[1].toLowerCase()]) out.push([m[1].toLowerCase(), m[2]]); }
  for (const [n, v] of Object.entries(ENV)) if (process.env[v] && !out.some(([x]) => x === n)) out.push([n, process.env[v]]);
  return out;
}
const esgotado = new Map(); // serviço -> até quando não usar (cota acabou: 6 h; chave recusada: 24 h)
async function verificarViaApis(email) {
  for (const [n, key] of chaves()) {
    if (esgotado.get(n) > Date.now()) continue;
    const p = PROVEDORES[n];
    try { const r = p.norm(await p.chamar(email, key)); if (r) return { ...r, fonte: p.nome }; }
    catch (e) { if (e.codigo === 'cota') esgotado.set(n, Date.now() + 6 * 3_600_000); else if (e.codigo === 'chave') esgotado.set(n, Date.now() + 24 * 3_600_000); /* outra falha: tenta o próximo serviço */ }
  }
  return null;
}
const provedoresConfigurados = () => chaves().map(([n]) => PROVEDORES[n].nome);
module.exports = { verificarViaApis, provedoresConfigurados };
