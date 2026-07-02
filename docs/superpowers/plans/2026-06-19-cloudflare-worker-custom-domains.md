# Cloudflare Worker Custom Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular os três Workers da conta a hostnames exclusivos sob `claudemux.dpdns.org`, preservar `workers.dev` como fallback e versionar o domínio do `jurisprudenciaia-mcp`.

**Architecture:** Cada Worker será origem de um Custom Domain independente. O vínculo dos três hostnames será criado pela API oficial do Cloudflare de forma idempotente; `wrangler.toml` será a fonte de verdade versionada para o Worker deste repositório. DNS, TLS, associação e comportamento HTTP serão verificados após cada mudança.

**Tech Stack:** Cloudflare Workers, Cloudflare Workers Domains API, Wrangler 4.102.0, TOML, TypeScript, Vitest, PowerShell DNS tools.

---

## File map

- Create: `tests/wrangler-custom-domain.test.ts` — impede regressão do Custom Domain versionado.
- Modify: `wrangler.toml:1-9` — declara o Custom Domain de `jurisprudenciaia-mcp`.
- Modify: `README.md:71-72` — usa o hostname proprietário nos checks rápidos.
- Modify: `docs/codex.md:61-99` — usa o hostname proprietário na configuração do Codex.
- Preserve: `docs/deployment.md` e `docs/deploy-guide.html` — continuam como guias genéricos para instalações de terceiros.

### Task 1: Versionar o Custom Domain do `jurisprudenciaia-mcp`

**Files:**
- Create: `tests/wrangler-custom-domain.test.ts`
- Modify: `wrangler.toml:1-9`

- [ ] **Step 1: Criar o teste que falha**

Criar `tests/wrangler-custom-domain.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wranglerConfig = readFileSync(
  new URL("../wrangler.toml", import.meta.url),
  "utf8"
);

describe("wrangler custom domain", () => {
  it("binds jurisprudenciaia-mcp to its approved custom domain", () => {
    expect(wranglerConfig).toMatch(
      /\[\[routes\]\]\s+pattern = "jurisprudenciaia-mcp\.claudemux\.dpdns\.org"\s+custom_domain = true/
    );
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `npx vitest run tests/wrangler-custom-domain.test.ts`

Expected: FAIL porque `wrangler.toml` ainda não contém `[[routes]]`.

- [ ] **Step 3: Adicionar a configuração mínima**

Inserir após `compatibility_date` em `wrangler.toml`:

```toml
[[routes]]
pattern = "jurisprudenciaia-mcp.claudemux.dpdns.org"
custom_domain = true
```

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npx vitest run tests/wrangler-custom-domain.test.ts`

Expected: PASS, 1 test passed.

- [ ] **Step 5: Validar o bundle sem publicar**

Run: `npx wrangler deploy --dry-run`

Expected: exit code 0 e bundle gerado sem erro de configuração de `routes`.

- [ ] **Step 6: Commitar a configuração versionada**

```bash
git add wrangler.toml tests/wrangler-custom-domain.test.ts
git commit -m "feat: configure Worker custom domain"
```

### Task 2: Atualizar as instruções específicas deste deployment

**Files:**
- Modify: `README.md:71-72`
- Modify: `docs/codex.md:61-99`

- [ ] **Step 1: Substituir somente os exemplos específicos do Worker**

Em `README.md` e `docs/codex.md`, substituir as URLs de exemplo cujo hostname
começa com `jurisprudenciaia-mcp` e termina em `workers.dev` por:

```text
https://jurisprudenciaia-mcp.claudemux.dpdns.org
```

Não alterar `docs/deployment.md`, `docs/deploy-guide.html` nem os textos que explicam genericamente `workers.dev`.

- [ ] **Step 2: Verificar referências específicas restantes**

Run:

```powershell
rg -n "jurisprudenciaia-mcp\.[^/[:space:]]+\.workers\.dev" README.md docs\codex.md
```

Expected: nenhum resultado.

- [ ] **Step 3: Verificar que o domínio novo aparece nos dois arquivos**

Run:

```powershell
rg -n "jurisprudenciaia-mcp\.claudemux\.dpdns\.org" README.md docs\codex.md
```

Expected: referências de URL base, `/mcp` e comandos de check apontando ao domínio novo.

- [ ] **Step 4: Commitar a documentação**

