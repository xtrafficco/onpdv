// ONPDV · pdv-pix-payment
// PIX dinâmico no caixa (Mercado Pago). O frontend (index.html) chama:
//   action=create {sessionId, customerId, items:[{id,vid,qty,disc}], discount, surcharge, cashback, payer:{name,email}}
//   action=create (ENTREGA) {sessionId, kind:'entrega', customerId, deliv:{items,frete,endereco,obs,origin_store}, payer}
//   action=create (CREDIÁRIO) {sessionId, kind:'crediario', customerId, recv:{ids:[uuid], valor, venc_saldo}, payer}
//   action=status {intentId, paymentId}
//   action=cancel {intentId, paymentId}
// Venda de balcão: na aprovação finaliza a venda via RPC pdv_pix_complete (idempotente).
// Entrega (kind=entrega): na aprovação NÃO cria venda de balcão — apenas marca a intent
//   como paga e devolve o payload da entrega, para o caixa despachar para a fila depois.
// Crediário (kind=crediario): na aprovação apenas marca a intent como paga; o caixa
//   confirma o recebimento depois via RPC pdv_receivables_pix_finalize (quita as parcelas).
// Reaproveita o secret MP_ACCESS_TOKEN já usado no Mercado Pago Point / portal-pix.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
const MP_BASE = "https://api.mercadopago.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ONPDV_ALLOWED_ORIGINS") ||
    "https://onpdv.netlify.app,http://127.0.0.1:8765,http://localhost:8765,http://127.0.0.1:4173,http://127.0.0.1:4174")
    .split(",").map((o) => o.trim()).filter(Boolean),
);

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const corsFor = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sbRest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error(`Supabase REST ${r.status}: ${txt}`);
  return data;
}
async function rpc(name: string, args: Record<string, unknown>) {
  return await sbRest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

async function requireStaff(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new HttpError(401, "Autenticação obrigatória.");
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIC_KEY, Authorization: authorization },
  });
  if (!userRes.ok) throw new HttpError(401, "Sessão inválida ou expirada.");
  const user = await userRes.json();
  if (!user?.id) throw new HttpError(401, "Usuário inválido.");
  const q = new URLSearchParams({ id: `eq.${user.id}`, ativo: "is.true", select: "id,nome,papel,store_id", limit: "1" });
  const [staff] = await sbRest(`app_users?${q}`);
  if (!staff) throw new HttpError(403, "Usuário sem acesso de operador.");
  return staff as { id: string; nome: string; papel: string; store_id: string | null };
}

