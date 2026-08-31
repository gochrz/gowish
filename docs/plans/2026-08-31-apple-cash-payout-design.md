# Apple Cash payout design

## Goal

Let creators and managers choose either Venmo or Apple Cash as their preferred payout method without changing the overall visual design or automating payments.

## Considered approaches

1. Collect both Venmo and Apple Cash details from everyone. This provides maximum flexibility but requests unnecessary information and makes the form longer.
2. Show both sections and make only one required. This is easier to implement but leaves the user to infer which fields apply.
3. Ask for a preferred payout method and show only the matching fields. This is the approved approach because it is clear, minimal, and collects only the information needed for a payout.

## Public forms

- Both creator and manager forms include a required preferred payout method with `Venmo` and `Apple Cash` choices.
- Choosing Venmo shows a required Venmo handle and required account-holder name.
- Choosing Apple Cash shows a required phone number or email associated with Apple Cash and required account-holder name.
- Switching methods clears the hidden destination field so stale payout details are not submitted.
- Existing program wording refers to the selected payout method or uses neutral wording such as `preferred payout method`.
- Confirmation screens do not promise automated payment or email.

## Data and API

- Convex stores a normalized `payoutMethod`, `payoutDestination`, and `payoutLegalName` for creators and managers.
- `payoutMethod` accepts only `venmo` or `apple_cash`.
- Venmo destinations are normalized as handles and must use the existing handle rules.
- Apple Cash destinations must be a plausible email address or phone number and are stored in a consistent form.
- Duplicate manager registration returns the existing code without replacing saved payout details.
- Marking a payout remains a bookkeeping action and never sends money.

## Admin workflow

- Creator and manager tables show the payout method, destination, and account-holder name.
- The correction dialog edits those same three values.
- Payout details cannot be changed after the corresponding payout is marked paid.
- Exports use neutral payout column names and include the selected method.

## Compatibility

- The current live database contains no creator or manager submissions, so the release can move directly to the normalized payout fields.
- Tests still cover Venmo behavior while adding equivalent Apple Cash cases.
- The public URL, admin URL, referral behavior, approval workflow, and payout amounts remain unchanged.

## Verification

- Tests are written first and observed failing before implementation.
- Backend tests cover both payout methods, invalid Apple Cash contacts, and protected paid-record corrections.
- Static-page tests cover both selectors, conditional fields, neutral wording, and admin columns.
- Type checking and all existing tests must pass.
- Development HTTP actions are tested with tagged records and cleaned up.
- Production is accepted only after the exact Git commit is `Ready` in Vercel and both public forms and the admin gate work without browser errors.
