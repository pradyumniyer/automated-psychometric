# Custom Formula Grammar (v2)

Derived from the existing evaluator (`src/scientific/formula.ts`), which is a safe hand-written parser. **It must stay a parser. Never use `eval`, `new Function`, or any dynamic code execution.** A test must assert the module contains neither.

## Where formulas apply
A scale with scoring method `custom` has a formula. Inputs are the scale's item values **after value mapping and reverse coding** (see scientific-spec 1.1–1.2). Proration does **not** apply to custom formulas.

## Grammar (v1, unchanged from as-built)
```
expr   = term (('+' | '-') term)*
term   = factor (('*' | '/') factor)*
factor = number | identifier | '(' expr ')' | '-' factor | '+' factor
```
- Numbers: digits with an optional decimal point (`2`, `0.5`).
- Identifiers: letters, digits, `_` and `.`, starting with a letter or `_`. Matching to column names is exact first, then case-insensitive.
- Operators: `+ - * /` and parentheses. No exponent, no functions in v1.

## Semantics
- If **any referenced item is missing** (blank, allowed non-response, out of range) the result is **missing** (no error).
- Division by zero ⇒ missing for that row.
- Non-finite results ⇒ missing.
- Unknown identifier or invalid syntax ⇒ a visible validation error in the UI (not a silent null).

## Fixes required (found in the existing code)
| # | Problem | Required behavior |
|---|---------|-------------------|
| F1 | Column names with spaces or hyphens (e.g. `Item 1`) cannot be written as identifiers | Allow referencing by a **column alias** (auto-generated safe name such as `Item_1`) or by quoting: `"Item 1"` |
| F2 | A numeric literal like `1.2.3` is silently parsed as `1.2` | Reject with a syntax error |
| F3 | Validation evaluates with all items = 1, so `x / (a - b)` falsely reports "could not evaluate" | Validate **syntax and identifiers** only; do not reject on evaluation of dummy values |
| F4 | No documented way to say "mean of these items" | Not in v1. If wanted, add as an ADR (e.g. `SUM(...)`, `MEAN(...)`) with tests |

## Tests
Table-driven tests: precedence, parentheses, unary minus, missing input ⇒ missing, divide by zero ⇒ missing, unknown identifier ⇒ error, spaces in names (F1), `1.2.3` rejected (F2), `x/(a-b)` validates (F3).
