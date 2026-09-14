import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const TOKEN = Deno.env.get('PAGSEGURO_TOKEN');
    const ENV = (Deno.env.get('PAGSEGURO_ENV') || 'sandbox').toLowerCase();
    const BASE = ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: 'PAGSEGURO_TOKEN não configurado nos secrets do projeto.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { sale_id } = await req.json();
    if (!sale_id) throw new Error('sale_id obrigatório');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // carrega venda + cliente
    const { data: sale, error: se } = await admin.from('sales')
      .select('id, numero, total, customer_id, customers(nome, email, documento, telefone)')
      .eq('id', sale_id).single();
    if (se || !sale) throw new Error('Venda não encontrada');
    const cents = Math.round(Number(sale.total) * 100);
    if (cents <= 0) throw new Error('Total da venda inválido');

    const cust: any = sale.customers || {};
    const taxId = (cust.documento || '').replace(/\D/g, '');
    const fone = (cust.telefone || '').replace(/\D/g, '');
    const expire = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

    const body: any = {
      reference_id: String(sale.id),
      customer: {
        name: cust.nome || 'Consumidor',
        email: cust.email || 'sem-email@onpdv.local',
        tax_id: taxId.length === 11 || taxId.length === 14 ? taxId : '12345678909',
      },
      items: [{ name: `Venda #${sale.numero}`, quantity: 1, unit_amount: cents }],
      qr_codes: [{ amount: { value: cents }, expiration_date: expire }],
    };
    if (fone.length >= 10) {
      body.customer.phones = [{ country: '55', area: fone.slice(-11, -9) || fone.slice(0,2), number: fone.slice(-9), type: 'MOBILE' }];
    }

    const psRes = await fetch(`${BASE}/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
    });
    const ps = await psRes.json();
    if (!psRes.ok) {
      return new Response(JSON.stringify({ error: 'PagSeguro recusou', detail: ps }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const qr = (ps.qr_codes && ps.qr_codes[0]) || {};
    const qrText = qr.text || '';
    const pngLink = (qr.links || []).find((l: any) => (l.rel || '').toUpperCase().includes('PNG'));
    const qrImg = pngLink ? pngLink.href : '';

    await admin.from('payments')
      .update({ pagseguro_order_id: ps.id, pix_qr_text: qrText, pix_qr_image: qrImg,
                pix_expira_em: expire, updated_at: new Date().toISOString() })
      .eq('sale_id', sale_id).eq('metodo', 'pix');

    return new Response(JSON.stringify({ order_id: ps.id, qr_text: qrText, qr_image: qrImg, expira_em: expire }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
