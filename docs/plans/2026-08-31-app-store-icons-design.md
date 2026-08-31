# App store icons design

## Goal

Make the existing GoWish download links easier to recognize without adding a footer, changing the background, or disrupting the current page design. Update the main headline to the approved mobile-app wording.

## Considered approaches

1. Add a dark download footer with full store badges. This is visually prominent but changes the page rhythm too much.
2. Replace the existing buttons with official badge images. This is familiar but introduces external image assets and inconsistent sizing.
3. Keep the existing buttons and add compact Apple and Google Play icons. This is the approved approach because it preserves the current visual identity and layout.

## Approved design

- Keep both existing download areas in their current positions.
- Keep the current button colors, spacing, labels, and destination URLs.
- Add an Apple icon to each App Store link and a Google Play icon to each Google Play link.
- Use inline, accessible icons that do not depend on third-party image hosting.
- Keep the icons decorative so assistive technology reads each link label only once.
- Change the hero headline to `Get paid $20 to download and join the GoWish Mobile App.`
- Do not add a footer, new download section, dark background, animation, or other layout changes.

## Verification

- Static tests must confirm the exact headline and both icon types in both download areas.
- Existing direct store URLs must remain unchanged.
- All project tests and type checks must pass.
- The page must be checked at desktop and mobile widths before publication.
- The live site must show the exact deployed revision and working links without browser errors.
