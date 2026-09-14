# ONPDV — ERP & Frente de Caixa

Sistema de gestão (ERP) e ponto de venda (PDV) para varejo — usado pela operação
**Petville** (petshop, múltiplas lojas). É um PWA **offline-first** em JavaScript
vanilla (sem framework/bundler) sobre um backend **Supabase** (PostgreSQL), com
integrações de pagamento (**Mercado Pago** — Point + PIX), fiscal (**NFC-e**) e
mensageria (**WhatsApp** / Web Push).

> Versão publicada: **2026.09.09-v56** (ver `version.json`).
>
> ⚠️ O repositório está **à frente do que está no ar**: há mudanças commitadas em
> 13/09/2026 que ainda não foram publicadas no Vercel. Ver *Pendências*.

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
├── partials/onpdv-app.html    # Markup do app principal (injetado no index)
├── assets/
│   ├── js/onpdv-app.js         # App principal (~9.750 linhas)
│   ├── js/onpdv-bootstrap.js   # Bootstrap: login + carrega o app
│   ├── js/onpdv-raiox.js       # Raio-X Financeiro (sob demanda)
│   ├── js/onpdv-compras.js     # Módulo Compras (sob demanda)
│   ├── js/{cliente,entregador,vitrine}.js
│   └── css/{onpdv,onpdv-raiox}.css
├── lib/                       # leaflet (mapa) + qrcode.js (QR local)
├── icons/ , *.webmanifest     # PWA
├── sw.js                      # Service Worker (network-first p/ código; cache offline)
├── version.json               # Versão publicada (checagem de update dos caixas)
├── vercel.json                # Headers HTTP no Vercel (FONTE DA VERDADE de headers)
├── _headers                   # (Formato Netlify — IGNORADO no Vercel; só referência)
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

> **Faltando neste repositório:** `scripts/build-installer.ps1`, `MANUTENCAO.md` e
> `supabase/tests/`. Enquanto o primeiro não voltar, **o instalador do caixa não pode
> ser regerado** — qualquer release nova sai com o `downloads/onpdv-caixa.bat` da v56.
> Se existirem numa cópia antiga ou em outra máquina, vale trazê-los antes que a
> memória de como o instalador é montado se perca.

## Frontends

| Página | Público | Autenticação | Observações |
|---|---|---|---|
| `index.html` | Operadores/admin | Supabase (e-mail/senha, 2FA p/ admin) | Backoffice + Frente de Caixa (PDV) |
| `cliente.html` | Clientes | Supabase (conta de cliente) | Contas, cashback, pets, pagar por PIX |
| `entregador.html` | Motoboy | Supabase (papel `motoboy`) | Fila de entregas, GPS, comprovação |
| `vitrine.html` | Exibição | Sem login | Mostra a venda/QR PIX ao cliente |

- Papéis (`app_users.papel`): `admin`, `operador`, `motoboy`.
- Todas as páginas têm **CSP estrita** em `<meta>` (sem `unsafe-inline` em script);
  handlers de UI usam delegação (`data-act` / `data-onclick`), não `onclick=` inline.

## Backend (Supabase)

- **Projeto:** ONPDV (`qkhpvqepgozsaamxmugk`), PostgreSQL 17, região us-east-1.
- **Escala:** 81 tabelas (100% com RLS, 33 "trancadas" — sem policy, acesso só via
  RPC), 288 funções (279 `SECURITY DEFINER`, todas com `search_path` fixado),
  215 migrations aplicadas.
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
  neste repositório** — vieram junto com `scripts/build-installer.ps1` e
  `MANUTENCAO.md` na lista do que falta recuperar.

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
`icons/`, `downloads/`. `vercel.json` define os headers (o `_headers` é formato Netlify
e é **ignorado** no Vercel). O `version.json` avisa os caixas instalados de uma nova
versão.

**Backend → Supabase.** Migrations e edge functions são administradas separadamente
(CLI/painel).

> **Correção de um aviso antigo deste README:** não há drift de banco. O histórico
> remoto está íntegro, com 215 migrations desde `erp_01_schema_and_rls`. O que faltava
> era a pasta `supabase/` **neste repositório** — `supabase db pull` resolve o lado
> local (ver *Pendências*).

## Instalador do caixa (offline)

O caixa roda localmente a partir de um instalador `.bat` que embute o site.

