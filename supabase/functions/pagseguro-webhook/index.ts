import { createClient } from 'jsr:@supabase/supabase-js@2';

// Webhook do PagSeguro/PagBank para conciliar PIX pago.
// verify_jwt=false: quem chama é o PagBank. Revalidamos consultando a order na API.
Deno.serve(async (req: Request) => {
  try {
    const TOKEN = Deno.env.get('PAGSEGURO_TOKEN');
    const ENV = (Deno.env.get('PAGSEGURO_ENV') || 'sandbox').toLowerCase();
    const BASE = ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const payload = await req.json().catch(() => ({}));
    const orderId = payload?.id || payload?.data?.id || null;
    let refId = payload?.reference_id || null;
    let paid = false;

    // Reconsulta a order para confirmar o pagamento (fonte da verdade)
    if (orderId && TOKEN) {
      const r = await fetch(`${BASE}/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/json' },
      });
      if (r.ok) {
        const ord = await r.json();
        refId = ord.reference_id || refId;
        const charges = ord.charges || [];
        paid = charges.some((c: any) => (c.status || '').toUpperCase() === 'PAID');
      }
    } else {
      // fallback: confia no payload se vier status PAID
      const charges = payload?.charges || [];
      paid = charges.some((c: any) => (c.status || '').toUpperCase() === 'PAID');
    }

    if (paid && refId) {
      await admin.rpc('erp_mark_sale_paid', { p_sale: refId, p_metodo: 'pix', p_ref: orderId });
    }

    return new Response(JSON.stringify({ ok: true, paid, sale: refId }),
      { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // sempre 200 para o PagBank não re-tentar em loop por erro nosso
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
