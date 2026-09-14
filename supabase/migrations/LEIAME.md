# Migrations

O historico completo (213 migrations, desde `erp_01_schema_and_rls`) esta no banco,
na tabela `supabase_migrations.schema_migrations`. **O banco nao esta com drift** —
quem estava sem historico era este repositorio, que nao tinha a pasta `supabase/`.

Esta pasta comeca com apenas a migration mais recente. Para trazer as demais:

```bash
supabase db pull --linked
```

O comando pede a **senha do banco** (Supabase → Settings → Database). Ela nao esta
guardada em lugar nenhum do repositorio, de proposito.

> Nao rode `supabase migration repair --status reverted` para resolver a diferenca
> entre local e remoto. O CLI sugere isso quando a pasta local esta vazia, mas o
> efeito e marcar as migrations como revertidas no historico REMOTO — que e
> justamente a unica copia integra que existe hoje.

## Ao criar uma migration nova

Aplique pelo CLI (`supabase migration new` + `supabase db push`) ou pelo painel, e
deixe o arquivo `.sql` versionado aqui com o mesmo timestamp usado no remoto, para
os dois lados continuarem batendo.
