# Eligibility, PayPal, and app identity design

## Goal

Make the creator intake match the approved operating rules, add PayPal as the international payout destination, and make the official GoWish app unmistakable on both public entry views without changing the site's established visual direction.

## Considered approaches

1. Validate country and follower count only in the browser. This would give immediate feedback, but direct requests could bypass the rules and create ineligible database records.
2. Build separate forms and data models for the United States and every international market. This would duplicate most of the flow and make future copy and validation changes prone to drift.
3. Keep one shared intake, adapt the payout choices to the selected country, and enforce the same eligibility rules in the browser and Convex. This is the approved approach because it keeps the experience simple while making the stored data trustworthy.

## Eligibility

- The creator must select one main platform.
- The follower count on that selected platform is required and must be a whole number from 0 through 149,999.
- The eligible country list contains the United States, Canada, the United Kingdom, and European countries, including transcontinental countries commonly grouped with Europe and Kosovo.
- The country and follower rules are enforced by Convex as well as by the form. A direct request cannot bypass them.
- Existing creator records are preserved. The schema is widened safely rather than rewritten or cleaned.

## Payout details

- United States creators can choose Venmo, Apple Cash, or PayPal.
- Creators in Canada and Europe use PayPal.
- Managers can choose Venmo, Apple Cash, or PayPal because their current form does not collect country.
- PayPal is collected as the email address connected to an account that can receive payments, together with the account holder's legal name.
- The same normalized payout fields continue to power the admin view and export. PayPal is added to the existing choices rather than creating a second payout system.
- Payouts remain a manual operational process. No PayPal payment API or automatic money movement is introduced.

## Official app identity

- The official GoWish app icon is obtained from the app's official App Store listing and stored with the site so it does not depend on an image hotlink.
- A compact, restrained app identity link appears in the creator instructions and the manager instructions.
- Clicking the icon or its adjacent label opens the official App Store listing.
- The existing App Store and Google Play download buttons remain available.
- The new element uses the existing light surfaces, typography, borders, and spacing; it does not introduce a dark or visually separate section.

## Form behavior

- Country, main platform, and follower count are visibly marked as required.
- Changing to a non-US country selects PayPal and removes the two US-only payout choices from the active selection.
- Changing back to the United States restores all three payout choices.
- Selecting PayPal changes the destination field to an email input with clear wording.
- Browser validation provides immediate feedback, while Convex remains the final authority.

## Verification and release

- Automated tests cover allowed and rejected countries, the 149,999 boundary, PayPal email validation, country-specific payout rules, both public forms, the admin workflow, and both app identity links.
- The complete repository verification command must pass.
- Convex is deployed before the frontend so the public form never sends the new values to an older backend.
- The exact frontend revision must be reported ready by Vercel.
- Desktop and mobile checks confirm both entry views, conditional payout behavior, required fields, official App Store navigation, and unchanged overall visual character.
