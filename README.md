# ONPDV — ERP & Frente de Caixa

Sistema de gestão (ERP) e ponto de venda (PDV) para varejo — usado pela operação
**Petville** (petshop, múltiplas lojas). É um PWA **offline-first** em JavaScript
vanilla (sem framework/bundler) sobre um backend **Supabase** (PostgreSQL), com
integrações de pagamento (**Mercado Pago** — Point + PIX), fiscal (**NFC-e**) e
mensageria (**WhatsApp** / Web Push).

> Versão atual: **2026.09.08-v55** (ver `version.json`).

---

## Sumário
- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Frontends](#frontends)
- [Backend (Supabase)](#backend-supabase)
- [Integrações e segredos](#integrações-e-segredos)
- [Principais funcionalidades](#principais-funcionalidades)
- [Segurança](#segurança)
- [Deploy](#deploy)
- [Instalador do caixa (offline)](#instalador-do-caixa-offline)
- [Desenvolvimento, CI e testes](#desenvolvimento-ci-e-testes)
- [Versionamento](#versionamento)
- [Pendências de configuração](#pendências-de-configuração)

---

## Arquitetura

```
┌─────────────────────────────────────────────┐        ┌──────────────────────────────┐
│  Frontends (PWA, JS vanilla, servidos estát.)│        │  Supabase (projeto ONPDV)    │
│  • index.html   → Caixa/ERP (backoffice+PDV) │        │  • PostgreSQL 17 + RLS       │
│  • cliente.html → Portal do cliente          │  HTTPS │  • ~283 funções (RPC-first)  │
│  • entregador.html → App do entregador       │ ─────▶ │  • Auth (e-mail/senha + 2FA) │
│  • vitrine.html → Display para o cliente      │  WSS   │  • 19 Edge Functions (Deno)  │
│  Service Worker (offline) + IndexedDB cache  │        │  • pg_cron (9 jobs)          │
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
│   ├── js/onpdv-app.js         # App principal (~9.900 linhas)
│   ├── js/onpdv-bootstrap.js   # Bootstrap: login + carrega o app
│   ├── js/onpdv-raiox.js       # Raio-X Financeiro
│   ├── js/{cliente,entregador,vitrine}.js
│   └── css/{onpdv,onpdv-raiox}.css
├── lib/                       # leaflet (mapa) + qrcode.js (QR local)
├── icons/ , *.webmanifest     # PWA
├── sw.js                      # Service Worker (network-first p/ código; cache offline)
├── version.json               # Versão publicada (checagem de update dos caixas)
├── vercel.json                # Headers HTTP no Vercel (FONTE DA VERDADE de headers)
├── _headers                   # (Formato Netlify — IGNORADO no Vercel; só referência)
├── downloads/                 # Instalador do caixa offline (.bat + .zip)
├── scripts/build-installer.ps1# Empacota o instalador (PowerShell)
├── supabase/
│   ├── migrations/            # Migrations versionadas (recentes; ver "drift")
│   ├── functions/             # Cópias de referência de edge functions
│   └── tests/                 # Testes SQL (transacionais) + guardas de segurança
├── .github/workflows/ci.yml   # CI (node --check, JSON, guardas de frontend)
├── MANUTENCAO.md              # Notas de DevOps/manutenção
└── README.md                  # Este arquivo
```

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
- **Escala:** ~78 tabelas (100% com RLS), ~283 funções (~274 `SECURITY DEFINER`,
  todas com `search_path` fixado), ~208 migrations aplicadas.
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
  maquininha Point, PIX dinâmico, sangria/suprimento, vendas em espera, recibo térmico.
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

## Segurança

- **RLS em 100% das tabelas**; 30 tabelas "trancadas" (acesso só via RPC).
- **Isolamento de PII:** `customers`/`receivables`/`payments` restritos a staff
  (`is_staff()`) ou ao próprio cliente (`portal_my_customer_id()`).
- **Nenhuma função `SECURITY DEFINER` executável por `anon`**.
- **2FA (TOTP)** para admin (MFA nativo do Supabase) — imposto no banco via
  `is_admin_2fa()` nas superfícies sensíveis (com liberação segura p/ quem ainda não ativou).
- **Headers:** CSP estrita (via `<meta>`), HSTS, `X-Frame-Options: DENY`, nosniff, COOP,
  Referrer/Permissions-Policy.
- **Webhooks** reconsultam o provedor (nunca confiam no corpo) e validam assinatura.
- **Guardas de regressão:** `supabase/tests/backend_security_guards.sql` (6 invariantes).

## Deploy

**Site (estático) → Vercel.** Suba o conteúdo da raiz mantendo `assets/`, `partials/`,
`lib/`, `icons/`, `downloads/`. `vercel.json` define os headers (o `_headers` é formato
Netlify e é **ignorado** no Vercel). O `version.json` avisa os caixas instalados de
uma nova versão.

**Backend → Supabase.** Migrations e edge functions são administradas separadamente
(CLI/painel). ⚠️ **Drift conhecido:** o schema-núcleo foi criado antes da pasta
`supabase/migrations/`; rode `supabase db pull` uma vez para versionar o baseline
(ver `MANUTENCAO.md`).

## Instalador do caixa (offline)

O caixa roda localmente a partir de um instalador `.bat` que embute o site. Gerar:

```powershell
# na raiz do repositório
scripts\build-installer.ps1 -Release '2026.09.07-v54'
# opcional: minifica os assets do bundle (conservador, sem renomear identificadores)
scripts\build-installer.ps1 -Release '2026.09.07-v54' -Minify
```

Gera `downloads/onpdv-caixa.bat` (+ `.zip`) e carimba o cache do Service Worker com a
versão. Ao subir versão nova, atualize `version.json` e o badge em `partials/onpdv-app.html`.

## Desenvolvimento, CI e testes

- **Sem build/bundler** no fluxo normal: edita e publica. (Node só para `node --check`
  e o `-Minify` opcional.)
- **CI** (`.github/workflows/ci.yml`): `node --check` nos JS, validação de JSON/
  webmanifests e guardas de frontend (portais sem script inline, CSP estrita, HSTS).
  Passo opcional roda os guardas do banco via `psql` se o secret `SUPABASE_DB_URL` existir.
- **Testes SQL:** `supabase test db` (ou cole os `.sql` de `supabase/tests/` no SQL Editor).

## Versionamento

Três lugares devem bater ao publicar:
1. `version.json` → `"version"` (ex.: `2026.09.07-v54`);
2. badge em `partials/onpdv-app.html`;
3. `const CACHE` em `sw.js` (o build carimba a cópia do bundle automaticamente).

## Pendências de configuração

- **Supabase → Authentication:** habilitar **2FA por app autenticador (TOTP)** e a
  **proteção contra senha vazada** (HaveIBeenPwned). Ver `supabase/CHECKLIST-PAINEL.md`.
- **Cobrança automática por PIX (opcional):** vem desligada; ligue em Configurações e
  confira o provedor de WhatsApp antes.

---

_Documentação de manutenção detalhada em `MANUTENCAO.md`._
