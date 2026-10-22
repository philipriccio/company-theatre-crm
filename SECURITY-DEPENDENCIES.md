# October 22, 2026 security dependency overrides

Prisma remains on supported-in-this-app 6.x; its generated client/schema are unchanged. The narrow `@prisma/config` overrides update effect to 3.22.3 (same major) and deepmerge-ts to 8.0.2 (major API compatibility checked for Prisma's `deepmerge` import). Prisma CLI schema validation, client generation, application build, independent typecheck and existing offline tests pass. Revisit/remove these overrides when a future Prisma update supplies patched transitives natively. No schema migrations or production data operations were performed by this source change.

Prisma CLI/config are build/admin tooling, not imported by request handlers. Hawco currently includes CLI in its runtime image for startup migrate-deploy; do not claim it is absent. Effect's reviewed RPC context vulnerability is not an app RPC path. These reachability facts do not replace patching.
