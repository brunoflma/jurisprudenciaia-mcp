# Checklist de publicação pública

Use este checklist antes de abrir o código para um repositório público.

## Modelo recomendado

- Publique o código como projeto auto-hospedado.
- Mantenha sua instância real do Cloudflare Worker privada.
- Crie um repositório público novo com primeiro commit sanitizado se houver qualquer dúvida sobre o histórico Git atual.
- Mantenha `package.json` com `private: true` para evitar publicação acidental no npm.

## Não publicar

- `.env`, `.dev.vars`, logs, screenshots temporários ou dumps de testes.
- URLs operacionais da sua instância real do Worker.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` ou secrets OAuth reais.
- Consultas jurídicas reais, respostas do JurisprudenciaIA, nomes de partes, CPFs, e-mails ou outros dados pessoais.

## Antes de abrir o repositório

Execute:

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
npm audit --omit=dev
rg -n "secret|token|password|senha|cpf|email|client_secret|access_token" .
```

Faça também uma busca pelos marcadores de caminho local do seu próprio ambiente, como letras de unidade, diretórios de usuário e pastas sincronizadas.

Se o repositório atual for convertido para público, escaneie também o histórico:

```powershell
gitleaks detect --source . --no-git=false
```

Revise todos os achados manualmente. Se a ferramenta apontar histórico antigo ou se a revisão ficar incerta, publique um repositório novo sem importar o histórico privado.

## GitHub Actions

- O workflow `CI` pode rodar em forks e pull requests sem secrets.
- O repositório público não deve conter workflow de deploy nem exigir secrets para pull requests.
- Nunca cole valores reais de secrets em logs, issues, comentários de PR ou arquivos de exemplo.
