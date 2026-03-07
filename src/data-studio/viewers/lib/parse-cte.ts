export interface CTEDefinition {
  name: string;
  body: string;
  startLine: number; // 1-based, where "name AS (" begins
  endLine: number; // 1-based, closing ")"
  dependencies: string[];
}

export interface CTEParseResult {
  ctes: CTEDefinition[];
  finalSelect: string;
  isRecursive: boolean;
}

/** Parse all CTEs from a SQL string. Returns null if no WITH clause found. */
export function parseCTEs(sql: string): CTEParseResult | null {
  const scanner = new Scanner(sql);

  // Skip leading whitespace/comments
  scanner.skipWhitespaceAndComments();

  // Check for WITH keyword
  if (!scanner.matchKeyword("WITH")) return null;
  scanner.skipWhitespaceAndComments();

  let isRecursive = false;
  if (scanner.matchKeyword("RECURSIVE")) {
    isRecursive = true;
    scanner.skipWhitespaceAndComments();
  }

  const ctes: CTEDefinition[] = [];

  // Parse each CTE definition
  while (!scanner.isEOF()) {
    const cte = parseSingleCTE(scanner);
    if (!cte) break;
    ctes.push(cte);

    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ",") {
      scanner.advance(); // consume comma
      scanner.skipWhitespaceAndComments();
    } else {
      break;
    }
  }

  if (ctes.length === 0) return null;

  // Everything remaining is the final SELECT
  const finalSelect = sql.slice(scanner.pos).trim();

  // Resolve dependencies: for each CTE body, find references to other CTE names
  const cteNames = new Set(ctes.map((c) => c.name.toLowerCase()));
  for (const cte of ctes) {
    cte.dependencies = findReferences(cte.body, cteNames, cte.name.toLowerCase());
  }

  return { ctes, finalSelect, isRecursive };
}