async function mpGetPayment(id: string) {
  const r = await fetch(`${MP_BASE}/v1/payments/${id}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
function mapStatus(mp: string): string {
  if (mp === "approved") return "paid";
  if (mp === "cancelled" || mp === "rejected") return mp;
  if (mp === "expired") return "expired";
  return "pending";
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Normaliza o payload da entrega e recalcula o total no servidor (mesmo modelo de
// confiança do erp_delivery_create: os preços unitários vêm do caixa autenticado).
function buildDeliv(body: any) {
  const src = body?.deliv || {};
  const items = Array.isArray(src.items) ? src.items : [];
  if (!items.length) throw new HttpError(400, "Entrega sem itens.");
  const clean = items.map((it: any) => ({
    product_id: it?.product_id && UUID_RE.test(String(it.product_id)) ? String(it.product_id) : null,
    descricao: String(it?.descricao || "Item").slice(0, 200),
    qtd: Number(it?.qtd || 0),
    preco_unit: Number(it?.preco_unit || 0),
    custo_unit: Number(it?.custo_unit || 0),
  }));
  const sub = round2(clean.reduce((a: number, it: any) => a + it.qtd * it.preco_unit, 0));
  const frete = round2(Number(src.frete || 0));
  const amount = round2(sub + frete);
  const endereco = String(src.endereco || "").trim();
  if (!endereco) throw new HttpError(400, "Informe o endereço de entrega.");
  if (!(amount > 0)) throw new HttpError(400, "Total da entrega inválido.");
  const origin_store = src.origin_store && UUID_RE.test(String(src.origin_store)) ? String(src.origin_store) : null;
  const store = src.store && UUID_RE.test(String(src.store)) ? String(src.store) : null;
  const obs = src.obs != null ? String(src.obs).slice(0, 500) : null;
  return { deliv: { items: clean, frete, endereco, obs, origin_store, store, sub }, amount };
}

// Valida a seleção do crediário no servidor: as parcelas precisam existir, estar em
// aberto e pertencer ao mesmo cliente informado. O valor a receber (parcial ou total)
// nunca pode passar do total selecionado.
async function buildRecv(body: any, customerId: string | null) {
  if (!customerId) throw new HttpError(400, "Recebimento exige cliente.");
  const src = body?.recv || {};
  const ids = (Array.isArray(src.ids) ? src.ids : [])
    .filter((x: unknown) => UUID_RE.test(String(x))).map((x: unknown) => String(x));
  if (!ids.length) throw new HttpError(400, "Selecione ao menos uma parcela.");
  const q = new URLSearchParams({
    id: `in.(${ids.join(",")})`,
    status: "in.(aberta,vencida)",
    select: "id,valor,customer_id",
  });
  const rows = await sbRest(`receivables?${q}`);
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(409, "As parcelas não estão mais em aberto.");
  const custs = new Set(rows.map((r: any) => String(r.customer_id)));
  if (custs.size > 1) throw new HttpError(400, "Selecione parcelas de um único cliente.");
  if (![...custs][0] || [...custs][0] !== customerId) throw new HttpError(400, "As parcelas são de outro cliente.");
  const total = round2(rows.reduce((a: number, r: any) => a + Number(r.valor || 0), 0));
  const valor = src.valor != null ? round2(Number(src.valor)) : total;
  if (!(valor > 0)) throw new HttpError(400, "Informe o valor a receber.");
  if (valor > total + 0.005) throw new HttpError(400, "O valor a receber é maior que o total selecionado.");
  const venc_saldo = src.venc_saldo && /^\d{4}-\d{2}-\d{2}$/.test(String(src.venc_saldo)) ? String(src.venc_saldo) : null;
  return { recv: { ids, valor, venc_saldo, total }, amount: valor };
}

async function actionCreate(req: Request, staff: any, body: any) {
  if (!MP_TOKEN) throw new HttpError(400, "Configure o secret MP_ACCESS_TOKEN no projeto.");
  const kindRaw = String(body?.kind || "venda");
  const kind = kindRaw === "entrega" ? "entrega" : (kindRaw === "crediario" ? "crediario" : "venda");
  const sessionId = String(body?.sessionId || "");
  if (!UUID_RE.test(sessionId)) throw new HttpError(400, "Sessão de caixa inválida.");
  const [ses] = await sbRest(`cash_sessions?id=eq.${sessionId}&select=id,store_id,operador,status&limit=1`);
  if (!ses) throw new HttpError(404, "Sessão de caixa não encontrada.");
  if (ses.status !== "aberta") throw new HttpError(409, "O caixa não está aberto.");
  if (staff.papel !== "admin" && staff.store_id && ses.store_id && staff.store_id !== ses.store_id) {
    throw new HttpError(403, "Caixa de outra loja.");
  }

  const customerId = body?.customerId && UUID_RE.test(String(body.customerId)) ? String(body.customerId) : null;

  let amount: number;
  let intentBody: Record<string, unknown>;
  let mpDescription: string;

  if (kind === "entrega") {
    if (!customerId) throw new HttpError(400, "Entrega exige cliente.");
    const built = buildDeliv(body);
    amount = built.amount;
    mpDescription = "PDV · entrega PIX";
    intentBody = {
      session_id: sessionId, store_id: ses.store_id, customer_id: customerId, operador: ses.operador,
      items: [], discount: 0, surcharge: 0, cashback: 0, amount, status: "pending",
      kind: "entrega", deliv: built.deliv,
    };
  } else if (kind === "crediario") {
    const built = await buildRecv(body, customerId);
    amount = built.amount;
    mpDescription = "PDV · crediário PIX";
    intentBody = {
      session_id: sessionId, store_id: ses.store_id, customer_id: customerId, operador: ses.operador,
      items: [], discount: 0, surcharge: 0, cashback: 0, amount, status: "pending",
      kind: "crediario", recv: built.recv,
    };
  } else {
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) throw new HttpError(400, "Venda sem itens.");
    const discount = Number(body?.discount || 0);
    const surcharge = Number(body?.surcharge || 0);
    const cashback = Number(body?.cashback || 0);
    amount = Number(await rpc("pdv_pix_quote", {
      p_customer: customerId, p_items: items, p_discount: discount, p_surcharge: surcharge, p_cashback: cashback,
    }));
    if (!(amount > 0)) throw new HttpError(400, "Total da venda inválido.");
    mpDescription = "PDV · venda PIX";
    intentBody = {
      session_id: sessionId, store_id: ses.store_id, customer_id: customerId, operador: ses.operador,
      items, discount, surcharge, cashback, amount, status: "pending", kind: "venda",
    };
  }

  const [intent] = await sbRest("pdv_pix_intents", { method: "POST", body: JSON.stringify(intentBody) });

  const payer: any = { email: body?.payer?.email || `caixa-${sessionId}@onpdv.local` };
  const nm = String(body?.payer?.name || "Cliente balcão").trim().split(/\s+/);
  payer.first_name = nm[0] || "Cliente";
  if (nm.length > 1) payer.last_name = nm.slice(1).join(" ");

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  let mp: any = {};
  try {
    const mpRes = await fetch(`${MP_BASE}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description: mpDescription,
        payment_method_id: "pix",
        external_reference: intent.id,
        payer,
      }),
    });
    mp = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mp?.id) throw new Error(mp?.message || "Mercado Pago recusou a cobrança.");
  } catch (e) {
    await sbRest(`pdv_pix_intents?id=eq.${intent.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "rejected", updated_at: new Date().toISOString() }),
    });
    throw new HttpError(502, (e as Error).message);
  }
  const tx = mp?.point_of_interaction?.transaction_data || {};
  await sbRest(`pdv_pix_intents?id=eq.${intent.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      mp_payment_id: String(mp.id), qr_code: tx.qr_code || null, qr_code_base64: tx.qr_code_base64 || null,
      expires_at: expiresAt.toISOString(),
      status: mp.status === "approved" ? "paid" : "pending", updated_at: new Date().toISOString(),
    }),
  });

  const baseOut: Record<string, unknown> = {
    ok: true, intentId: intent.id, paymentId: String(mp.id), total: amount, kind,
    qrCode: tx.qr_code || "", qrCodeBase64: tx.qr_code_base64 || "", expiresAt: expiresAt.toISOString(),
  };

  if (mp.status === "approved") {
    if (kind === "entrega") {
      return json(req, { ...baseOut, approved: true, delivery: true, deliv: (intentBody as any).deliv });
    }
    if (kind === "crediario") {
      return json(req, { ...baseOut, approved: true, crediario: true, recv: (intentBody as any).recv });
    }
    const sale = await rpc("pdv_pix_complete", { p_intent: intent.id });
    return json(req, { ...baseOut, approved: true, sale });
  }

  return json(req, baseOut);
}

