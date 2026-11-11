#!/usr/bin/env bash
# Instala o verificador de e-mail do Prospecta como serviço (Ubuntu 24.04 ou Debian 12).
# Rode como administrador, na pasta onde estão verificador-email.js e este arquivo:
#   sudo bash instalar-vps.sh
# Ele cria um usuário sem login, guarda o segredo em /etc/verificador.env (só o administrador lê) e deixa o serviço ligar sozinho.
# O serviço escuta só em 127.0.0.1:8790: não fica aberto na internet; o PC acessa por túnel SSH.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }
[ -f verificador-email.js ] || { echo "Falta verificador-email.js nesta pasta."; exit 1; }
if ! command -v node >/dev/null 2>&1; then apt-get update -y && apt-get install -y nodejs; fi
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "Node 18 ou mais novo é necessário (use Ubuntu 24.04 ou Debian 12)."; exit 1; }

id verificador >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin verificador
install -d -m 755 /opt/verificador
install -m 644 verificador-email.js /opt/verificador/verificador-email.js

if [ ! -f /etc/verificador.env ]; then
  token=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'VERIFY_TOKEN=%s\nPORT=8790\nVERIFY_FROM=%s\n' "$token" "${VERIFY_FROM:-verificacao@example.com}" > /etc/verificador.env
  chmod 600 /etc/verificador.env
  novo=1
fi

cat > /etc/systemd/system/verificador.service <<'UNIT'
[Unit]
Description=Verificador de e-mail do Prospecta
After=network-online.target
Wants=network-online.target

[Service]
User=verificador
EnvironmentFile=/etc/verificador.env
ExecStart=/usr/bin/env node /opt/verificador/verificador-email.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now verificador
sleep 2
systemctl --no-pager --lines=3 status verificador || true

echo
echo "Pronto. Teste local: curl -s -H \"X-Token: \$(grep VERIFY_TOKEN /etc/verificador.env | cut -d= -f2)\" http://127.0.0.1:8790/status"
if [ "${novo:-0}" = 1 ]; then
  echo
  echo "SEGREDO (anote agora, vai no arquivo verificador-remoto.txt do PC; não envie por chat nem salve em repositório):"
  grep VERIFY_TOKEN /etc/verificador.env | cut -d= -f2
else
  echo "Segredo já existente mantido (veja com: sudo grep VERIFY_TOKEN /etc/verificador.env)."
fi