/** Build a runnable query for a specific CTE target including its transitive dependencies. */
export function buildCTEQuery(
  target: string,
  parseResult: CTEParseResult,
): string {
  const cteMap = new Map<string, CTEDefinition>();
  for (const cte of parseResult.ctes) {
    cteMap.set(cte.name.toLowerCase(), cte);
  }

  const targetLower = target.toLowerCase();
  if (!cteMap.has(targetLower)) {
    throw new Error(`CTE "${target}" not found`);
  }

  // DFS to collect transitive dependencies
  const needed = new Set<string>();
  const visit = (name: string) => {
    if (needed.has(name)) return;
    needed.add(name);
    const cte = cteMap.get(name);
    if (!cte) return;
    for (const dep of cte.dependencies) {
      visit(dep.toLowerCase());
    }
  };
  visit(targetLower);

  // Collect in original order
  const ordered = parseResult.ctes.filter((c) =>
    needed.has(c.name.toLowerCase()),
  );

  const recursive = parseResult.isRecursive ? " RECURSIVE" : "";
  const cteParts = ordered.map((c) => `${c.name} AS (${c.body})`);

  return `WITH${recursive} ${cteParts.join(",\n")}\nSELECT * FROM ${target}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

class Scanner {
  pos = 0;
  private readonly src: string;
  private readonly len: number;

  constructor(src: string) {
    this.src = src;
    this.len = src.length;
  }

  isEOF(): boolean {
    return this.pos >= this.len;
  }

  peek(): string {
    return this.src[this.pos] ?? "";
  }

  advance(): void {
    this.pos++;
  }

  /** Line number (1-based) at current position. */
  line(): number {
    let n = 1;
    for (let i = 0; i < this.pos && i < this.len; i++) {
      if (this.src[i] === "\n") n++;
    }
    return n;
  }

  /** Skip whitespace and SQL comments (-- and block). */
  skipWhitespaceAndComments(): void {
    while (this.pos < this.len) {
      const ch = this.src[this.pos];
      if (/\s/.test(ch)) {
        this.pos++;
        continue;
      }
      if (
        ch === "-" &&
        this.pos + 1 < this.len &&
        this.src[this.pos + 1] === "-"
      ) {
        // line comment
        this.pos += 2;
        while (this.pos < this.len && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (
        ch === "/" &&
        this.pos + 1 < this.len &&
        this.src[this.pos + 1] === "*"
      ) {
        // block comment (nestable)
        this.pos += 2;
        let depth = 1;
        while (this.pos < this.len && depth > 0) {
          if (
            this.src[this.pos] === "/" &&
            this.pos + 1 < this.len &&
            this.src[this.pos + 1] === "*"
          ) {
            depth++;
            this.pos += 2;
          } else if (
            this.src[this.pos] === "*" &&
            this.pos + 1 < this.len &&
            this.src[this.pos + 1] === "/"
          ) {
            depth--;
            this.pos += 2;
          } else {
            this.pos++;
          }
        }
        continue;
      }
      break;
    }
  }

  /** Case-insensitive keyword match followed by a non-word boundary. Does not consume if no match. */
  matchKeyword(keyword: string): boolean {
    const end = this.pos + keyword.length;
    if (end > this.len) return false;
    const slice = this.src.slice(this.pos, end);
    if (slice.toLowerCase() !== keyword.toLowerCase()) return false;
    // Must be followed by non-word char or EOF
    if (end < this.len && /\w/.test(this.src[end])) return false;
    this.pos = end;
    return true;
  }

  /** Read a quoted or unquoted identifier. */
  readIdentifier(): string | null {
    if (this.pos >= this.len) return null;
    const ch = this.src[this.pos];

    // Double-quoted identifier
    if (ch === '"') {
      this.pos++;
      let name = "";
      while (this.pos < this.len) {
        if (this.src[this.pos] === '"') {
          this.pos++;
          if (this.pos < this.len && this.src[this.pos] === '"') {
            name += '"';
            this.pos++;
          } else {
            break;
          }
        } else {
          name += this.src[this.pos];
          this.pos++;
        }
      }
      return name;
    }

    // Backtick-quoted identifier (MySQL style)
    if (ch === "`") {
      this.pos++;
      let name = "";
      while (this.pos < this.len && this.src[this.pos] !== "`") {
        name += this.src[this.pos];
        this.pos++;
      }
      if (this.pos < this.len) this.pos++; // consume closing backtick
      return name;
    }

    // Unquoted
    if (/[a-zA-Z_]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.len && /\w/.test(this.src[this.pos])) this.pos++;
      return this.src.slice(start, this.pos);
    }

    return null;
  }

  /** Scan a parenthesized body, respecting strings, comments, nested parens. Returns inner content. */
  scanParenBody(): string | null {
    if (this.peek() !== "(") return null;
    const bodyStart = this.pos + 1;
    this.pos++; // consume opening paren
    let depth = 1;

    while (this.pos < this.len && depth > 0) {
      const ch = this.src[this.pos];
      switch (ch) {
        case "(":
          depth++;
          this.pos++;
          break;
        case ")":
          depth--;
          if (depth === 0) {
            const body = this.src.slice(bodyStart, this.pos);
            this.pos++; // consume closing paren
            return body;
          }
          this.pos++;
          break;
        case "'":
          this.skipSQLString();
          break;
        case '"':
          this.skipQuotedIdentifier();
          break;
        case "-":
          if (this.pos + 1 < this.len && this.src[this.pos + 1] === "-") {
            this.pos += 2;
            while (this.pos < this.len && this.src[this.pos] !== "\n")
              this.pos++;
          } else {
            this.pos++;
          }
          break;
        case "/":
          if (this.pos + 1 < this.len && this.src[this.pos + 1] === "*") {
            this.pos += 2;
            let bd = 1;
            while (this.pos < this.len && bd > 0) {
              if (
                this.src[this.pos] === "*" &&
                this.pos + 1 < this.len &&
                this.src[this.pos + 1] === "/"
              ) {
                bd--;
                this.pos += 2;
              } else if (
                this.src[this.pos] === "/" &&
                this.pos + 1 < this.len &&
                this.src[this.pos + 1] === "*"
              ) {
                bd++;
                this.pos += 2;
              } else {
                this.pos++;
              }
            }
          } else {
            this.pos++;
          }
          break;
        default:
          this.pos++;
      }
    }
    return null; // unmatched
  }

  private skipSQLString(): void {
    this.pos++; // consume opening '
    while (this.pos < this.len) {
      if (this.src[this.pos] === "'") {
        this.pos++;
        if (this.pos < this.len && this.src[this.pos] === "'") {
          this.pos++; // escaped ''
        } else {
          return;
        }
      } else {
        this.pos++;
      }
    }
  }

  private skipQuotedIdentifier(): void {
    this.pos++; // consume opening "
    while (this.pos < this.len) {
      if (this.src[this.pos] === '"') {
        this.pos++;
        if (this.pos < this.len && this.src[this.pos] === '"') {
          this.pos++; // escaped ""
        } else {
          return;
        }
      } else {
        this.pos++;
      }
    }
  }
}

