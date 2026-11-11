#!/usr/bin/env node
// Diz o que a internet em uso permite para validar e-mails (porta 25): rode em cada rede (casa, 4G do celular...) e compare.
// Faz 3 perguntas reais, com caixas inventadas, a servidores de tipos diferentes e traduz a resposta.
const { verificarEmail, redeSmtp } = require('./verificador-email.js');
const SONDAS = [
  ['Google (Gmail e Google Workspace)', 'zzqxk77310@gmail.com', 'valido invalido arriscado'],
  ['Microsoft 365 empresarial', 'zzqxk77310@godaddy.com', 'valido invalido arriscado'],
  ['Servidores só IPv4 (UOL, Terra, Locaweb...)', 'zzqxk77310@uol.com.br', 'valido invalido arriscado'],
];
(async () => {
  console.log('Testando esta rede (leva cerca de 1 minuto)...\n');
  const r = await redeSmtp();
  console.log(`Porta 25 por IPv4: ${r.v4 ? 'ABERTA' : 'BLOQUEADA'}   |   Porta 25 por IPv6: ${r.v6 ? 'ABERTA' : 'BLOQUEADA'}\n`);
  let bons = 0;
  for (const [nome, email, ok] of SONDAS) {
    const v = await verificarEmail(email); const bom = ok.split(' ').includes(v.status); if (bom) bons++;
    console.log(`${bom ? 'FUNCIONA ' : 'NÃO     '} ${nome}\n         ${bom ? 'o servidor respondeu sobre a caixa' : v.motivo}`);
  }
  console.log(`\nResumo: ${bons} de ${SONDAS.length} tipos de servidor respondem nesta rede.`);
  console.log(bons === SONDAS.length ? 'Esta rede serve bem para validar e-mails.' : bons === 0 ? 'Esta rede não serve para checar caixas (só formato e domínio). Tente outra rede (ex.: o 4G do celular) e rode de novo.' : 'Esta rede serve em parte. Se tiver outra (ex.: o 4G do celular), rode de novo e use a que der mais "FUNCIONA".');
  process.exit(0);
})();
