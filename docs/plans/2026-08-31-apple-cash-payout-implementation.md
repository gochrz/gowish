# Apple Cash payout implementation plan

## 1. Lock the contract with failing tests

- Extend creator and manager tests with `payoutMethod`, `payoutDestination`, and `payoutLegalName`.
- Add Apple Cash email and phone cases plus invalid-contact cases.
- Extend admin tests for payout edits and paid-record protection.
- Extend HTTP tests for the normalized request contract.
- Extend static-page tests for both payout choices, conditional fields, neutral copy, and admin columns.
- Run the focused tests and confirm they fail because the new contract is absent.

## 2. Implement the Convex contract

- Replace Venmo-specific schema fields with normalized payout fields.
- Centralize payout validation and normalization.
- Update creator and manager mutations, admin queries and corrections, and HTTP parsing.
- Preserve current duplicate, approval, payout, attribution, audit, CORS, and rate-limit behavior.
- Run focused backend tests until green, then run all backend tests and type checking.

## 3. Implement the static pages

- Add payout-method controls and conditional destination fields to both public forms.
- Update form validation, payload construction, success copy, and accessible labels.
- Update admin tables, correction dialog, and exports to use neutral payout fields.
- Run static-page tests until green.

## 4. Verify locally

- Run all tests, both TypeScript checks, formatting checks, secret scans, and dependency audit.
- Serve the static pages locally and exercise creator, manager, and admin layouts in a browser.

## 5. Release and verify

- Deploy the Convex backend to `tough-spaniel-606`.
- Exercise tagged manager and creator HTTP flows for both payout methods, verify admin read-back, then clean up exactly those records.
- Commit and push to `main`.
- Confirm Vercel deploys that exact commit to the existing `gowish-creator-program` project and all public aliases return `200`.
- Exercise both public payout choices and the admin gate in the live browser with no console errors.