function parseSingleCTE(scanner: Scanner): CTEDefinition | null {
  const startLine = scanner.line();
  const name = scanner.readIdentifier();
  if (!name) return null;

  scanner.skipWhitespaceAndComments();

  // Optional column list: name (col1, col2) AS (...)
  if (scanner.peek() === "(") {
    // Check if this is "AS" after — peek ahead
    const saved = scanner.pos;
    scanner.scanParenBody(); // skip column list
    scanner.skipWhitespaceAndComments();
    if (!scanner.matchKeyword("AS")) {
      // Not a column list — restore and try AS directly
      scanner.pos = saved;
    }
  } else {
    if (!scanner.matchKeyword("AS")) return null;
  }

  scanner.skipWhitespaceAndComments();

  const body = scanner.scanParenBody();
  if (body === null) return null;

  const endLine = scanner.line();

  return {
    name,
    body,
    startLine,
    endLine,
    dependencies: [], // filled in later
  };
}

/** Find which CTE names are referenced in a SQL body. */
function findReferences(
  body: string,
  cteNames: Set<string>,
  selfName: string,
): string[] {
  const refs = new Set<string>();
  const scanner = new Scanner(body);

  while (!scanner.isEOF()) {
    const ch = body[scanner.pos];

    // Skip strings
    if (ch === "'") {
      scanner.pos++;
      while (scanner.pos < body.length) {
        if (body[scanner.pos] === "'") {
          scanner.pos++;
          if (scanner.pos < body.length && body[scanner.pos] === "'") {
            scanner.pos++;
          } else break;
        } else scanner.pos++;
      }
      continue;
    }

    // Skip quoted identifiers
    if (ch === '"') {
      scanner.pos++;
      while (scanner.pos < body.length && body[scanner.pos] !== '"')
        scanner.pos++;
      if (scanner.pos < body.length) scanner.pos++;
      continue;
    }

    // Skip line comments
    if (
      ch === "-" &&
      scanner.pos + 1 < body.length &&
      body[scanner.pos + 1] === "-"
    ) {
      while (scanner.pos < body.length && body[scanner.pos] !== "\n")
        scanner.pos++;
      continue;
    }

    // Skip block comments
    if (
      ch === "/" &&
      scanner.pos + 1 < body.length &&
      body[scanner.pos + 1] === "*"
    ) {
      scanner.pos += 2;
      let d = 1;
      while (scanner.pos < body.length && d > 0) {
        if (
          body[scanner.pos] === "*" &&
          scanner.pos + 1 < body.length &&
          body[scanner.pos + 1] === "/"
        ) {
          d--;
          scanner.pos += 2;
        } else if (
          body[scanner.pos] === "/" &&
          scanner.pos + 1 < body.length &&
          body[scanner.pos + 1] === "*"
        ) {
          d++;
          scanner.pos += 2;
        } else scanner.pos++;
      }
      continue;
    }

    // Check for identifiers
    if (/[a-zA-Z_]/.test(ch)) {
      const start = scanner.pos;
      while (scanner.pos < body.length && /\w/.test(body[scanner.pos]))
        scanner.pos++;
      const word = body.slice(start, scanner.pos).toLowerCase();
      if (cteNames.has(word) && word !== selfName) {
        refs.add(word);
      }
      continue;
    }

    scanner.pos++;
  }

  return Array.from(refs);
}
