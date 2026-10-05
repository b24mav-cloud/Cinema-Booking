import fs from "node:fs";
import path from "node:path";

/**
 * Guards the bug class that typecheck and `next build` cannot see: markup that
 * toggles a class for which the stylesheet has no rule. That is how the Strip /
 * Grid switch shipped looking "working" while doing nothing except hiding the
 * arrows.
 *
 * Run: npm run check:css
 */

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

// Bootstrap is imported globally, so its utilities are covered elsewhere.
const EXTERNAL = /^(d-flex|d-grid|d-block|d-none|justify-content-[\w-]+|align-items-[\w-]+|align-self-[\w-]+|flex-[\w-]+|gap-[\w]+|text-(decoration-none|muted|center|gold)|mb-[\w]+|mt-[\w]+|ms-[\w]+|me-[\w]+|p-[\w]+|w-[\w]+|h-[\w]+|order-[\w]+)$/;

/**
 * Reads the `className` value starting at `at`. Handles both `className="a b"`
 * and `className={...}`, returning the balanced substring and where it ended.
 */
function readClassName(source, at) {
  const quote = source[at];
  if (quote === '"' || quote === "'") {
    const end = source.indexOf(quote, at + 1);
    return end < 0 ? null : { quoted: true, text: source.slice(at + 1, end), next: end + 1 };
  }
  if (quote !== "{") return null;
  let depth = 0;
  for (let i = at; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { quoted: false, text: source.slice(at + 1, i), next: i + 1 };
    }
  }
  return null;
}

/**
 * Scans a template literal body and returns its literal spans plus the
 * interpolation expressions.
 *
 * A regex cannot do this: `${cond ? `a` : `b`}` contains backticks, so a naive
 * `` /`([^`]*)`/ `` match runs off the end of the outer literal and yields
 * fragments like `?` and `.${modifier` as if they were class names.
 */
function scanTemplate(body) {
  const spans = [];
  const exprs = [];
  let current = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "$" && body[i + 1] === "{") {
      if (current) spans.push(current);
      current = "";
      let depth = 1;
      const start = i + 2;
      i++;
      for (; i < body.length && depth > 0; i++) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") depth--;
        if (depth === 0) break;
      }
      exprs.push(body.slice(start, i));
      continue;
    }
    current += body[i];
  }
  if (current) spans.push(current);
  return { spans, exprs };
}

/** Literal spans, interpolation expressions, and source ranges of every template. */
function templateParts(expr) {
  const spans = [];
  const exprs = [];
  const ranges = [];
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "`") {
      const start = i;
      let body = "";
      i++;
      for (; i < expr.length; i++) {
        if (expr[i] === "\\") {
          body += expr[i + 1] ?? "";
          i++;
          continue;
        }
        if (expr[i] === "`") break;
        body += expr[i];
      }
      ranges.push([start, i + 1]);
      const scanned = scanTemplate(body);
      spans.push(...scanned.spans);
      exprs.push(...scanned.exprs);
    }
  }
  return { spans, exprs, ranges };
}

/** The expression with every template literal blanked, leaving plain JSX code. */
function withoutTemplates(expr, ranges) {
  let out = expr;
  for (const [start, end] of [...ranges].reverse()) {
    out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
  }
  return out;
}

/**
 * Class strings held by a module-scope lookup, so `${STATE_CLASS[state]}` can be
 * verified.
 *
 * Resolves a declaration of `name` and collects every quoted string inside it,
 * which covers both `const X = { a: "cls", b: "cls" }` and a `type X = "cls" |
 * "cls"` union. Without this, an interpolated class name is invisible to the
 * check: the previous seat picker passed with no `.seat-selected` rule in sight
 * because `seat-${state}` produced no tokens at all.
 */
