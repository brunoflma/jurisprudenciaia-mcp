import { DurableObject } from "cloudflare:workers";
import { createLedgerDurableObjectClass } from "./runtime.mjs";
import { readAuthorityPolicy, readAuthorityReceiptKey } from "./worker-config.mjs";

class AuthorityObjectBase extends DurableObject {}
const LedgerObject = createLedgerDurableObjectClass(AuthorityObjectBase, {
  readPolicy: readAuthorityPolicy, readReceiptKey: readAuthorityReceiptKey, clock: Date.now,
});

/** Exported for explicit future bindings; no binding or migration is installed by this module. */
export class McpOAuthV2Ledger extends LedgerObject {}
