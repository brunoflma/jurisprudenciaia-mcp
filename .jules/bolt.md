## 2026-06-18 - Render Deployment Blueprint

**Context:** The user needed a reliable way to deploy the application to Render without deployment timeouts.

**Action:** Created `render.yaml` (Render Blueprint) to declare the web service `jurisprudenciaia-mcp` via Infrastructure as Code (IaC).
- Configured Node.js runtime (`runtime: node`) and free plan.
- Added `buildCommand: npm ci && npm run build` and `startCommand: npm start`.
- Defined `HOST=0.0.0.0` environment variable to ensure the Express server binds correctly on the Render container.
- Explicitly set `healthCheckPath: /healthz` so Render can successfully ping the app (since it doesn't handle `/`).

**Result:** Render knows how to deploy, build, and health check the application correctly.

## 2026-06-19 - Regex Compilation and Loop Fusion in String Normalizer
**Learning:** Chaining array methods (`.map().filter().filter()`) and running `.some()` against an array of 26 regular expressions per-line creates a significant performance bottleneck (O(N*M) with multiple intermediate array allocations).
**Action:** Replaced the regex array with a single consolidated RegExp (`NOISE_PATTERN`) utilizing the OR `|` operator for an O(N) evaluation. Fused the array iterations into a single `for` loop with early `continue`s, maintaining a `lastProcessedLine` state to properly duplicate the behavior of adjacent line filtering. Always profile and combine regular expressions where multiple patterns check the same input string.
## 2024-05-18 - Double-Normalization Anti-Pattern

**Learning:** When generating a fingerprint or comparable string for massive text payloads (like `texto_inteiro_teor` for court decisions, which can be 100s of KB), ensure you don't accidentally run standard normalization steps (like replacing multiple newlines/spaces) multiple times. In `http-api-runner.ts`, candidates were being normalized, and then the normalized string was passed to a comparison function which normalized it *again*, causing an unnecessary and expensive double-pass of regex operations on huge strings.

**Action:** Split text preparation logic into distinct phases (e.g., `normalizeLongText` vs `fingerprintLongText`). Once a string has been normalized, pass it only to the fingerprinting function rather than a wrapper that re-applies normalization.
## 2024-05-14 - Regex Recompilation Optimization in Normalizer
**Learning:** In the `jurisprudenciaia` normalizer (`src/jurisprudenciaia/result-normalizer.ts`), regular expressions were defined inline inside a loop that iterated over every line of the parsed accessibility tree text. Moving the regex definitions to the module scope and adding a fast-path character check (`line.charCodeAt(0) !== 45`) for lines that don't match the required prefix drastically reduced execution time.
**Action:** When working on text parsing loops that iterate over many lines or tokens, extract regex definitions out of the loop and implement simple `charCodeAt` or `startsWith` checks before falling back to heavier regex execution.
## 2024-05-19 - Safe text processing optimizations
**Learning:** Arbitrarily slicing a string (`.slice(0, 1000)`) before applying formatting regexes to save processing time is an unsafe optimization that can break markdown syntax if the slice lands in the middle of a link or tag. It violates the exact functionality preservation rule.
**Action:** Use fast-path short-circuiting based on heuristics (like checking `line.length > threshold`) to bypass expensive normalizations entirely for large data blocks when the match is mathematically impossible, rather than modifying the data itself.
## 2026-06-20 - Loop Fusion in SSE Event Parsing
**Learning:** Chaining array methods like `.filter().map()` in high-frequency text processing paths (such as parsing SSE event streams) creates unnecessary intermediate array allocations and increases garbage collection overhead.
**Action:** Always fuse operations into a single `for` loop in performance-critical or frequently executed code paths to minimize memory allocations. Additionally, include comments explaining the optimization so that reviewers understand the intent and do not reject it as an unmeasured readability regression.