async function loadIntent(id: string) {
  if (!UUID_RE.test(id)) throw new HttpError(400, "Cobrança inválida.");
  const [i] = await sbRest(`pdv_pix_intents?id=eq.${id}&select=id,mp_payment_id,status,kind,deliv,recv,amount,sale_result&limit=1`);
  if (!i) throw new HttpError(404, "Cobrança não encontrada.");
  return i;
}

// Resposta de "pago" conforme o tipo da intent.
async function paidResponse(req: Request, i: any) {
  if (i.kind === "entrega") {
    return json(req, { ok: true, approved: true, delivery: true, deliv: i.deliv, total: i.amount });
  }
  if (i.kind === "crediario") {
    return json(req, { ok: true, approved: true, crediario: true, recv: i.recv, total: i.amount });
  }
  const sale = i.sale_result || await rpc("pdv_pix_complete", { p_intent: i.id });
  return json(req, { ok: true, approved: true, sale });
}

async function actionStatus(req: Request, body: any) {
  const i = await loadIntent(String(body?.intentId || ""));
  if (i.status === "paid") return await paidResponse(req, i);
  if (["cancelled", "rejected", "expired"].includes(i.status)) return json(req, { ok: true, status: i.status });
  if (!i.mp_payment_id || !MP_TOKEN) return json(req, { ok: true, status: "pending" });

  const { ok, data } = await mpGetPayment(i.mp_payment_id);
  if (!ok) return json(req, { ok: true, status: "pending" });
  const mapped = mapStatus(String(data.status || ""));
  if (mapped === "paid") {
    await sbRest(`pdv_pix_intents?id=eq.${i.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "paid", updated_at: new Date().toISOString() }),
    });
    return await paidResponse(req, i);
  }
  if (mapped !== "pending") {
    await sbRest(`pdv_pix_intents?id=eq.${i.id}`, {
      method: "PATCH", body: JSON.stringify({ status: mapped, updated_at: new Date().toISOString() }),
    });
    return json(req, { ok: true, status: mapped });
  }
  return json(req, { ok: true, status: "pending" });
}

async function actionCancel(req: Request, body: any) {
  const i = await loadIntent(String(body?.intentId || ""));
  if (i.status === "paid") return await paidResponse(req, i);
  if (i.mp_payment_id && MP_TOKEN) {
    const { ok, data } = await mpGetPayment(i.mp_payment_id);
    if (ok && String(data.status) === "approved") {
      await sbRest(`pdv_pix_intents?id=eq.${i.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "paid", updated_at: new Date().toISOString() }),
      });
      return await paidResponse(req, i);
    }
    try {
      await fetch(`${MP_BASE}/v1/payments/${i.mp_payment_id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ status: "cancelled" }),
      });
    } catch (_) { /* best-effort */ }
  }
  await sbRest(`pdv_pix_intents?id=eq.${i.id}`, {
    method: "PATCH", body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
  });
  return json(req, { ok: true, cancelled: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  try {
    const staff = await requireStaff(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "create");
    if (action === "create") return await actionCreate(req, staff, body);
    if (action === "status") return await actionStatus(req, body);
    if (action === "cancel") return await actionCancel(req, body);
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error("pdv-pix-payment", e);
    return json(req, { ok: false, error: status === 500 ? "Falha interna." : (e as Error).message }, status);
  }
});