> ⚠️ **`scripts/build-installer.ps1` não está neste repositório**, então o instalador
> **não pode ser regerado** hoje — o `downloads/onpdv-caixa.bat` versionado é o da v56
> e sairá desatualizado em qualquer release nova. As instruções abaixo ficam para
> quando o script voltar.
>
> O `.gitattributes` marca `*.bat` e `*.zip` como binários de propósito: o instalador
> embute um ZIP, e normalização de fim de linha corromperia o pacote no checkout.

Gerar:

```powershell
# na raiz do repositório
scripts\build-installer.ps1 -Release '2026.09.09-v56'
# opcional: minifica os assets do bundle (conservador, sem renomear identificadores)
scripts\build-installer.ps1 -Release '2026.09.09-v56' -Minify
```

Gera `downloads/onpdv-caixa.bat` (+ `.zip`) e carimba o cache do Service Worker com a
versão. Ao subir versão nova, atualize `version.json` e o badge em `partials/onpdv-app.html`.

> **Nota (ambiente Windows):** a validação do pacote usa `tar`. Se o Git Bash estiver
> no `PATH`, o `tar` dele intercepta e o build falha (`Cannot connect to C:`). Rode
> com o `tar` do Windows à frente:
> `powershell -Command "$env:PATH='C:\Windows\System32;'+$env:PATH; & scripts\build-installer.ps1 -Release '2026.09.09-v56'"`.
> A validação roda **antes** de sobrescrever `downloads/`, então uma falha aí não corrompe o pacote atual.

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
(inclusive o teto do servidor menor que a página), a comparação de versões e a
normalização ASCII do cupom.

> Uma armadilha registrada em `tests/carregar-app.mjs`: dentro do `vm`, o próprio
> `eval` cai no stub, então qualquer nome "existe" e todo teste passa sem testar nada.
> Por isso os nomes exportados são explícitos e conferidos contra o stub.

**CI** (`.github/workflows/ci.yml`): sintaxe de todos os JS, os dois guardas e os
testes, a cada push.

**Testes SQL:** `supabase test db` — depende de `supabase/tests/`, que ainda precisa
ser recuperado (ver *Pendências*).

## Versionamento

**Quatro** lugares devem bater ao publicar (ex. atual: `2026.09.09-v56`) —
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

`PUBLICAR.txt` descreve a release publicada. (A pasta `publicar-site-v56/` que ele
menciona não está neste repositório — o conteúdo da raiz é o que sobe.)

## Pendências

**De configuração (painel):**

- **Supabase → Authentication:** habilitar **2FA por app autenticador (TOTP)** e a
  **proteção contra senha vazada** (HaveIBeenPwned). O advisor confirma que a segunda
  segue desligada.
- **Cobrança automática por PIX (opcional):** vem desligada; ligue em Configurações e
  confira o provedor de WhatsApp antes.

**De engenharia:**

- **Publicar.** As mudanças de 13/09/2026 estão commitadas, **não publicadas** no
  Vercel. Junto vem uma decisão de release: subir sob a mesma v56 não avisa os caixas
  instalados, e o instalador em `downloads/` continua com o código antigo.
- **Recuperar `scripts/build-installer.ps1`, `MANUTENCAO.md` e `supabase/tests/`** (ver *Estrutura do
  repositório*). Sem o primeiro o instalador não pode ser regerado.
- **`supabase db pull`** para trazer as 215 migrations do remoto. O banco **não** está
  com drift — o histórico está íntegro lá, desde `erp_01_schema_and_rls`; quem estava
  sem histórico era este repositório. O comando pede a senha do banco.
  ⚠️ Não rode `supabase migration repair --status reverted`: o CLI sugere isso quando a
  pasta local está vazia, mas o efeito é marcar as migrations como revertidas no
  histórico **remoto**.
- **Corrigir o `fiscal-webhook`** antes de ligar a NFC-e (ver *Edge Functions*).
- **Unificar o CSS dos frontends secundários.** `cliente`, `entregador` e `vitrine`
  não usam `onpdv.css` — cada um tem seu `<style>` embutido, e nenhum tem
  `:focus-visible` nem `prefers-reduced-motion`. Não é correção mecânica: exige decidir
  o que é design compartilhado e o que é específico de cada app.

## Histórico de manutenção

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
