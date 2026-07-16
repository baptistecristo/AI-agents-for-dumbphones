# Sign-in setup

The site offers five ways in, from one page (`/connexion`):

- **Google, Apple, Microsoft, GitHub** — OAuth.
- **Email magic link** — click a link.
- **Email 6-digit code** — type a code. The link and the code arrive in the **same** email; the person picks whichever they like.

Most of this is Supabase dashboard configuration. The code side is already wired:
`signInWithOtp` / `signInWithOAuth` on the client, and a shared callback at
`/auth/callback` (with `/auth/confirm` kept as an alias) that turns the returned
`?code=` or `?token_hash=` into a session.

## Why the code, and not just a link

Corporate and webmail scanners — Outlook/Microsoft **SafeLinks** is the common
one — *pre-open* every link in an incoming email to check it. A magic link is
single-use, so the scanner consumes the token before the human clicks, and the
real click then fails with `otp_expired` ("Email link is invalid or has
expired"). The 6-digit code sidesteps this entirely: there is no link to
pre-open, and it needs no redirect-URL allowlisting to work. Treat the code as
the reliable path and the link as a convenience.

## 1. URL configuration (required)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your canonical production URL, e.g. `https://your-app.vercel.app`.
- **Redirect URLs**: add every origin the app is served from, with a wildcard, so
  Supabase honours the `emailRedirectTo` / `redirectTo` the code sends instead of
  silently falling back to the Site URL:
  - `https://your-app.vercel.app/**`
  - any other Vercel alias you use (the `-<team>` one included)
  - `http://localhost:3000/**` for local dev

If a redirect target is not on this list, Supabase drops it and uses the Site
URL — which is exactly how a magic link ends up back on `/` instead of
`/auth/callback`, and no session is ever created.

## 2. Email template (enables the 6-digit code)

Supabase → **Authentication → Email Templates → Magic Link**. Include **both** the
link and the token so one email serves both methods:

```html
<h2>Your sign-in</h2>
<p>Enter this code: <strong>{{ .Token }}</strong></p>
<p>…or just click <a href="{{ .ConfirmationURL }}">this link</a>.</p>
```

`{{ .Token }}` is the 6-digit code (`verifyOtp({ type: "email" })` on the client
checks it). `{{ .ConfirmationURL }}` is the PKCE magic link that lands on
`/auth/callback`.

The code input on the sign-in page is off by default and shown only when
`NEXT_PUBLIC_EMAIL_CODE=true`. Turn it on **after** you have custom SMTP and the
`{{ .Token }}` template above — otherwise the email carries only a link and the
code field would ask for a code that never arrives. With the default Supabase
email service (no custom SMTP), templates can't be edited, so leave the code off
and rely on the magic link.

## 3. OAuth providers

Enable each under **Authentication → Providers**. Every provider redirects back to
the **same** Supabase callback — set that as the authorized redirect URI on the
provider's side:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

| Provider | Where you register the app | Notes |
|---|---|---|
| Google | Google Cloud Console → OAuth client (Web) | You already have a Google OAuth app for Calendar/Contacts; this is a **separate** client for Supabase Auth, or reuse it by adding the callback above. |
| Microsoft (`azure`) | Azure Portal → App registrations | Covers Outlook/Microsoft accounts. Set the redirect URI to the Supabase callback; Supabase asks for client ID, secret, and (optionally) tenant. |
| Apple | Apple Developer → Services ID + key | Requires a **paid** Apple Developer account. The heaviest to set up; skip until you want it (see the env var below). |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps | Set "Authorization callback URL" to the Supabase callback. Cheapest to add; handy for the developer early-adopters. |

## 4. Which buttons show — two env vars

Buttons are driven by two comma-separated lists so you never render a live button
for a provider you have not enabled (clicking one would error), while still being
able to advertise what is coming:

- **`NEXT_PUBLIC_AUTH_PROVIDERS`** — providers actually enabled in Supabase. Their
  button starts the OAuth flow. **Default: none.**
- **`NEXT_PUBLIC_AUTH_PROVIDERS_SOON`** — providers shown greyed out with a
  "bientôt" badge; the button routes to `/connexion/bientot` instead of signing
  in. **Default: all four.**

A provider listed as live wins over soon. Move a provider from the soon list to
the live list the day you wire it (OAuth app created, secret pasted into
Supabase).

```bash
# Google is live; the rest are still "coming soon"
NEXT_PUBLIC_AUTH_PROVIDERS=google
NEXT_PUBLIC_AUTH_PROVIDERS_SOON=apple,microsoft,github
```

Accepted tokens: `google`, `apple`, `microsoft` (alias `outlook`, `azure`),
`github`. The email link and 6-digit code are always available regardless of
these settings.
