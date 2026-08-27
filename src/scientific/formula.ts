// Custom formula evaluation — basic arithmetic only (no eval, no Function).
// Supports +, -, *, /, parentheses, numeric literals, and column-name references.

export type FormulaValueMap = Record<string, number | null>;

export interface FormulaResult {
  value: number | null;
  error: string | null;
}

// Tokenize the formula into numbers, identifiers, operators, and parens
function tokenize(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
    if (ch === '+' || ch === '-') { tokens.push(ch); i++; continue; }
    if (ch === '*' || ch === '/') { tokens.push(ch); i++; continue; }
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) { num += expr[i]; i++; }
      tokens.push(num);
      continue;
    }
    if (ch === '_' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      let ident = '';
      while (i < expr.length && (expr[i] === '_' || expr[i] === '.' || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= '0' && expr[i] <= '9'))) {
        ident += expr[i]; i++;
      }
      tokens.push(ident);
      continue;
    }
    return null; // invalid character
  }
  return tokens;
}

// Recursive-descent parser for basic arithmetic
// Grammar: expr = term (('+' | '-') term)*
//          term = factor (('*' | '/') factor)*
//          factor = number | identifier | '(' expr ')' | '-' factor | '+' factor

class Parser {
  private pos = 0;
  constructor(private tokens: string[]) {}

  parse(): number | null {
    const val = this.parseExpr();
    if (this.pos !== this.tokens.length) return null;
    return val;
  }

  private parseExpr(): number | null {
    let left = this.parseTerm();
    if (left === null) return null;
    while (this.pos < this.tokens.length && (this.tokens[this.pos] === '+' || this.tokens[this.pos] === '-')) {
      const op = this.tokens[this.pos++];
      const right = this.parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number | null {
    let left = this.parseFactor();
    if (left === null) return null;
    while (this.pos < this.tokens.length && (this.tokens[this.pos] === '*' || this.tokens[this.pos] === '/')) {
      const op = this.tokens[this.pos++];
      const right = this.parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null; // division by zero
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private parseFactor(): number | null {
    if (this.pos >= this.tokens.length) return null;
    const tok = this.tokens[this.pos];
    if (tok === '+') { this.pos++; return this.parseFactor(); }
    if (tok === '-') { this.pos++; const v = this.parseFactor(); return v === null ? null : -v; }
    if (tok === '(') {
      this.pos++;
      const val = this.parseExpr();
      if (this.pos >= this.tokens.length || this.tokens[this.pos] !== ')') return null;
      this.pos++;
      return val;
    }
    // number
    if (/^[0-9.]+$/.test(tok)) { this.pos++; return parseFloat(tok); }
    return null; // identifier — handled by caller with value map
  }
}

// Resolve identifier tokens to numeric values, then parse
export function evaluateFormula(
  formula: string,
  values: FormulaValueMap,
): FormulaResult {
  const trimmed = formula.trim();
  if (!trimmed) return { value: null, error: 'Formula is empty' };

  const tokens = tokenize(trimmed);
  if (!tokens) return { value: null, error: 'Invalid characters in formula' };

  // Replace identifier tokens with their numeric values
  const resolvedTokens: string[] = [];
  for (const tok of tokens) {
    if (tok === '(' || tok === ')' || tok === '+' || tok === '-' || tok === '*' || tok === '/' || /^[0-9.]+$/.test(tok)) {
      resolvedTokens.push(tok);
    } else {
      // It's an identifier — look up in values map
      // Try exact match first, then case-insensitive
      let val: number | null | undefined = values[tok];
      if (val === undefined) {
        const key = Object.keys(values).find((k) => k.toLowerCase() === tok.toLowerCase());
        val = key ? values[key] : undefined;
      }
      if (val === undefined) return { value: null, error: `Unknown column: "${tok}"` };
      if (val === null) return { value: null, error: null }; // missing data → null result
      resolvedTokens.push(String(val));
    }
  }

  const parser = new Parser(resolvedTokens);
  const result = parser.parse();
  if (result === null || isNaN(result) || !isFinite(result)) {
    return { value: null, error: 'Could not evaluate formula' };
  }
  return { value: result, error: null };
}

// Validate a formula string syntax without requiring values — uses dummy 1s for all identifiers
export function validateFormula(formula: string, columnNames: string[]): string | null {
  const trimmed = formula.trim();
  if (!trimmed) return 'Formula is empty';
  const tokens = tokenize(trimmed);
  if (!tokens) return 'Invalid characters in formula';
  // Collect identifiers
  const idents = tokens.filter((t) => t !== '(' && t !== ')' && t !== '+' && t !== '-' && t !== '*' && t !== '/' && !/^[0-9.]+$/.test(t));
  for (const ident of idents) {
    if (!columnNames.some((c) => c.toLowerCase() === ident.toLowerCase())) {
      return `Unknown column: "${ident}"`;
    }
  }
  // Try evaluating with dummy values
  const dummyMap: FormulaValueMap = {};
  for (const col of columnNames) dummyMap[col] = 1;
  const result = evaluateFormula(trimmed, dummyMap);
  if (result.error) return result.error;
  return null; // valid
}
