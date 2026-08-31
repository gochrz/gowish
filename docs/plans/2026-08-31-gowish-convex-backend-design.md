# GoWish Convex backend design

## Scope

Keep the existing public page and add a Convex backend for creator intake, manager registration, referral attribution, approval tracking, and manual payout tracking. Add a protected operations page for Ben. Automated email and automated Venmo payments are excluded from the first release.

## Runtime layout

- `index.html` remains the public Vercel page.
- `admin.html` is served from the same Vercel project and protected by a long shared key held only in memory by the browser.
- Convex exposes `/api`, `/admin`, and `/health` HTTP routes.
- All database functions are internal and can only be reached through the HTTP routes.
- Development uses `tough-spaniel-606`; no production deployment or Vercel publication occurs in this phase.

## Data model

- Managers have one normalized email and one unique referral code.
- Creators have one normalized GoWish email, a unique human reference, an optional manager relationship, explicit consent evidence, and the bonus amounts promised at submission.
- Creator status is `submitted`, `approved`, or `rejected`.
- Attribution submission is tracked separately from approval status.
- Administrative changes create immutable audit events.

## Business rules

- A GoWish email can be submitted only once.
- A manager email always receives its existing code on repeat registration.
- A referral code must belong to an enabled manager.
- The initial program accepts United States creators only.
- Creator and manager payouts can be marked only after creator approval.
- Manager payout requires an attributed manager.
- Amounts are stored per creator so later configuration changes do not rewrite historical obligations.
- Marking a payout records state only; it never sends money.
- Attribution exports include eligible records not previously marked sent.

## Security and abuse controls

- The admin route requires a long random key.
- Browser origins are allow-listed and checked by the HTTP actions.
- Public actions have bounded input sizes, strict field validation, a honeypot, and rate limiting.
- Sensitive records are never returned by public routes.
- The admin key is never embedded in either static page.

## User experience

- Creator success returns a unique reference on screen.
- Manager success returns a code and shareable link on screen.
- No page promises confirmation emails.
- Support-email copy remains hidden until an address is configured.
- The admin page confirms approval and payout actions, prevents invalid actions, supports correction of payout identity fields, and makes attribution history visible.

## Verification

- Unit and database tests cover duplicate prevention, referral attribution, consent, valid status transitions, payout guards, amount snapshots, and attribution tracking.
- TypeScript must pass without errors.
- Convex must push successfully to `tough-spaniel-606`.
- Real HTTP tests must exercise creator, manager, duplicate, invalid-code, admin, payout, attribution, and cleanup behavior.
- Both static pages must be opened and exercised against Development before they are considered ready for Vercel.
