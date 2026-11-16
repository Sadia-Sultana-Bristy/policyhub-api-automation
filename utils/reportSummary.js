#!/usr/bin/env node
/**
 * Builds a Markdown execution summary from the Playwright JSON report.
 *   - writes reports/summary.md
 *   - appends to $GITHUB_STEP_SUMMARY when running in GitHub Actions
 * Usage: node utils/reportSummary.js [path/to/results.json]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const input = process.argv[2] || path.join(ROOT, 'reports/json/results.json');
const output = path.join(ROOT, 'reports/summary.md');

if (!fs.existsSync(input)) {
  console.error(`No JSON report at ${input}. Run "npm test" first.`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(input, 'utf8'));

function collectTests(suite, file = suite.file, acc = []) {
  for (const spec of suite.specs || []) {
    for (const t of spec.tests) {
      const last = t.results[t.results.length - 1] || {};
      acc.push({
        file: spec.file || file,
        title: spec.title,
        tags: spec.tags || [],
        status: t.status === 'flaky' ? 'flaky' : last.status === 'passed' ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed',
        duration: last.duration || 0,
        error: last.error && last.error.message,
      });
    }
  }
  for (const child of suite.suites || []) collectTests(child, child.file || file, acc);
  return acc;
}

const tests = report.suites.flatMap((s) => collectTests(s));
const count = (status) => tests.filter((t) => t.status === status).length;
const passed = count('passed');
const failed = count('failed');
const flaky = count('flaky');
const skipped = count('skipped');
const total = tests.length;
const passRate = total ? ((passed / (total - skipped)) * 100).toFixed(1) : '0.0';
const durationS = ((report.stats?.duration || 0) / 1000).toFixed(1);

const byFile = {};
for (const t of tests) {
  const key = t.file.replace(/^tests\//, '');
  byFile[key] ??= { total: 0, passed: 0, failed: 0 };
  byFile[key].total += 1;
  if (t.status === 'passed' || t.status === 'flaky') byFile[key].passed += 1;
  if (t.status === 'failed') byFile[key].failed += 1;
}

const byTag = {};
for (const t of tests) for (const tag of t.tags) byTag[tag] = (byTag[tag] || 0) + 1;

const lines = [
  `## ${failed === 0 ? '✅' : '❌'} PolicyHub API Test Report`,
  '',
  `| Total | Passed | Failed | Flaky | Skipped | Pass rate | Duration |`,
  `|------:|-------:|-------:|------:|--------:|----------:|---------:|`,
  `| ${total} | ${passed} | ${failed} | ${flaky} | ${skipped} | ${passRate}% | ${durationS}s |`,
  '',
  '### Results by suite',
  '',
  '| Suite | Tests | Passed | Failed |',
  '|-------|------:|-------:|-------:|',
  ...Object.entries(byFile).sort().map(([f, s]) => `| \`${f}\` | ${s.total} | ${s.passed} | ${s.failed} |`),
  '',
  '### Coverage by tag',
  '',
  '| Tag | Tests |',
  '|-----|------:|',
  ...Object.entries(byTag).sort((a, b) => b[1] - a[1]).map(([tag, n]) => `| \`@${tag}\` | ${n} |`),
];

const failures = tests.filter((t) => t.status === 'failed');
if (failures.length) {
  lines.push('', '### Failures', '');
  for (const f of failures) {
    const msg = (f.error || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 20).join('\n');
    lines.push(`<details><summary>❌ ${f.file} › ${f.title}</summary>`, '', '```', msg, '```', '</details>', '');
  }
}

/** Pad Markdown table columns so the summary is readable in a terminal as well as on GitHub. */
function alignTables(rows) {
  const out = [];
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const cells = block.map((r) => r.slice(1, -1).split('|').map((c) => c.trim()));
    const widths = cells[0].map((_, i) => Math.max(...cells.map((r) => (/^-+:?$/.test(r[i]) ? 3 : r[i].length))));
    for (const r of cells) {
      out.push(`| ${r.map((c, i) => (/^-+(:?)$/.test(c) ? '-'.repeat(widths[i] - (c.endsWith(':') ? 1 : 0)) + (c.endsWith(':') ? ':' : '')
        : /^[\d.%s]+$/.test(c) ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join(' | ')} |`);
    }
    block = [];
  };
  for (const row of rows) {
    if (row.startsWith('|')) block.push(row);
    else { flush(); out.push(row); }
  }
  flush();
  return out;
}

const markdown = `${alignTables(lines).join('\n')}\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

console.log(markdown);
process.exitCode = 0;
