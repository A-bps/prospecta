#!/usr/bin/env bash
# Testa, no VPS, se a porta 25 de saída está liberada (IPv4 e IPv6) e mostra o IP público.
# Rode ANTES de instalar qualquer coisa:  bash testar-porta-25.sh
# Se tudo aparecer "BLOQUEADO", este provedor não serve para o verificador (peça liberação no suporte ou troque de provedor).
alvos="gmail-smtp-in.l.google.com mx.uol.com.br mx.terra.com.br smtp.globo.com mx01.mail.icloud.com mta7.am0.yahoodns.net"
testa() { # $1 = host, $2 = 4 ou 6
  local ip; ip=$(getent ahosts "$1" 2>/dev/null | awk -v f="$2" '($1 ~ /:/) == (f == 6) {print $1; exit}')
  [ -n "$ip" ] || { echo "sem endereço IPv$2"; return; }
  if exec 3<>"/dev/tcp/$ip/25" 2>/dev/null; then
    local linha; read -t 8 -u 3 linha 2>/dev/null; exec 3>&- 3<&-
    [ -n "$linha" ] && echo "ABERTO  (${linha:0:50})" || echo "conectou, mas sem resposta em 8 s"
  else echo "BLOQUEADO"; fi
}
echo "IP público deste servidor: $(curl -s -m 8 https://ifconfig.me || echo desconhecido)"
echo "Confira se o IP está em lista de spam: https://check.spamhaus.org"
echo
for h in $alvos; do
  for f in 4 6; do printf '%-34s IPv%s: ' "$h" "$f"; timeout 15 bash -c "$(declare -f testa); testa $h $f" || echo "tempo esgotado"; done
done
echo
echo "Bom sinal: Gmail ABERTO em IPv4 e os servidores só-IPv4 (uol, terra, globo, icloud, yahoo) também ABERTOS."