```bash
git add README.md docs/codex.md
git commit -m "docs: use jurisprudenciaia custom domain"
```

### Task 3: Executar preflight idempotente na conta Cloudflare

**Files:** nenhum.

- [ ] **Step 1: Confirmar Workers e ausência de conflitos**

Executar pela Cloudflare API:

```javascript
async () => {
  const desired = [
    { service: "amf-proxy", hostname: "amf-proxy.claudemux.dpdns.org" },
    { service: "amf-ingestao-mcp", hostname: "amf-ingestao-mcp.claudemux.dpdns.org" },
    {
      service: "jurisprudenciaia-mcp",
      hostname: "jurisprudenciaia-mcp.claudemux.dpdns.org",
    },
  ];
  const [workers, domains] = await Promise.all([
    cloudflare.request({
      method: "GET",
      path: `/accounts/${accountId}/workers/scripts`,
    }),
    cloudflare.request({
      method: "GET",
      path: `/accounts/${accountId}/workers/domains`,
      query: { zone_name: "claudemux.dpdns.org" },
    }),
  ]);
  const names = new Set(workers.result.map((worker) => worker.id));
  const conflicts = domains.result.filter((domain) =>
    desired.some(
      (item) => item.hostname === domain.hostname && item.service !== domain.service
    )
  );
  return {
    missingWorkers: desired.filter((item) => !names.has(item.service)),
    conflicts,
    currentDomains: domains.result,
  };
}
```

Expected: `missingWorkers: []` e `conflicts: []`. Se houver conflito, parar sem alterar estado.

### Task 4: Anexar os três Custom Domains incrementalmente

**Files:** nenhum.

- [ ] **Step 1: Anexar `amf-proxy.claudemux.dpdns.org`**

```javascript
async () =>
  cloudflare.request({
    method: "PUT",
    path: `/accounts/${accountId}/workers/domains`,
    body: {
      hostname: "amf-proxy.claudemux.dpdns.org",
      service: "amf-proxy",
    },
  })
```

Expected: HTTP 200, `success: true`, hostname e service correspondentes.

- [ ] **Step 2: Confirmar o vínculo de `amf-proxy` antes de continuar**

Executar `GET /accounts/${accountId}/workers/domains` com
`hostname=amf-proxy.claudemux.dpdns.org`.

Expected: exatamente um domínio com `service: "amf-proxy"`.

- [ ] **Step 3: Anexar `amf-ingestao-mcp.claudemux.dpdns.org`**

```javascript
async () =>
  cloudflare.request({
    method: "PUT",
    path: `/accounts/${accountId}/workers/domains`,
    body: {
      hostname: "amf-ingestao-mcp.claudemux.dpdns.org",
      service: "amf-ingestao-mcp",
    },
  })
```

Expected: HTTP 200, `success: true`, hostname e service correspondentes.

- [ ] **Step 4: Confirmar o vínculo de `amf-ingestao-mcp` antes de continuar**

Executar `GET /accounts/${accountId}/workers/domains` com
`hostname=amf-ingestao-mcp.claudemux.dpdns.org`.

Expected: exatamente um domínio com `service: "amf-ingestao-mcp"`.

- [ ] **Step 5: Anexar `jurisprudenciaia-mcp.claudemux.dpdns.org`**

```javascript
async () =>
  cloudflare.request({
    method: "PUT",
    path: `/accounts/${accountId}/workers/domains`,
    body: {
      hostname: "jurisprudenciaia-mcp.claudemux.dpdns.org",
      service: "jurisprudenciaia-mcp",
    },
  })
```

Expected: HTTP 200, `success: true`, hostname e service correspondentes.

- [ ] **Step 6: Confirmar o vínculo de `jurisprudenciaia-mcp`**

Executar `GET /accounts/${accountId}/workers/domains` com
`hostname=jurisprudenciaia-mcp.claudemux.dpdns.org`.

Expected: exatamente um domínio com `service: "jurisprudenciaia-mcp"`.

### Task 5: Verificar DNS, TLS e comportamento HTTP

**Files:** nenhum.

- [ ] **Step 1: Confirmar resolução pública**

Run:

```powershell
Resolve-DnsName amf-proxy.claudemux.dpdns.org
Resolve-DnsName amf-ingestao-mcp.claudemux.dpdns.org
Resolve-DnsName jurisprudenciaia-mcp.claudemux.dpdns.org
```

