# Manager link preview design

## Goal

Give managers a shareable URL whose WhatsApp preview describes their $10 referral offer instead of the creator's $20 bonus, while keeping the creator preview unchanged.

## Why the current link cannot work

The current manager URL uses `#manager`. URL fragments are handled by the browser and are not included in the page request made by WhatsApp or other link-preview services. Those services therefore receive the creator page metadata for both links.

## Considered approaches

1. Change the main page metadata to the manager offer. This would fix manager shares but make creator links show the wrong $10 offer.
2. Duplicate the complete application at a manager URL. This provides separate metadata but creates two copies of the page that can drift apart.
3. Add a lightweight `/manager` entry page with manager metadata that opens the existing manager view. This is the approved approach because it creates a distinct preview without duplicating the application.

## Routes and metadata

- `https://www.gowishpartner.com/` remains the creator entry point and explicitly describes the $20 creator offer.
- `https://www.gowishpartner.com/manager` becomes the manager entry point.
- The manager preview title is `GoWish Creator Referral Program`.
- The manager preview description is `Earn $10 for every creator you refer who joins GoWish and gets approved. Register once to get your referral code.`
- The manager entry page redirects human visitors to the existing manager view while leaving its metadata available to preview crawlers.
- The application keeps `/manager` in the address bar while the manager view is open, so copied links use the correct preview URL.

## Compatibility and verification

- Existing `/#manager` links continue to open the manager view and are normalized to `/manager` in the browser.
- Returning to the creator view restores the root URL.
- Static tests verify that creator metadata remains creator-specific and manager metadata remains manager-specific.
- Local and public HTTP responses are inspected without executing JavaScript to confirm what preview services receive.
- Desktop and mobile browser checks confirm that `/manager` opens the existing manager page without visual changes or errors.
- Production is accepted only after Vercel reports the exact revision as ready and the public `/manager` response contains the manager metadata.
