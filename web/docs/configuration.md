# Configuration

All environment variables are declared, typed and validated in one place:
[`web/src/lib/config.ts`](../src/lib/config.ts). `web/.env.example` is the
annotated list of every variable; copy it to `.env.local` for development.

## Precedence

Next.js loads env files in a fixed order — the first source that sets a variable
wins:

```
process.env  >  .env.$(NODE_ENV).local  >  .env.local  >  .env.$(NODE_ENV)  >  .env
```

`.env.local` is not loaded while running tests. On Vercel there are no `.env`
files: only the project's environment variables apply.

## Validation and the boot guard

`config.ts` parses the environment with a Zod schema that checks the **format**
of whatever is present (URLs are URLs, `RUNTIME` is `selfhost` or `vapi`, the
rate-limit caps are positive integers, …). Empty values (`KEY=` lines) are
treated as absent, so they never fail validation.

At server start, [`web/src/instrumentation.ts`](../src/instrumentation.ts) calls
`assertBootConfig()`. It refuses to start — with a message naming the offending
variable — when a **required core** variable is missing, malformed, or still
holds its `.env.example` placeholder:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`

The guard runs only on the Node.js runtime, never on Edge or during
`next build`, so it never blocks a build.

## Secrets

`config.ts` keeps a single registry of the variables that are secrets
(`SENSITIVE_KEYS`). Use `redactKey(key, value)` / `redactConfig(source)`
whenever configuration is printed, logged, or serialized toward the model or a
future dashboard — a secret always comes back as `***`. The Supabase **anon**
key and the Google **client id** are public by design and are not in the
registry.

To add a variable: declare it in the schema, add it to `.env.example`, and — if
it is a secret — add its name to `SENSITIVE_KEYS`.
