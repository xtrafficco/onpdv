# ONPDV — ERP & Frente de Caixa

Sistema de gestão (ERP) e ponto de venda (PDV) para varejo — usado pela operação
**Petville** (petshop, múltiplas lojas). É um PWA **offline-first** em JavaScript
vanilla (sem framework/bundler) sobre um backend **Supabase** (PostgreSQL), com
integrações de pagamento (**Mercado Pago** — Point + PIX), fiscal (**NFC-e**) e
mensageria (**WhatsApp** / Web Push).

> Versão desta pasta: **2026.09.18-v60** (ver `version.json`).
>
> ⚠️ Está **à frente do que está no ar**: o site ainda serve a v59. O pacote pronto
> para subir é `publicar-site-2026.09.18-v60/` — monte com
> `node scripts/montar-publicacao.mjs`. Ver *Pendências*.

---

## Sumário
- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Frontends](#frontends)
- [Backend (Supabase)](#backend-supabase)
- [Integrações e segredos](#integrações-e-segredos)
- [Principais funcionalidades](#principais-funcionalidades)
- [Impressão térmica (cupom, fechamento, Leitura X)](#impressão-térmica-cupom-fechamento-leitura-x)
- [Segurança](#segurança)
- [Deploy](#deploy)
- [Instalador do caixa (offline)](#instalador-do-caixa-offline)
- [Desenvolvimento, CI e testes](#desenvolvimento-ci-e-testes)
- [Versionamento](#versionamento)
- [Pendências](#pendências)
- [Histórico de manutenção](#histórico-de-manutenção)

---

## Arquitetura

```
┌─────────────────────────────────────────────┐        ┌──────────────────────────────┐
│  Frontends (PWA, JS vanilla, servidos estát.)│        │  Supabase (projeto ONPDV)    │
│  • index.html   → Caixa/ERP (backoffice+PDV) │        │  • PostgreSQL 17 + RLS       │
│  • cliente.html → Portal do cliente          │  HTTPS │  • 288 funções (RPC-first)   │
│  • entregador.html → App do entregador       │ ─────▶ │  • Auth (e-mail/senha + 2FA) │
│  • vitrine.html → Display para o cliente      │  WSS   │  • 17 Edge Functions (Deno)  │
│  Service Worker (offline) + IndexedDB cache  │        │  • pg_cron (10 jobs)         │
└─────────────────────────────────────────────┘        └──────────────┬───────────────┘
                                                                       │
                              Integrações externas ────────────────────┤
                              • Mercado Pago (Point, PIX, webhooks)     │
                              • Emissor fiscal NFC-e                    │
                              • Provedor de WhatsApp (wa-send)          │
                              • Web Push (VAPID)                        │
```

- **Padrão do backend:** *RPC-first*. As tabelas ficam trancadas por **RLS** e a
  lógica de negócio vive em funções `SECURITY DEFINER` (RPCs) chamadas pelo frontend
  via PostgREST/`supabase-js`. Cada RPC faz a própria autorização (`is_admin()`,
  `my_store()`, `is_staff()`, tokens de portal).
- **Offline-first:** o caixa opera sem internet (fila de vendas em IndexedDB,
  sincronização idempotente por `client_uuid`); chamadas ao Supabase nunca são
  cacheadas pelo Service Worker (código do app é *network-first*).

## Estrutura do repositório

```
.
├── index.html                 # Caixa/ERP (carrega partials/onpdv-app.html + assets)
├── cliente.html               # Portal do cliente (login próprio)
├── entregador.html            # App do entregador (motoboy)
├── vitrine.html               # Display voltado ao cliente
├── pedido.html                # Pedido pelo site (cliente monta o pedido sozinho)
├── partials/onpdv-app.html    # Markup do app principal (injetado no index)
├── assets/
│   ├── js/onpdv-app.js         # App principal (~9.750 linhas)
│   ├── js/onpdv-bootstrap.js   # Bootstrap: login + carrega o app
│   ├── js/onpdv-raiox.js       # Raio-X Financeiro (sob demanda)
│   ├── js/onpdv-compras.js     # Módulo Compras (sob demanda)
│   ├── js/pedido.js            # Pedido pelo site (PIX copia-e-cola)
│   ├── js/{cliente,entregador,vitrine}.js
│   └── css/{onpdv,onpdv-raiox}.css
├── lib/                       # leaflet (mapa) + qrcode.js (QR local)
├── icons/ , *.webmanifest     # PWA
├── sw.js                      # Service Worker (network-first p/ código; cache offline)
├── version.json               # Versão publicada (checagem de update dos caixas)
├── vercel.json                # Headers HTTP no Vercel (FONTE DA VERDADE de headers)
├── .gitattributes             # `* -text`: preserva os bytes (o .bat embute um ZIP)
├── downloads/                 # Instalador do caixa offline (.bat + .zip)
├── scripts/
│   ├── check-version.mjs      # Guarda: versão igual nos quatro arquivos
│   ├── check-frontend.mjs     # Guardas: CSP, zoom, rótulos, SHELL do SW, JSON
│   └── fix-labels.mjs         # Associa <label> ao campo (for=); idempotente
├── tests/                     # Testes (node --test) sobre o arquivo publicado
├── supabase/
│   ├── migrations/            # Migrations versionadas
│   └── functions/             # Cópias de referência de edge functions
├── .github/workflows/ci.yml   # CI: sintaxe, guardas e testes
└── README.md                  # Este arquivo
```

> **Atenção: esta pasta é o pacote de publicação, não o repositório de
> desenvolvimento.** Conferido em 18/09/2026, faltam aqui: `scripts/build-installer.mjs`
> (o gerador do instalador), `scripts/montar-publicacao.mjs`, `caixa/` (o runtime do
> caixa desktop), `MANUTENCAO.md`, `supabase/tests/`, `.gitattributes`,
> `.github/workflows/` e o próprio `.git`. As três primeiras entradas da árvore acima
> que dependem deles são descritas aqui como referência do repositório completo.
>
> Consequência prática: o gerador canônico do instalador (`build-installer.mjs`) não
> está aqui. Desde 18/09/2026 existe `scripts/build-installer.py`, escrito lendo o
> instalador publicado, que cobre essa lacuna — ver *Instalador do caixa*.

## Frontends

| Página | Público | Autenticação | Observações |
|---|---|---|---|
| `index.html` | Operadores/admin | Supabase (e-mail/senha, 2FA p/ admin) | Backoffice + Frente de Caixa (PDV) |
| `cliente.html` | Clientes | Supabase (conta de cliente) | Contas, cashback, pets, pagar por PIX |
| `entregador.html` | Motoboy | Supabase (papel `motoboy`) | Fila de entregas, GPS, comprovação |
| `vitrine.html` | Exibição | Sem login | Mostra a venda/QR PIX ao cliente |
| `pedido.html` | Clientes | Sem login | Pedido pelo site; PIX copia-e-cola, pedido só vai ao caixa pago |

- Papéis (`app_users.papel`): `admin`, `operador`, `motoboy`.
- Todas as páginas têm **CSP estrita** em `<meta>` (sem `unsafe-inline` em script);
  handlers de UI usam delegação (`data-act` / `data-onclick`), não `onclick=` inline.

## Backend (Supabase)

- **Projeto:** ONPDV (`qkhpvqepgozsaamxmugk`), PostgreSQL 17, região us-east-1.
- **Escala** (conferida em 18/09/2026): 84 tabelas (100% com RLS, 36 "trancadas" —
  sem policy, acesso só via RPC), 305 funções (293 `SECURITY DEFINER`, todas com
  `search_path` fixado), 220 migrations aplicadas.
- **Chave publicável (anon)** embutida no frontend — pública por design; toda a
  proteção é via RLS/RPC.

### Edge Functions (Deno)
| Função | JWT | Papel |
|---|---|---|
| `pdv-pix-payment` | ✔ | PIX dinâmico no caixa (venda / entrega / crediário) |
| `pdv-pix-webhook` | público | Confirma PIX do caixa mesmo com o caixa fechado |
| `pdv-pix-charge` | ✔ | Suporte a cobrança PIX |
| `portal-pix` / `portal-pix-webhook` | ✔ / público | PIX do portal do cliente (liquidação session-less) |
| `pos-cloud-charge` | ✔ | Aciona a maquininha Mercado Pago Point |
| `mp-point-webhook` | público | Webhook do Point (Orders API) |
| `mp-reconcile` / `mp-terminals-debug` | ✔ | Conciliação / diagnóstico MP |
| `fiscal-emit` / `fiscal-webhook` / `fiscal-cancel` | ✔ / público | NFC-e |
| `wa-send` | ✔ | Envia WhatsApp por provedor configurável |
| `ops-worker` | ✔ | Automação: cobranças, ciclos, métricas, entrega da outbox |
| `push-dispatch` | público | Web Push |
| `admin-user` / `portal-invite` | ✔ | Gestão de usuários / convite de portal |
| `pedido-site` | público | Recebe o pedido feito no site e gera o PIX |
| `pedido-site-pix-webhook` | público | Confirma o PIX do pedido; só então ele chega ao caixa |

**Webhooks públicos — como cada um se protege.** `verify_jwt=false` é obrigatório
(o provedor não manda JWT), então a defesa é interna. O padrão correto está no
`mp-point-webhook`: sem `MP_WEBHOOK_SECRET` configurado ele **recusa** (401/503) em
vez de seguir. Os dois PIX aceitam a chamada sem assinatura, mas reconsultam o
pagamento na API do MP de forma **incondicional** — o corpo é só gatilho, nunca
fonte da verdade, então forjar a notificação não leva a nada.

> ⚠️ **`fiscal-webhook` é a exceção e precisa ser corrigido antes de ligar a NFC-e.**
> Ele começa com `let out = payload` e só substitui pelo dado real *se* a reconsulta
> der certo (`if (r.ok)`). Sem token — ou numa falha transitória de rede — ele chama
> `erp_fiscal_update` com o corpo da requisição e a service role key. Hoje é inócuo
> porque `fiscal_documents` está vazia; passa a valer no dia da primeira nota.

> **Revisão de 18/09/2026 (`/mp-review`).** A promessa acima valia para todos, mas a
> postura variava. Três correções publicadas:
>
> - `portal-pix-webhook` era o único **sem validar `x-signature`** e, pior, devolvia
>   **200 em todo caminho, inclusive nas falhas** — para o MP, 200 é "tratei", então
>   uma queda momentânea perdia a notificação em definitivo e a cobrança ficava sem
>   liquidar. Hoje valida assinatura e devolve 5xx no que é transitório.
> - `pdv-pix-webhook` seguia adiante quando o segredo não estava configurado
>   (`if (!secret) return true`). Agora recusa com 503, como o `mp-point-webhook`.
> - `pedido-site-pix-webhook` (v59) ganhou o mesmo HMAC.
>
> Fora dos webhooks, a chave de idempotência do `pedido-site` era aleatória a cada
> chamada — não protegia de retry nenhum. Detalhe de cada uma em
> `supabase/functions/LEIAME.md`.

Duas edge functions do **PagSeguro/PagBank** (`pagseguro-charge`, `pagseguro-webhook`)
foram **removidas em 13/09/2026**: nunca foram usadas (0 de 86 pagamentos), não
apareciam no frontend e o webhook confiava no corpo da requisição. Os fontes ficam em
`supabase/functions/` — se o PagSeguro voltar ao roadmap, **o webhook não pode voltar
como estava**.

### Jobs agendados (pg_cron)
Diários: marcar vencidos (receber/pagar), assinaturas recorrentes, recompor estoque
mínimo, filas de push. De hora em hora / minutos: metas, caixa aberto, `push_dispatch_tick`
(2 min), `ops_run_maintenance` (15 min), **`pix-intents-expire`** (15 min — expira
cobranças PIX abandonadas).

## Integrações e segredos

Configurados como **secrets** das Edge Functions (nunca no frontend):

| Secret | Uso |
|---|---|
| `MP_ACCESS_TOKEN` | Mercado Pago (Point + PIX) |
| `MP_WEBHOOK_SECRET` | Valida assinatura dos webhooks do MP |
| `WA_API_URL` / `WA_API_TOKEN` | Provedor de WhatsApp (sem eles, `wa-send` só devolve link `wa.me`) |
| VAPID (`app_push_config`) | Web Push |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Padrão Supabase |

## Principais funcionalidades

- **Frente de Caixa (PDV):** vendas, descontos, múltiplas formas de pagamento,
  maquininha Point, PIX dinâmico, sangria/suprimento, vendas em espera, recibo térmico
  (layout padrão PedidoOK — ver [Impressão térmica](#impressão-térmica-cupom-fechamento-leitura-x)).
- **Crediário (contas a receber):** parcelas, recebimento no caixa, e **PIX enviado
  ao WhatsApp do cliente** — a cobrança fica em espera, pisca quando o cliente paga e,
  ao confirmar, sai o comprovante e entra no caixa.
- **Entregas:** fila, PIX de entrega, GPS do entregador, comprovação com foto/assinatura.
- **Estoque & Compras:** CRM de estoque, inventário, curva ABC, pedido inteligente,
  cotações, workflow de compras, transferências entre lojas.
- **Financeiro:** contas a pagar/receber, conciliação de cartões/MP, **Raio-X Financeiro**
  (margem medida pelo próprio sistema), Central de Decisão (índice de saúde + alertas,
  incl. "PIX pago aguardando confirmação").
- **Fidelidade:** cashback, vale-presente (gift cards).
- **Multi-loja:** lojas com **liga/desliga** — loja inativa some de todas as telas,
  seletores e relatórios (histórico preservado).
- **Assinaturas/recorrência**, **NPS**, **portal do cliente** e **push/WhatsApp**.
- **Cobrança automática de crediário por PIX no WhatsApp** — *opcional, desligada por
  padrão* (Configurações → "Cobrança automática por PIX"). Enriquece o lembrete de
  vencidos com um PIX copia-e-cola; liquida via portal (`portal_pix_settle`).

## Impressão térmica (cupom, fechamento, Leitura X)

Toda a impressão vive em `assets/js/onpdv-app.js`. Desde a **v56** o cupom de
pagamento adota o **layout padrão PedidoOK** — o mesmo estilo foi aplicado ao
**Fechamento de caixa** e à **Leitura X**.

> Na **v59** a fonte dos comprovantes, da Leitura X e do fechamento voltou ao tamanho
> normal (saía esticada).
>
> Na **v60** todos os caminhos que vão para papel passaram a compartilhar um único
> estilo, `onpdvCssTermicoBase()`: monoespaçada, **negrito** e `print-color-adjust:exact`.
> A térmica queima pontos no papel — letra fina vira cinza e o cliente não lê. O
> tamanho do cupom **não** subiu junto, porque é calibrado para 42 colunas em 80 mm;
> medimos antes que, em fonte monoespaçada, o peso não altera a largura do caractere
> (as mesmas 230,92px em 400 ou 700), então dá para engrossar sem quebrar as linhas de
> separação.
>
> Qualquer mudança aqui só chega ao caixa depois de **reinstalar** — ele roda dos
> arquivos locais do instalador, não do site.

**Layout do cupom** (função-núcleo `pdvReceiptPlain`):
- Cabeçalho centralizado (loja, cidade, `Impresso em`, `SEM VALOR FISCAL`);
- Dados do pedido (`Pedido / Numero`, `Emissao`, cliente);
- Tabela de itens `# CODIGO DESCRICAO` / `QTD UN VL UN R$ … VL ITEM R$`
  (descrição quebra em várias linhas; código vem de `ean`/`sku`/`codigo`);
- `Subtotal`, `Frete/Entrega`, `TOTAL`;
- `FORMA DE PAGAMENTO` e bloco `PARCELAS`.

**Canhoto (via de assinatura):** sai **apenas quando a venda é no crediário** — um
segundo bloco reduzido com as parcelas/vencimentos e a linha `assinatura do
cliente`. Vendas à vista/PIX/cartão não imprimem canhoto.

**Dois caminhos de impressão:**
- **RAW ESC/POS** (caixa desktop, via *bridge* local `/api/print` → `print-raw.ps1`):
  é o que imprime de fato na térmica (ex.: Epson TM-T20, codepage PC860). Enviado
  como texto de coluna fixa (42 col a 80 mm / 32 a 58 mm), centralizado na bobina.
- **HTML `<pre>`** (fallback navegador/nuvem, quando não há *bridge* local): mesmo
  texto renderizado em fonte monoespaçada, então **a pré-visualização é igual à
  impressão**.

**Caracteres especiais:** todo texto que vai para a impressora passa por
`pdvAscii()` no ponto único de saída (`onpdvPrintText`) — acentos viram a
letra-base (á→a, ç→c, ã→a, õ→o), sinais especiais viram equivalentes simples e
emoji são removidos. Assim o cupom sai limpo em qualquer impressora, sem depender
da tabela de caracteres.

**Bobina:** 80 mm (padrão) ou 58 mm, configurável **por terminal** (fica no
`localStorage` da máquina — é característica física da impressora, não dado de
negócio).

## Segurança

- **RLS em 100% das tabelas** (81/81); 33 tabelas "trancadas" (acesso só via RPC).
- **Isolamento de PII:** `customers`/`receivables`/`payments` restritos a staff
  (`is_staff()`) ou ao próprio cliente (`portal_my_customer_id()`).
- **Nenhuma função `SECURITY DEFINER` executável por `anon`** — verificado em
  13/09/2026 e agora verdadeiro. Até então `pdv_save_terminal` era a exceção: tinha
  `GRANT` para `anon` e o `EXECUTE` default para `PUBLIC`. Não era explorável (ela
  exige `is_admin()` na primeira linha), mas quebrava a invariante.
- **2FA (TOTP)** para admin (MFA nativo do Supabase) — imposto no banco via
  `is_admin_2fa()` nas superfícies sensíveis (com liberação segura p/ quem ainda não ativou).
- **Headers:** CSP estrita (via `<meta>`), HSTS, `X-Frame-Options: DENY`, nosniff, COOP,
  Referrer/Permissions-Policy. Nenhuma página bloqueia o zoom do usuário.
- **Webhooks** reconsultam o provedor e usam o corpo apenas como gatilho — com a
  exceção documentada do `fiscal-webhook`, acima.
- **Guardas de regressão:** os de frontend estão em `scripts/` (ver *Desenvolvimento,
  CI e testes*). Os de banco (`supabase/tests/backend_security_guards.sql`) **não estão
  nesta pasta** — entram na lista do que vive só no repositório de desenvolvimento
  (ver *Estrutura do repositório*).

### Um idioma do projeto que confunde na primeira leitura

Várias RPCs têm guardas nesta forma:

```sql
if not is_admin() and auth.uid() is not null and <venda de outra loja> then
  raise exception 'Sem permissão';
end if;
```

Quando **não há identidade** (`auth.uid()` nulo — service role ou pg_cron), a cadeia
`AND` inteira vira falsa e a guarda **não barra**. Isso é **deliberado**: é assim que
os jobs do pg_cron e as edge functions passam. O modelo de confiança é *"service_role
e cron ignoram a checagem de dono"*.

A consequência prática: **o perímetro de segurança não são as RPCs, é quem segura a
service role key e o que valida antes de chamar.** Foi exatamente aí que o
`pagseguro-webhook` falhou — era uma porta aberta na internet segurando essa chave.

`erp_mark_sale_paid` foi endurecida em 13/09/2026 para fechar por omissão (admin →
qualquer venda; autenticado → só a própria loja; `service_role` → permitido, mas
declarado; qualquer outro → recusado).

### Observabilidade do caixa

Erros não tratados na tela dos caixas iam só para `window.__onpdvErrors` — 50
registros em memória que somem quando a aba fecha. Agora `logErr()` também envia a
**mensagem** do erro para `client_error_log` (tabela trancada), via
`log_client_error`, com antiflood de 5 minutos por mensagem no servidor.

Sai apenas versão, terminal, papel e o texto do erro: **nada de venda, nada de dado de
cliente**. Para ler: aba **Auditoria → "Erros do caixa"** (só admin; a RPC
`erp_client_errors` filtra por `is_admin()` internamente).

## Deploy

**Site (estático) → Vercel.** Rode os guardas e os testes antes (ver *Desenvolvimento,
CI e testes*), depois suba o conteúdo da raiz mantendo `assets/`, `partials/`, `lib/`,
`icons/`, `downloads/`. `vercel.json` é a **fonte da verdade dos headers**. O
`version.json` avisa os caixas instalados de uma nova versão.

> **Onde vive a CSP.** No `<meta>` de cada página, não em header — e o
> `check-frontend.mjs` reprova qualquer página sem ela ou com `script-src` frouxo. O
> `frame-ancestors`, único que o `<meta>` não consegue aplicar, está coberto pelo
> `X-Frame-Options: DENY` do `vercel.json`.
>
> Havia um `_headers` (formato Netlify, ignorado pelo Vercel) com uma CSP paralela.
> Foi **removido em 18/09/2026**: além de inerte, estava defasado — faltavam
> `media-src 'self' blob:` (a captura de foto/vídeo do entregador) e `manifest-src`,
> então promovê-lo a header de verdade teria quebrado o app do entregador, porque duas
> CSPs se combinam pela **interseção**. Se um dia a CSP virar header, ela precisa ser
> derivada das `<meta>` atuais, não daquele arquivo.

**Backend → Supabase.** Migrations e edge functions são administradas separadamente
(CLI/painel).

> **Correção de um aviso antigo deste README:** não há drift de banco. O histórico
> remoto está íntegro, com 215 migrations desde `erp_01_schema_and_rls`. O que faltava
> era a pasta `supabase/` **neste repositório** — `supabase db pull` resolve o lado
> local (ver *Pendências*).

## Instalador do caixa (offline)

O caixa roda localmente a partir de um instalador `.bat` que embute o site.

> O `.gitattributes` marca `*.bat` e `*.zip` como binários de propósito: o instalador
> embute um ZIP, e normalização de fim de linha corromperia o pacote no checkout.
>
> **Como a v59 subiu com o instalador da v58.** O `version.json` e o `sw.js` da raiz
> foram para v59, mas o pacote em `downloads/` continuou com os rótulos da v58 — o
> código embutido já era o novo, só os carimbos ficaram para trás. O efeito: quem
> instalava recebia o comportamento certo e mesmo assim era avisado de "nova versão"
> para sempre. É o caso que `montar-publicacao.mjs` passou a recusar.

Gerar:

```bash
python scripts/build-installer.py            # usa a versão do version.json
python scripts/build-installer.py --conferir # só valida o pacote atual
```

Gera `downloads/onpdv-caixa.bat` (+ `.zip`) e confere o resultado sozinho: versão nos
quatro lugares, zip íntegro, todo arquivo do bundle igual ao do projeto e os cinco
arquivos de runtime do caixa preservados. Ao subir versão nova, atualize também
`version.json` e o badge em
`partials/onpdv-app.html` — e rode `node scripts/check-version.mjs`, que existe
justamente para reprovar quando um dos quatro fica para trás.

> **Confira os argumentos no próprio script antes de rodar.** A linha acima registra a
> intenção; o gerador não está nesta pasta, então a grafia exata das flags não pôde ser
> verificada aqui.

> **Nota histórica (gerador antigo em PowerShell).** O `build-installer.ps1` original se
> perdeu e foi reescrito em Node. Uma armadilha dele vale registrar caso reapareça: a
> validação do pacote usava `tar`, e com o Git Bash no `PATH` o `tar` dele interceptava
> e o build falhava (`Cannot connect to C:`). A validação rodava **antes** de
> sobrescrever `downloads/`, então uma falha ali não corrompia o pacote atual.

## Desenvolvimento, CI e testes

**Sem build/bundler** no fluxo normal: edita e publica. Node entra só para os guardas
e os testes — nada aqui depende de rede, de banco ou de segredo.

Rode tudo antes de publicar:

```bash
node scripts/check-version.mjs && node scripts/check-frontend.mjs && node --test tests/*.test.mjs
```

**Guardas** (`scripts/`) — cada um foi testado por mutação: a invariante foi quebrada
de propósito para confirmar que o guarda reprova. Um guarda que nunca falha não
protege nada.

| Guarda | Impede |
|---|---|
| `check-version.mjs` | Versão divergente entre os quatro arquivos |
| `check-frontend.mjs` | CSP frouxa, `<script>` inline, JSON inválido |
| `check-frontend.mjs` | Página bloqueando o zoom (`user-scalable=no`) |
| `check-frontend.mjs` | `<label for=>` órfão, ou dois rótulos no mesmo campo |
| `check-frontend.mjs` | Módulo sob demanda fora do `SHELL` do Service Worker |

**Testes** (`tests/`, `node --test`): rodam sobre **o arquivo que vai para a loja**,
carregado num sandbox `vm` — sem cópia paralela que envelhece. Cobrem a paginação
(inclusive o teto do servidor menor que a página), a comparação de versões, a
normalização ASCII do cupom e o **Service Worker** (`service-worker.test.mjs`: o
handler nunca pode resolver para algo que não seja uma `Response`, e o núcleo do
pré-cache é obrigatório). Os dez testes do SW foram conferidos por mutação.

> Uma armadilha registrada em `tests/carregar-app.mjs`: dentro do `vm`, o próprio
> `eval` cai no stub, então qualquer nome "existe" e todo teste passa sem testar nada.
> Por isso os nomes exportados são explícitos e conferidos contra o stub.

**CI** (`.github/workflows/ci.yml`): sintaxe de todos os JS, os dois guardas e os
testes, a cada push.

**Testes SQL:** `supabase test db` — depende de `supabase/tests/`, que ainda precisa
ser recuperado (ver *Pendências*).

## Versionamento

**Quatro** lugares devem bater ao publicar (ex. atual: `2026.09.18-v60`) —
`scripts/check-version.mjs` verifica os quatro e falha quando divergem:

1. `version.json` → `"version"` (é a fonte da verdade: o que os caixas consultam);
2. `const CACHE` em `sw.js`;
3. `const ONPDV_VERSION` em `assets/js/onpdv-app.js`;
4. badge do card do instalador em `partials/onpdv-app.html` (preenchido em runtime a
   partir de `ONPDV_VERSION`; o literal no HTML é fallback e precisa estar certo).

> **Por que o guarda existe.** Na v56 o `ONPDV_VERSION` ficou na v50. Como
> `checkForUpdate()` compara o `version.json` publicado contra essa constante, todo
> caixa recém-instalado na v56 era avisado de que havia uma "versão nova", baixava o
> mesmo instalador, e o aviso voltava.
>
> **Voltou a acontecer na v59.** O `version.json` e o `sw.js` subiram para v59 e o
> `ONPDV_VERSION` (mais o badge do `partials/`) ficaram na v58 — o guarda reprovava,
> mas ninguém o rodou antes de publicar. Corrigido em 18/09/2026. A lição é a de
> sempre: `node scripts/check-version.mjs` faz parte de publicar, não é opcional.
> O instalador tem que ser recarimbado junto, senão a correção não sai do site.

`PUBLICAR.txt` descreve a release e o procedimento de publicação. O que sobe é a
pasta gerada por `montar-publicacao.mjs`, **não** o conteúdo da raiz.

## Pendências

**De configuração (painel):**

- **Supabase → Authentication:** habilitar **2FA por app autenticador (TOTP)** e a
  **proteção contra senha vazada** (HaveIBeenPwned). O advisor confirma que a segunda
  segue desligada.
- **Cobrança automática por PIX (opcional):** vem desligada; ligue em Configurações e
  confira o provedor de WhatsApp antes.

**De engenharia:**

- **Publicar a v60.** O pacote está montado em `publicar-site-2026.09.18-v60/` e o
  instalador já foi recarimbado; falta subir para o Vercel.
- **Configurar `MP_WEBHOOK_SECRET`** (por loja, ex.: `MP_WEBHOOK_SECRET_ICONHA`). Sem
  ele os webhooks do Mercado Pago recusam com 503. A cobrança na maquininha não
  depende disso, mas o webhook é o que fecha a venda quando o aparelho demora mais que
  a edge function.
- **Trazer para cá o que falta do repositório de desenvolvimento** —
  `scripts/build-installer.mjs`, `scripts/montar-publicacao.mjs`, `caixa/`,
  `MANUTENCAO.md`, `supabase/tests/` (ver *Estrutura do repositório*). Sem os dois
  primeiros não dá para gerar release a partir desta pasta.
- **Usar o `montar-publicacao.mjs` para montar o pacote.** Ele recusa um pacote cujo
  instalador não seja o da release corrente — é exatamente a checagem que teria pego o
  descompasso v58/v59, e que foi contornada ao montar a pasta à mão.
- **`supabase db pull`** para trazer as 215 migrations do remoto. O banco **não** está
  com drift — o histórico está íntegro lá, desde `erp_01_schema_and_rls`; quem estava
  sem histórico era este repositório. O comando pede a senha do banco.
  ⚠️ Não rode `supabase migration repair --status reverted`: o CLI sugere isso quando a
  pasta local está vazia, mas o efeito é marcar as migrations como revertidas no
  histórico **remoto**.
- **Corrigir o `fiscal-webhook`** antes de ligar a NFC-e (ver *Edge Functions*).
- ~~**Unificar o CSS dos frontends secundários.**~~ **Reavaliada em 18/09/2026 e
  descartada.** A parte que importava — `:focus-visible` e `prefers-reduced-motion`
  em `cliente`, `entregador` e `vitrine` — foi feita direto, sem unificar nada. A
  unificação em si não se paga: medindo as regras CSS dos quatro arquivos, **nenhuma
  regra é idêntica nos quatro**, e a maior interseção entre um par é de 4 regras
  (`cliente` × `entregador`). São 96, 83, 115 e 137 regras, quase todas específicas
  da tela. O custo seria mexer em quatro telas para ganhar quase nada.

## Histórico de manutenção

**18/09/2026 — auditoria de funcionamento.** Varredura do sistema no ar (guardas,
testes, advisors do Supabase, site publicado). Os guardas e os 19 testes passavam, o
banco estava saudável e sem alerta de nível ERROR, e o pedido pelo site já operava
ponta a ponta. Dois defeitos reais e um erro de cadastro foram corrigidos:

| Área | Mudança |
|---|---|
| Caixa | `erp_cash_open` não gravava `store_id`: **as 35 sessões do banco estavam com NULL**, e a guarda de loja de `erp_cash_summary`, `pdv_cash_movements` e `erp_cash_history` (`store_id is distinct from my_store()`) devolvia vazio para todo não-admin — fechamento, Leitura X, sangria/suprimento e histórico em branco para os operadores. Corrigido e backfilled na migration `20260918120000_cash_session_store_id`, com autocura na reentrada |
| Release | `ONPDV_VERSION` e o badge do instalador alinhados na v59 (estavam na v58 contra um `version.json` v59 — a regressão descrita em *Versionamento*) |
| Cadastro | Terminal `CAIXAICONHA` movido para a loja **Iconha**; estava na **Modelo**, enquanto o operador que o usa e todas as vendas dele são da Iconha |
| Headers | `_headers` (formato Netlify, inerte no Vercel) removido — estava defasado e promovê-lo a header quebraria a captura de mídia do entregador |
| Mercado Pago | Revisão `/mp-review` contra o checklist oficial (MCP) mais o piso de segurança. Quatro edge functions corrigidas e publicadas, e `site_pedido_pix_contexto` alargada para mandar telefone e endereço do pagador ao antifraude — ver `supabase/functions/LEIAME.md` |
| Service Worker | `respondWith()` podia receber `undefined` quando a rede falhava e o item não estava no cache — o navegador estoura "Failed to convert value to 'Response'" e o arquivo não carrega. Agora responde erro de rede honesto (ou página de aviso, na navegação). O pré-cache do NÚCLEO virou tudo-ou-nada: CSS que falha reprova a instalação em vez de deixar um cache furado |
| Empacotamento | `scripts/montar-publicacao.mjs` e `scripts/build-installer.py`: o pacote deixou de ser a raiz do repositório (o site servia `scripts/`, `tests/` e as migrations SQL) e o instalador voltou a ser recarimbável |
| Frontend | Acessibilidade das 3 telas secundárias (foco visível, `prefers-reduced-motion`, regiões de status com `aria-live`); CSS do Raio-X saiu do login e passou a carregar com o módulo; banner de seção do PDV, que faltava, no `onpdv-app.js` |
| Documentação | `PUBLICAR.txt` e este README atualizados |

**18/09/2026, continuação — o dia em que o caixa foi usado de verdade.** A operação
tentou vender e cada tentativa expôs um defeito diferente. Todos já estão no ar:

| Área | Mudança |
|---|---|
| Impressão | Os recibos do ERP saíam **em branco**. `printReceipt` e outras cinco telas montavam o recibo em `#receiptPrint` e chamavam `window.print()`, contando com o `@media print` esconder o resto — só que a regra era `body>*{display:none}` e o `#receiptPrint` mora dentro de `<main id="appHost">`. `display:none` no pai vence qualquer `display:block!important` no filho. Corrigido o CSS **e** trocado o mecanismo: cada recibo sai num documento próprio (`onpdvImprimirRecibo`), que não depende do layout da tela. O defeito era antigo — conferido no bundle da v58 |
| Impressão | Fonte padronizada em todos os caminhos (`onpdvCssTermicoBase`): negrito e `print-color-adjust:exact`. Letra fina queima poucos pontos na térmica e sai cinza. O tamanho do cupom **não** mudou, porque é calibrado para 42 colunas; medido antes que em monoespaçada o peso não altera a largura do caractere |
| Pagamento | `payments.metodo` gravava sempre `'cartao'`. `erp_pos_resolve` tinha `pos_payment_requests.tipo` (débito/crédito/pix) em mãos e não o copiava. O resto do sistema já esperava por isso — `pdv__by_payment`, `erp_card_report`, `erp_cash_summary` e `pdvPayMethodLabel` já tratavam os três. Agora o recibo diz **CARTAO DEBITO / CARTAO CREDITO / PIX** e o fechamento separa as linhas. `erp_pos_void` ajustado junto, senão nenhum pagamento na maquininha poderia mais ser estornado |
| Recibo | Bloco `PARCELAS` removido da venda à vista (repetia o total em quatro linhas). Mantido no crediário, onde o cliente lê os vencimentos |
| Maquininha | Ordem presa no aparelho travava toda cobrança seguinte (`There is already a queued order on the terminal`), e o operador via só "Não consegui acionar a maquininha": o frontend **descartava** a mensagem do servidor. Agora `pos-cloud-charge` tenta liberar a fila sozinho, devolve 409 com instrução acionável, e `posQueueAttempt` mostra o motivo real. `cancelCharge` parou de engolir a falha do cancelamento — era o que deixava a ordem pendurada sem rastro |
| Configuração | Card "Device ID global" removido: nada o lia, e a tela prometia um fallback que o servidor nunca implementou. Maquininha sem Device ID agora aparece como "sem Device ID · não cobra". `savePdvConfig` passou a preservar as demais chaves do `pdv_config` — antes sobrescrevia o objeto inteiro e teria apagado `pedido_site` e `min_auto` |
| Testes | `service-worker.test.mjs` (10) e `recibo-formas.test.mjs` (7), ambos conferidos por mutação. Total: **36** |
| Guardas | `check-frontend.mjs` ganhou a checagem nº 7: o `@media print` não pode voltar a esconder ancestrais com `display:none` |

Pendente: publicar o pacote e configurar `MP_WEBHOOK_SECRET` (ver *Pendências*).

**13/09/2026 — revisão de engenharia.** O repositório entrou em git (antes esta pasta
era o pacote publicado, sem histórico). Resumo do que mudou:

| Área | Mudança |
|---|---|
| Release | `ONPDV_VERSION` alinhado; guarda de versão nos quatro arquivos |
| Dados | `fetchAllRows()` pagina `customers`, `v_customer_balance` e o fallback de `products` — o teto de linhas do PostgREST trunca em silêncio, sem erro |
| Segurança | `pdv_save_terminal` fora do alcance de `anon`; `erp_mark_sale_paid` fecha por omissão; edge functions PagSeguro removidas |
| Observabilidade | `client_error_log` + tela em Auditoria |
| Arquitetura | Módulo Compras extraído para carregamento sob demanda (−42 KB no login) |
| Acessibilidade | Zoom restaurado nas 3 telas móveis; 269 rótulos associados aos campos |
| Qualidade | 19 testes, 5 guardas de frontend e CI de volta |

Detalhe de cada item nas mensagens de commit — elas registram o *porquê*, não só o
*o quê*.
