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

/** Class tokens from a JSX className expression: literals only, logic discarded. */
function tokensFromExpression(expr) {
  const tokens = new Set();
  // Template literals: keep the literal spans, drop `${...}` interpolations.
  for (const tpl of expr.matchAll(/`([^`]*)`/g)) {
    for (const part of tpl[1].split(/\$\{[^}]*\}/)) {
      for (const token of part.split(/\s+/)) if (token) tokens.add(token);
    }
  }
  // Quoted branches: `cond ? "a b" : "c"`. Comparison operands such as
  // `layout === "strip"` are logic, not classes, so drop them first.
  const withoutTemplates = expr.replace(/`[^`]*`/g, " ");
  const withoutComparisons = withoutTemplates.replace(/[=!]==?\s*(?:"[^"]*"|'[^']*')/g, " ");
  for (const str of withoutComparisons.matchAll(/"([^"]*)"/g)) {
    for (const token of str[1].split(/\s+/)) if (token) tokens.add(token);
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
      for (const token of tokensFromExpression(parsed.text)) tokens.add(token);
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