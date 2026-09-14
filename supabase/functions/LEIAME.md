# Edge functions — cópias de referência

Estes arquivos existem para que o código não viva só no painel do Supabase.
Não são a fonte da verdade do deploy: use `supabase functions deploy <slug>`.

## pagseguro-charge / pagseguro-webhook — REMOVIDAS em 13/09/2026

Ficam aqui só como histórico, para a remoção ser reversível se o PagSeguro
voltar ao roadmap. **Se voltarem, o webhook não pode voltar como está.**

Por que saíram — era código morto e o webhook era explorável:

- Nenhuma referência no frontend, nenhuma no README.
- `payments.pagseguro_order_id` existe, mas **0 de 86 pagamentos** usaram.
- `erp_mark_sale_paid` tinha esse webhook como único chamador.

O `pagseguro-webhook` era `verify_jwt=false` e tinha um caminho que **confiava no
corpo da requisição**: bastava o payload não trazer `id` para ele pular a
reconsulta na API e aceitar `charges[].status == 'PAID'` como verdade, chamando
`erp_mark_sale_paid` com a service role key.

Isso contrariava o que o README garante ("webhooks reconsultam o provedor, nunca
confiam no corpo"). O padrão correto está em `push-dispatch`, que também é
público mas exige o header `x-cron-secret` e devolve 401 sem ele.

A RPC `erp_mark_sale_paid` foi endurecida junto (migration
`20260913234147_harden_erp_mark_sale_paid`): antes ela passava direto para
qualquer chamador sem identidade; agora recusa por omissão.