Expected: os três nomes resolvem sem `NXDOMAIN`. A emissão inicial pode levar alguns minutos.

- [ ] **Step 2: Confirmar HTTPS e paridade com os endpoints atuais**

Usar `ctx_fetch_and_index` com cache desabilitado para:

```text
https://amf-proxy.claudemux.dpdns.org/
https://amf-ingestao-mcp.claudemux.dpdns.org/
https://jurisprudenciaia-mcp.claudemux.dpdns.org/
```

Expected:

- `amf-proxy`: HTTP 401, igual ao endpoint `workers.dev`, confirmando que a proteção continua ativa;
- `amf-ingestao-mcp`: HTTP 200 e texto `JurisprudenciaIA MCP`;
- `jurisprudenciaia-mcp`: HTTP 200 e texto `JurisprudenciaIA MCP`.

- [ ] **Step 3: Executar checks MCP/OAuth do Worker deste repositório**

Run:

```powershell
npm run check:chatgpt-oauth -- https://jurisprudenciaia-mcp.claudemux.dpdns.org/mcp
```

Expected: checks públicos de descoberta OAuth passam. Se o check Codex exigir
`MCP_BEARER_TOKEN`, executá-lo somente quando a variável já existir no ambiente,
sem imprimir o valor:

```powershell
npm run check:codex-http -- https://jurisprudenciaia-mcp.claudemux.dpdns.org/mcp
```

- [ ] **Step 4: Executar a suíte local completa**

Run:

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

Expected: todos os comandos terminam com exit code 0.

### Task 6: Auditoria final e rollback seletivo

**Files:** nenhum.

- [ ] **Step 1: Auditar o estado final pela API**

Executar `GET /accounts/${accountId}/workers/domains` com
`zone_name=claudemux.dpdns.org`.

Expected: exatamente os três pares hostname/service aprovados, sem duplicatas.

- [ ] **Step 2: Confirmar que `workers.dev` permaneceu disponível**

Usar `ctx_fetch_and_index` nos três endpoints `*.bflrepo.workers.dev` originais.

Expected: mesmos status e conteúdo observados antes da mudança.

- [ ] **Step 3: Aplicar rollback somente se alguma verificação falhar**

Se `amf-proxy.claudemux.dpdns.org` falhar, executar:

```javascript
async () => {
  const hostname = "amf-proxy.claudemux.dpdns.org";
  const domains = await cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/domains`,
    query: { hostname },
  });
  const domain = domains.result.find(
    (item) => item.hostname === hostname && item.service === "amf-proxy"
  );
  if (!domain) return { removed: false, hostname };
  return cloudflare.request({
    method: "DELETE",
    path: `/accounts/${accountId}/workers/domains/${domain.id}`,
  });
}
```

Se `amf-ingestao-mcp.claudemux.dpdns.org` falhar, executar:

```javascript
async () => {
  const hostname = "amf-ingestao-mcp.claudemux.dpdns.org";
  const domains = await cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/domains`,
    query: { hostname },
  });
  const domain = domains.result.find(
    (item) => item.hostname === hostname && item.service === "amf-ingestao-mcp"
  );
  if (!domain) return { removed: false, hostname };
  return cloudflare.request({
    method: "DELETE",
    path: `/accounts/${accountId}/workers/domains/${domain.id}`,
  });
}
```

Se `jurisprudenciaia-mcp.claudemux.dpdns.org` falhar, executar:

```javascript
async () => {
  const hostname = "jurisprudenciaia-mcp.claudemux.dpdns.org";
  const domains = await cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/domains`,
    query: { hostname },
  });
  const domain = domains.result.find(
    (item) =>
      item.hostname === hostname && item.service === "jurisprudenciaia-mcp"
  );
  if (!domain) return { removed: false, hostname };
  return cloudflare.request({
    method: "DELETE",
    path: `/accounts/${accountId}/workers/domains/${domain.id}`,
  });
}
```

Não remover domínios que já tenham passado em todas as verificações.

- [ ] **Step 4: Registrar o resultado final**

Reportar os três pares hostname/Worker, status DNS/TLS/HTTP, resultados dos
checks e commits criados. Não reportar IDs de certificados, tokens ou segredos.
