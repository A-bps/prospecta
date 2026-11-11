# Prospecta

Painel de prospecção que roda **no seu computador**. Ele captura empresas do Google Maps, confere o **site, o Instagram, o WhatsApp e o e-mail** de cada uma, **descarta e-mails inválidos antes de entrarem na lista** e organiza tudo para você abordar. Ele **nunca envia mensagem sozinho**: o botão do WhatsApp só abre a conversa com o texto pronto, e quem lê e envia é você.

> **Funciona 100% no modo grátis.** O motor, a validação de e-mail e o painel são gratuitos e rodam localmente. As chaves de API abaixo são **opcionais**: elas só deixam a conferência mais completa, e todas têm plano grátis (veja os limites atuais na página de cada serviço).

## O que ele faz

- **Captura** empresas por segmento e cidade (ex.: "clínicas de estética" em "Campinas, SP") usando o motor open source [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper), em Docker, no seu PC.
- **Separa a lista por site**: *Sem site*, *Só rede social*, *Já tem site* (abordagem de atualização) e *Site não conferido*.
- **Separa por canal de contato**: *WhatsApp confirmado*, *Celular a verificar* (botões Testar / Tem / Não tem), *Celular de outra cidade*, *Só ligação*, *Só e-mail*, *Sem contato*. Celular com 9 depois do DDD **não** é tratado como WhatsApp sem prova.
- **Valida e-mails** antes de a empresa entrar na lista (veja abaixo).
- **Potencial 0 a 100** por oferta (site, tráfego pago ou CRM), mensagem de abertura editável e funil (Novo → Fechado).
- **Exporta** uma planilha `.xlsx` formatada (abas por grupo de site, cores, links, filtros) ou CSV.
- **Seus dados ficam só no seu navegador.** Nada é enviado para servidor nenhum do projeto.

## Instalação (Windows)

Você precisa de **Node 18+** e **Docker Desktop**. Abra o PowerShell **como administrador** e rode, um comando por vez:

```powershell
# 1) Conferir a virtualização (precisa aparecer True; se False, ligue SVM Mode (AMD) ou Intel VT-x na BIOS)
(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled

# 2) Node
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

# 3) WSL (reinicie o PC depois)
wsl --install --no-distribution

# 4) Docker Desktop (abra o programa, aceite os termos e espere "Engine running")
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
```

Depois, baixe este repositório (botão **Code → Download ZIP**, ou `git clone`), entre na pasta e ligue o motor pela primeira vez (baixa a imagem, leva alguns minutos):

```powershell
cd caminho\da\pasta\prospecta
docker compose up -d
```

Para criar um atalho na área de trabalho (opcional):

```powershell
$ws = New-Object -ComObject WScript.Shell; $a = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\Prospecta.lnk"); $a.TargetPath = "$PWD\iniciar.bat"; $a.WorkingDirectory = "$PWD"; $a.Save()
```

> macOS e Linux: o painel é Node + Docker, então `docker compose up -d` e `node iniciar-prospecta.js` devem funcionar, mas **só foi testado no Windows**.

## Como usar

1. Abra o **Docker Desktop** e espere o "Engine running".
2. Dê dois cliques em **`iniciar.bat`** (ou no atalho). Abre uma janela preta (não feche) e o painel em `http://127.0.0.1:8765`. O quadro "Capturar empresas" deve mostrar **Motor conectado**.
3. Digite o **segmento** (no plural, do jeito que o cliente pesquisa) e a **cidade**. Comece com "Uma área" e "Normal". Clique em **Iniciar captura**. Leva alguns minutos.
4. O painel confere sozinho site, Instagram, WhatsApp e e-mail. Use os grupos **Site** e **Contato** para filtrar.
5. Clique no botão verde para abrir o WhatsApp com a mensagem pronta, e marque a etapa e a data do próximo contato.
6. Exporte com **↓ Planilha** (xlsx) ou **↓ Backup** com frequência: a lista fica só neste navegador.

## Chaves de API (todas opcionais, todas com plano grátis)

Sem nenhuma chave, o Prospecta funciona: usa buscadores gratuitos (que bloqueiam rápido) e a validação de e-mail local. Com as chaves, fica mais completo.

| Serviço | Para que serve | Onde criar a conta e pegar a chave | Como guardar |
|---|---|---|---|
| **Serper** | Pesquisa no Google para achar site, Instagram, Facebook e WhatsApp de cada empresa (sem ele, usa buscadores gratuitos limitados) | https://serper.dev | Dê dois cliques em `configurar-busca.bat` e cole a chave |
| **Reoon** | Confirma se a caixa de e-mail existe (modo power) | https://www.reoon.com (documentação da API: https://www.reoon.com/?p=7660) | `configurar-email.bat`, opção 1 |
| **Emailable** | Segunda opinião para e-mail; é usado quando o Reoon não sabe responder | https://emailable.com | `configurar-email.bat`, opção 3 |
| **QuickEmailVerification** | Igual aos anteriores | https://quickemailverification.com | `configurar-email.bat`, opção 2 |

