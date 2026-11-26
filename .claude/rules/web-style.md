---
paths:
  - '**/*.ts'
  - '**/*.js'
  - '**/*.svelte'
  - '**/*.css'
  - '**/*.html'
---

# Web style

Ported from the house Go and Bash guides. ESLint (`eslint.config.js`) and Prettier enforce most of it. Write it right the first time instead of relying on `--fix`.

## Whitespace (enforced)

Group statements into small logical steps and separate the steps with one blank line.

- Put a blank line after a closing `}` before the next statement.
- Put a blank line before a multi-line `if`, `for`, `while`, `switch` or `try`. One line that sets a value directly above it may stay attached.
- At most one blank line in a row.

```ts
const run = ++this.xcRun;
const league = xcPrefs.league;
this.xcBusy = true;

try {
  for (const f of this.flights) {
    xc = await flightRepository.getXcScore(f.id, league);
    if (xc === undefined) {
      xc = await scoreFlight(f.fixes, league);
    }

    results.push(xc);
  }
} finally {
  this.xcBusy = false;
}
```

## Errors (enforced)

- Every promise is awaited, returned, caught, or marked as fire-and-forget with `void`. Never drop one silently.
- Never `eval`, `new Function` or string timers.
- No raw HTML sinks (`innerHTML`, `insertAdjacentHTML`) with untrusted input.

## Code (enforced)

- `const` by default, `let` only when the value changes. Svelte `$props` and `$derived` keep `let`.
- `===` and `!==`, except `x == null` for null or undefined.
- Braces around every multi-line body.
- Imports sorted in groups: side effects, `node:`, packages with `$app`, `#lib` and `$lib`, relative.
- Single quotes (Prettier).

## Not enforced, follow by hand

- Uppercase names only for module constants (`BASEMAPS`, `XC_LEAGUES`).
- Template literals only when they interpolate.
- Platform first: prefer a browser feature or the standard library over a new dependency or an external call.
- Do not restyle other people's comments unless you rewrite them.
- No ";" or em-dashes in comments and docs. Split into sentences or use a comma.
