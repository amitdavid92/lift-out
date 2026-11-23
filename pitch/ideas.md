# Pitch ideas

Notes for presenting Lift Out at the Claude build day at JLL's Tel Aviv office.

## One-line version

Click any part of a page to isolate it, understand it and see what it connects to, without having to fight the rest of the page.

## How it connects to accessibility

Most web pages force everyone to cope with the whole page at once. Lift Out lets a person deal with one piece at a time, on their own terms. Each feature removes a specific barrier.

### Lift out: clutter and scale

- **Low vision:** the block is enlarged and shown in high contrast without zooming the whole page and breaking its layout.
- **Attention and cognitive load (ADHD, brain injury, anxiety):** ads, sidebars, animation and competing content disappear, leaving one thing to focus on.
- **Motor impairments:** links inside the lifted block become larger targets.

### Description: comprehension

- **Cognitive and learning disabilities, dyslexia:** dense or jargon-heavy text is restated in plain language.
- **Blind and low-vision users:** images and charts that lack alt text get a description a screen reader can read.
- **Confusing interfaces:** it explains what a block is and what it does ("this is a cookie banner; the reject option is the grey link").

### Related items: navigation

- **Screen reader and keyboard users:** finding the footnote, chart or definition a paragraph refers to can take dozens of key presses; this brings those pieces to the user.
- **Working-memory difficulties:** the context sits beside the content, so the user does not have to hold it in their head while scrolling.

### What keeps the claim honest

- **The animation serves orientation.** The lift from the original spot and the ghost placeholder show where the content came from. Under reduced-motion settings it all becomes a short fade.
- **The panel itself is accessible.** It is keyboard-operable, focus-managed and announced to screen readers.
- **Standards to cite:** WCAG covers text alternatives, contrast, resizing and readable language; the W3C's cognitive accessibility guidance (COGA) covers reducing distraction and helping users stay oriented.

## Demo sites

None of these has been tried with the extension yet. Rehearse each one before presenting.

### JLL's own content

- Global real estate trends and perspectives, November 2026 (lead with this): https://www.jll.com/en-us/insights/market-perspectives/global
- Global real estate outlook, mid-year update: https://www.jll.com/en-us/insights/market-outlook/global-real-estate
- Global real estate transparency index 2026: https://www.jll.com/en-us/insights/global-real-estate-transparency-index
- JLL Israel page (local touch, but no market data): https://www.jll.com/en-us/locations/israel

### Dense legal and financial text

- JLL privacy policy, plus the cookie banner on a first visit: https://www.jll.com/en-us/privacy-policy
- JLL Form 10-K for 2025, Item 1A Risk Factors: https://www.sec.gov/Archives/edgar/data/1037976/000103797626000037/jll-20251231.htm

### Tel Aviv angle

- Globes, defense-tech boom pushes up Tel Aviv office rents (English): https://en.globes.co.il/en/article-1001554326
- Calcalist, article citing JLL's fit-out cost guide (Hebrew; right-to-left layout is untested in the panel): https://www.calcalist.co.il/real-estate/article/sydxxx2wfl

### Safe fallback

- Wikipedia, capitalization rate: https://en.wikipedia.org/wiki/Capitalization_rate

## Rehearsal checklist

- **Not on the settings page:** the extension does not run on its own settings page or on `chrome://` pages. Demo on an ordinary site.
- **Block selection:** the outline lands on the paragraph you want, not a large wrapper around it.
- **Related cards:** the page has at least a few real paragraphs, tables or lists, since cards only come from the same page.
- **Network:** the office wifi allows calls to api.anthropic.com.
- **Spare tab:** keep the Wikipedia fallback open in case a live site misbehaves.

## Where it could go next

- Write generated image descriptions back into the page as alt text.
- Related items from linked pages, not only the current one.
- Read the lifted block aloud with word-by-word highlighting.
- Step the description down through reading levels on repeat clicks.
- Testing with people who use assistive technology every day.