Observações honestas sobre os planos grátis (confira sempre a página atual de cada serviço, os limites mudam):
- **Serper:** a conta nova vem com créditos de teste, e nenhuma compra foi necessária para o uso descrito aqui. Cada empresa conferida gasta de 1 a 2 consultas.
- **Reoon:** divulga um plano grátis de até 600 créditos por mês, mas esse número vem de terceiros e não foi confirmado na página oficial.
- **Emailable:** funcionou com a chave do plano gratuito nos testes; o limite grátis não foi confirmado.
- **QuickEmailVerification:** divulga 100 créditos por dia grátis, mas, na conta de teste do autor, **pediu um plano pago**. A integração existe, mas **só foi testada com respostas simuladas**, não com chave real.

**Como colocar as chaves.** Pelos `.bat` acima (recomendado), ou à mão:
- `chave-serper.txt`: um arquivo com **somente a chave**, na pasta do Prospecta.
- `chaves-email.txt`: uma linha por serviço, no formato `servico=chave`. **A ordem das linhas é a prioridade**: o primeiro é usado até acabar a cota, depois o próximo.

```
reoon=SUA_CHAVE_AQUI
emailable=SUA_CHAVE_AQUI
quickemailverification=SUA_CHAVE_AQUI
```

Reinicie o Prospecta depois de mudar uma chave. Esses arquivos estão no `.gitignore`: **nunca os suba para o GitHub**. Um serviço que esgota a cota ou recusa a chave é pulado automaticamente.

## Como a validação de e-mail funciona

Mesma técnica de serviços como o Reoon, sem IA:

1. **Local e grátis (sempre):** formato, e-mail descartável, endereço de sistema (`noreply`), erro de digitação conhecido (`gmial.com`) e se o **domínio existe e recebe e-mail** (registro MX).
2. **Conversa SMTP (quando a sua internet deixa):** conecta no servidor de e-mail da empresa e pergunta se a caixa existe (`RCPT TO`), **sem enviar nada**. Pergunta também por uma caixa inventada: se aceitar, o domínio aceita qualquer endereço (*catch-all*) e não dá para provar a caixa.
3. **APIs (só para o que sobrou):** os e-mails que a checagem local não conseguiu confirmar vão para as APIs, na ordem do `chaves-email.txt`.

E-mail **inválido é descartado antes de a empresa entrar na lista**. Os que ficam ganham um selo: **✓** confirmado, **≈** o domínio aceita qualquer endereço, **?** domínio ok, caixa não confirmada. Endereços como `contato@` e `info@` são mantidos (marcados como "de função").

**Limite de rede:** muitos provedores residenciais bloqueiam a porta 25 de saída em IPv4. Rode `testar-rede-email.bat` para ver o que a sua internet permite (em geral, só servidores com IPv6 como o Google respondem de casa). O que a rede não deixa checar cai nas APIs ou fica com o selo "?". Hotmail/Outlook pessoal e Yahoo nunca são checados por SMTP.

Opcional (avançado): `vps/` tem scripts para rodar só a verificação num servidor com porta 25 liberada, acessado por túnel SSH (`verificador-remoto.txt`). Não é necessário.

## Arquivos

| Arquivo | O que é |
|---|---|
| `Prospecta.html` | o painel (arquivo único) |
| `iniciar-prospecta.js` | a ponte local: entrega o painel, liga ao motor, confere sites/redes/WhatsApp |
| `verificador-email.js` | validação de e-mail (formato, DNS, SMTP, catch-all) |
| `apis-email.js` | integração com Reoon, Emailable e QuickEmailVerification |
| `docker-compose.yml` | o motor de captura (porta 8080 presa em 127.0.0.1) |
| `iniciar.bat` | liga o motor e a ponte |
| `configurar-busca.bat`, `configurar-email.bat` | guardam as chaves neste PC |
| `testar-rede-email.bat` | diz o que a sua internet permite para validar e-mails |
| `vps/` | scripts opcionais do verificador em servidor |

## Uso responsável

- **LGPD:** telefones e e-mails de empresas podem ser dados pessoais. Use só para contato comercial, de forma educada, ofereça saída fácil e respeite o "não".
- **Termos do Google:** raspar o Google Maps vai contra os termos de uso do Google. Mantenha volume moderado e use o resultado como lista para verificar, não para revender.
- **Segurança:** o motor não tem senha, por isso a porta 8080 fica presa em `127.0.0.1`. Não mude para `0.0.0.0`. A ponte só aceita pedidos do próprio painel.
- Os e-mails que você valida por API são enviados ao serviço que você escolheu.

## Créditos

Motor de captura: [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT). Mapas: © colaboradores do OpenStreetMap.

Licença: ainda não definida.
