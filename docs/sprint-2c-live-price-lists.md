# Sprint 2C addition — live decorated price lists

Accepted 7 September 2026. Sprint 2C is CURRENT; this contained read-only addition preserves all existing prospect, Interaction, follow-up and commercial snapshot scope.

## Outcome

Sales can send customers who do not use Sellar a live, decorated price-list link. A separate generic version supports prospects and general sharing. Neither requires a Brewery Ops login.

- `/price-list`: generic standard trade prices, with no Account context. Uses the same canonical pricing function with a null Account; its existing standard base is `WHOLESALE_1`.
- `/price-list/<token>`: the specified Account's current effective prices and canonical packaging restrictions. Resolve the exact active token server-side; never accept an Account ID from a public request.
- Both reuse the decorated renderer, canonical availability observations and effective-price policy. Product artwork, tasting notes, ABV, package labels, GBP prices and format filters are shared with the internal decorated price list.
- Freshness shows the oldest observation among the displayed available variants, not the newest. Failed refreshes produce a customer-safe warning without internal error details. These pages re-read on open/refresh; they do not promise streaming stock or reserve inventory.
- Sales contact appears on the list. The email button defaults to sales@redwillowbrewery.com, the published trade contact; `NEXT_PUBLIC_SALES_EMAIL` can override it.

## Sharing and permissions

- Staff can create, copy, replace and revoke a customer link from Account or Quick Email.
- One active link per Account; repeated Create returns the existing active link. Replace creates a fresh cryptographically random bearer token and invalidates the old link. Revoke disables it.
- Anyone holding a customer link can see its price list. Staff are told this when sharing. Tokens are kept in a private RLS-protected table readable by authorised staff, never by anonymous database clients.
- The current CRM permits authenticated staff to access all Accounts; the management RPC follows that model. Revisit it together with Account authorisation if a scoped staff-access model is introduced later.
- Public rendering uses a server-only reader and exposes only Account display name plus selling data. No contacts, addresses, CRM activity, credit balances, hold flags, account notes or internal sync diagnostics are rendered.
- Inactive/closed Accounts, unknown tokens and revoked tokens do not return a customer price list. Missing links never fall back to generic or another Account's prices.
- Responses are dynamic and private/no-store, with no-referrer, noindex and anti-framing headers. External images also use no-referrer so the bearer URL is not sent to image hosts. Revocation blocks future reads; it cannot retract a list already copied, printed or received.
- Quick Email allows customer link, generic link or existing Sellar link. It does not automatically create a customer link merely by opening the screen. Generic links are explicitly labelled as standard prices if the draft itself contains account-specific prices. Preparation remains distinct from actual sending.

## Acceptance and rollout

Verify standard/customer price separation; exact package restrictions; no-login access; absent/revoked/rotated token rejection; no anonymous access to link records; authenticated management; phone layout; freshness; and no CRM data in public output.

Migration: `20260907120000_live_price_list_links.sql`. App requires the existing server-side `SUPABASE_SERVICE_ROLE_KEY`; it is never exposed to the browser. Apply migration and deploy the app before distributing links. The generic URL must use the production app origin, and staff Copy actions use the current app origin.

No Order Capture, checkout, payment processing, customer login or ViewPlan write is introduced. Product/Production/Inventory ownership still precedes Brewery Ops-owned Order Capture and Logistics.

Implementation: migration applied 7 September 2026. Application deployment and Sales field pass remain pending. Automated checks cover token resolution, isolation, rotation/revocation, database permissions, generic pricing and package labels. No new ViewPlan connector script is required for this slice.
