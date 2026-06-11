#!/usr/bin/env node
/**
 * Convert hardcoded `Npx` values in globals.css to `rem` for consistent
 * cross-display scaling.
 *
 * Rules (heuristic, conservative — designed to never break visual fidelity):
 *
 *   1. Lines defining shadows (`box-shadow`, `text-shadow`, `filter`,
 *      `backdrop-filter`) keep ALL px values — shadows are inherently
 *      pixel-precise and look wrong when fluid.
 *   2. Lines defining borders / outlines (`border*`, `outline*`) keep px
 *      values <= 3 (hairlines, focus rings). Larger border widths convert.
 *   3. The pill-radius idiom `999px` is kept as-is (semantic "fully round").
 *   4. `0px` collapses to `0` (px suffix is redundant).
 *   5. Everything else: divide by 16, format up to 4 decimals, trim zeros.
 *
 * The original file is preserved at globals.css.bak (created once; not
 * overwritten on re-runs so the pre-conversion source remains recoverable).
 *
 * Usage:
 *   node scripts/convert-px-to-rem.mjs            # converts in place
 *   node scripts/convert-px-to-rem.mjs --dry-run  # report only, no write
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Every CSS file the responsive system covers. Add a path here when you
 * introduce a new global / module stylesheet that participates in layout.
 * Generated `*.module.css` files outside src/ should not be processed.
 */
const SOURCES = [
  "src/app/globals.css",
  "src/app/page.module.css",
  "src/app/(dashboard)/dashboard/dashboard.module.css",
  "src/app/(dashboard)/reports/reports.module.css",
  "src/components/ItemWorkspace.module.css",
  "src/components/ItemDetailDossier.module.css",
  "src/components/ItemDistributionView.module.css",
  "src/components/item-instance/ItemInstanceDetailView.module.css",
].map((p) => path.join(REPO_ROOT, p));

const DRY_RUN = process.argv.includes("--dry-run");

const SHADOW_RE = /\b(box-shadow|text-shadow|filter|backdrop-filter)\s*:/i;
const BORDER_RE =
  /\b(border|border-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)(?:-(?:width|color|style))?|outline|outline-width)\s*:/i;

function toRem(px) {
  if (px === 0) return "0";
  const rem = px / 16;
  let str = rem.toFixed(4);
  // trim trailing zeros and dangling dots: 0.5000 -> 0.5, 1.0000 -> 1
  str = str.replace(/\.?0+$/, "");
  return `${str}rem`;
}

function shouldKeepPx(line, value) {
  if (SHADOW_RE.test(line)) return true;
  if (BORDER_RE.test(line) && value <= 3) return true;
  if (value === 999) return true; // pill radius idiom
  return false;
}

function convert(input) {
  let converted = 0;
  let kept = 0;
  const histogram = new Map();

  const lines = input.split(/\r?\n/);
  const out = lines.map((line) => {
    // skip pure-comment lines so values inside docs aren't touched
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      (trimmed.startsWith("/*") && trimmed.endsWith("*/")) ||
      trimmed.startsWith("*")
    ) {
      return line;
    }
    if (!/\d+px\b/.test(line)) return line;

    return line.replace(/(\d+(?:\.\d+)?)px\b/g, (match, num) => {
      const value = parseFloat(num);
      if (shouldKeepPx(line, value)) {
        kept++;
        return match;
      }
      converted++;
      histogram.set(value, (histogram.get(value) ?? 0) + 1);
      return toRem(value);
    });
  });

  return { output: out.join("\n"), converted, kept, histogram };
}

function processFile(source) {
  if (!fs.existsSync(source)) {
    return { source, missing: true };
  }
  const input = fs.readFileSync(source, "utf8");
  const backup = `${source}.bak`;
  if (!DRY_RUN && !fs.existsSync(backup)) {
    fs.writeFileSync(backup, input, "utf8");
  }
  const result = convert(input);
  if (!DRY_RUN) {
    fs.writeFileSync(source, result.output, "utf8");
  }
  return { source, backup, ...result };
}

function main() {
  const grandHist = new Map();
  let totalConverted = 0;
  let totalKept = 0;
  const rows = [];

  for (const source of SOURCES) {
    const r = processFile(source);
    if (r.missing) {
      rows.push([path.relative(REPO_ROOT, source), "MISSING", "-"]);
      continue;
    }
    rows.push([
      path.relative(REPO_ROOT, source),
      String(r.converted),
      String(r.kept),
    ]);
    totalConverted += r.converted;
    totalKept += r.kept;
    for (const [px, n] of r.histogram) {
      grandHist.set(px, (grandHist.get(px) ?? 0) + n);
    }
  }

  const top = [...grandHist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([px, count]) => `   ${px}px -> ${toRem(px)}  (${count}x)`)
    .join("\n");

  console.log(`\npx -> rem conversion across ${SOURCES.length} stylesheet(s)`);
  console.log(`  mode:      ${DRY_RUN ? "DRY RUN (no write)" : "WRITE"}`);
  for (const [file, conv, kept] of rows) {
    console.log(`  ${conv.padStart(5)} conv / ${kept.padStart(4)} kept   ${file}`);
  }
  console.log(`  total converted: ${totalConverted}`);
  console.log(`  total kept px:   ${totalKept}`);
  console.log(`\nMost-converted values (all files):`);
  console.log(top);
  console.log();
}

main();