function resolveIdentifier(name, source) {
  const found = new Set();
  const decl = new RegExp(`\\b(?:const|let|var|type)\\s+${name}\\b`, "g");
  let match;
  while ((match = decl.exec(source))) {
    const from = match.index;
    const eq = source.indexOf("=", from);
    const brace = source.indexOf("{", from);
    const semi = source.indexOf(";", from);
    // Start at the initializer, not the annotation: in
    // `const X: Record<Props["mode"], string> = { ... }` the annotation's
    // "mode" is a type argument, not a class.
    let start = from;
    let end = -1;
    if (eq >= 0 && (semi < 0 || eq < semi)) start = eq + 1;
    if (brace >= 0 && (semi < 0 || brace < semi) && brace >= start) {
      let depth = 0;
      for (let i = brace; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
    } else {
      end = semi >= 0 ? semi : source.indexOf("\n", start);
    }
    if (end < 0) continue;
    for (const str of source.slice(start, end + 1).matchAll(/"([^"]*)"/g)) {
      // Only single class-shaped tokens. A lookup table holds class names; a
      // `const now = new Date()` or a date-format string does not, and admitting
      // arbitrary strings would report `now` as a missing class.
      if (/^[A-Za-z][\w-]*$/.test(str[1])) found.add(str[1]);
    }
  }
  return found;
}

/** Class tokens from a JSX className expression: literals, plus resolved lookups. */
function tokensFromExpression(expr, source) {
  const tokens = new Set();
  const add = text => {
    for (const token of text.split(/\s+/)) if (token) tokens.add(token);
  };

  // 1. Literal spans inside templates: the plain words between `${...}`.
  const { spans, exprs, ranges } = templateParts(expr);
  for (const span of spans) add(span);

  // 2. Quoted branches, in the JSX code and inside interpolations alike:
  // `cond ? "a b" : "c"` and `${cond ? "seat-recliner" : ""}`. Comparison
  // operands such as `layout === "strip"` are logic, not classes, so drop them
  // first.
  const code = [withoutTemplates(expr, ranges), ...exprs];
  for (const fragment of code) {
    const withoutComparisons = fragment.replace(/[=!]==?\s*(?:"[^"]*"|'[^']*')/g, " ");
    for (const str of withoutComparisons.matchAll(/"([^"]*)"/g)) add(str[1]);
  }

  // 3. Class tables used in an indexed lookup: `${STATE_CLASS[state]}` or
  // `[..., STATE_CLASS[state], ...]`. Only a lookup counts, so an unrelated
  // identifier inside an interpolation is not mistaken for a class table.
  for (const ident of code.join(" ").matchAll(/\b([A-Za-z_$][\w$]*)\s*\[/g)) {
    for (const value of resolveIdentifier(ident[1], source)) add(value);
  }

  return tokens;
}

function appliedClasses(file) {
  const source = fs.readFileSync(file, "utf8");
  const tokens = new Set();
  const re = /className\s*=\s*/g;
  let match;
  while ((match = re.exec(source))) {
    const at = match.index + match[0].length;
    const parsed = readClassName(source, at);
    if (!parsed) continue;
    if (parsed.quoted) {
      for (const token of parsed.text.split(/\s+/)) if (token) tokens.add(token);
    } else {
      for (const token of tokensFromExpression(parsed.text, source)) tokens.add(token);
    }
    re.lastIndex = parsed.next;
  }
  return tokens;
}

const sourceFiles = [];
(function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.tsx$/.test(entry.name)) sourceFiles.push(full);
  }
})(root);

/**
 * True when the stylesheet mentions the class as a class selector. Matches both
 * a standalone `.name` and a compound `.base.name`, so state modifiers such as
 * `.active` are covered.
 */
function hasRule(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(css);
}

const applied = new Map();
for (const file of sourceFiles) {
  for (const name of appliedClasses(file)) {
    if (EXTERNAL.test(name)) continue;
    if (!applied.has(name)) applied.set(name, []);
    applied.get(name).push(path.relative(root, file).replace(/\\/g, "/"));
  }
}

const missing = [...applied.entries()]
  .filter(([name]) => !hasRule(name))
  .sort(([a], [b]) => a.localeCompare(b));

if (missing.length === 0) {
  console.log(`PASS  all ${applied.size} applied classes have a stylesheet rule`);
  process.exit(0);
}

console.log(`FAIL  ${missing.length} of ${applied.size} applied classes have no stylesheet rule:\n`);
for (const [name, files] of missing) {
  console.log(`  .${name.padEnd(24)} ${[...new Set(files)].join(", ")}`);
}
process.exit(1);