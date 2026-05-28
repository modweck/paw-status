#!/usr/bin/env node
/**
 * Groomer pricing extractor.
 *
 * For every groomer in Supabase that has a website URL, fetches the home
 * page and a handful of likely pricing subpages, sends the cleaned HTML to
 * Claude Haiku, and writes any structured prices back to the
 * `groomer_pricing` table.
 *
 * Usage:
 *   # Default: extract -> save JSON to scripts/output/pricing-extract-*.json
 *   #                    NO database write.
 *   node scripts/extract-groomer-pricing.js
 *
 *   # Just a few for testing the prompt:
 *   node scripts/extract-groomer-pricing.js --limit 5
 *
 *   # Only re-do groomers whose latest extracted_at is older than 7 days:
 *   node scripts/extract-groomer-pricing.js --since 7d
 *
 *   # Just one groomer:
 *   node scripts/extract-groomer-pricing.js --groomer <uuid>
 *
 *   # Also push the result rows to the live groomer_pricing table.
 *   # Without --push, nothing reaches the database.
 *   node scripts/extract-groomer-pricing.js --push
 *
 *   # Push an existing extract back into the database without re-running
 *   # the LLM. Useful after you've reviewed scripts/output/...json.
 *   node scripts/extract-groomer-pricing.js --from-file <path> --push
 *
 *   # Print to console only, no file or DB writes.
 *   node scripts/extract-groomer-pricing.js --dry-run
 *
 * Required env (.env at repo root or apps/web/.env):
 *   SUPABASE_URL            project URL
 *   SUPABASE_SECRET_KEY     service-role key (NOT the publishable key)
 *   ANTHROPIC_API_KEY       https://console.anthropic.com — Haiku is cheap
 *                           (not required when using --from-file)
 *
 * Cost: ~$0.01 per groomer at current Haiku pricing. ~$3.50 for 349 rows.
 */

import { config as loadDotenv } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Load .env from the project root first (where SUPABASE / Google keys live
// on this machine), then apps/web/.env as a fallback, then shell env.
loadDotenv({ path: resolve(repoRoot, '.env') });
loadDotenv({ path: resolve(repoRoot, 'apps/web/.env') });
loadDotenv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in env.');
  process.exit(1);
}
// ANTHROPIC_API_KEY is only required when actually extracting. --from-file
// pushes a previously-saved JSON without calling the LLM, so we let it run.

const PRICING_PATHS = [
  '',
  '/pricing',
  '/prices',
  '/services',
  '/grooming',
  '/rates',
  '/pricing-services',
  '/services-1',
];

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_HTML_BYTES = 120_000;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ' +
  '(ShinyPawz price indexer; contact: hello@shinypawz.com)';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

function parseArgs(argv) {
  const args = {
    limit: null,
    since: null,
    groomer: null,
    dryRun: false,
    push: false,
    fromFile: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--since') args.since = argv[++i];
    else if (arg === '--groomer') args.groomer = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--push') args.push = true;
    else if (arg === '--from-file') args.fromFile = argv[++i];
  }
  return args;
}

function outputFilePath() {
  const dir = resolve(repoRoot, 'scripts/output');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(dir, `pricing-extract-${stamp}.json`);
}

function sinceToISO(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d+)([dwh])$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = unit === 'h' ? n * 3600_000 : unit === 'd' ? n * 86_400_000 : n * 604_800_000;
  return new Date(Date.now() - ms).toISOString();
}

async function loadGroomers({ limit, since, groomer }) {
  if (groomer) {
    const { data, error } = await supabase
      .from('groomers')
      .select('id, name, website')
      .eq('id', groomer);
    if (error) throw error;
    return (data || []).filter((row) => row.website);
  }

  let query = supabase
    .from('groomers')
    .select('id, name, website')
    .not('website', 'is', null)
    .order('name', { ascending: true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;

  if (!since) return data || [];

  const sinceISO = sinceToISO(since);
  if (!sinceISO) return data || [];

  const { data: recent, error: recentError } = await supabase
    .from('groomer_pricing')
    .select('groomer_id, extracted_at')
    .gte('extracted_at', sinceISO);
  if (recentError) throw recentError;

  const recentSet = new Set((recent || []).map((row) => row.groomer_id));
  return (data || []).filter((row) => !recentSet.has(row.id));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, text: '' };
    }
    const text = await response.text();
    return { ok: true, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error?.message || 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function makeAbsolute(websiteUrl) {
  try {
    return new URL(websiteUrl);
  } catch {
    return null;
  }
}

async function collectPages(websiteUrl) {
  const base = makeAbsolute(websiteUrl);
  if (!base) return { pages: [], reason: 'invalid_url' };

  const pages = [];
  for (const path of PRICING_PATHS) {
    const url = new URL(path || '/', base).toString();
    const result = await fetchWithTimeout(url);
    if (!result.ok) continue;
    const text = stripHtml(result.text);
    if (!text) continue;
    pages.push({ url, text: text.slice(0, MAX_HTML_BYTES) });
    if (pages.length >= 4) break;
  }

  if (pages.length === 0) {
    return { pages: [], reason: 'unreachable_or_blocked' };
  }
  return { pages, reason: 'ok' };
}

const EXTRACTION_INSTRUCTIONS = `
You are extracting STRUCTURED PRICING data from a dog groomer's own website.

Return STRICT JSON. No prose, no markdown fences. The schema is:

{
  "prices": [
    {
      "service": string,            // canonical: "bath", "full_groom",
                                    //   "deshedding", "nail_trim", "teeth_brush",
                                    //   "anal_glands", "daycare", "boarding",
                                    //   "walking", "addon"
      "service_label": string,      // the human label from the site, e.g.
                                    //   "Full Groom" or "Spa Bath"
      "dog_size": string | null,    // one of: "toy", "small", "medium",
                                    //   "large", "xl", or null if the price
                                    //   is flat (does not vary by size)
      "price_low": number | null,   // dollars; integer or 2-decimal
      "price_high": number | null,  // dollars; null if a flat price
      "raw_snippet": string         // the literal text on the page where
                                    //   you saw this price
    }
  ],
  "no_prices_found": boolean        // true ONLY if the site has zero
                                    //   numeric prices. If you found ANY
                                    //   prices, set false.
}

Strict rules:
- Only include prices for services the customer can BOOK (bath, groom,
  deshed, nail trim, etc.). EXCLUDE retail products (shampoo bottles,
  treats, leashes).
- "starts at $80" -> price_low=80, price_high=null.
- "$80 - $140" -> price_low=80, price_high=140.
- "Toy: $65, Small: $80, Medium: $110, Large: $140, XL: $180" -> one row
  per size.
- If a service has many tiny weight tiers ("1-10 lb $65, 11-20 lb $80,
  21-30 lb $95, ..."), collapse them to the standard 5 buckets:
    toy <= 10 lb, small 11-20, medium 21-40, large 41-70, xl > 70.
- Currency is always USD; do not include it in the JSON.
- If you cannot find any prices on the page, return {"prices": [],
  "no_prices_found": true}.
- DO NOT INVENT prices. If unsure, omit the row.
`;

function buildUserMessage(groomerName, pages) {
  const header = `Groomer: ${groomerName}\n\nPages (text-only, JS removed):`;
  const body = pages
    .map((page, idx) => `--- Page ${idx + 1}: ${page.url} ---\n${page.text}\n`)
    .join('\n');
  return `${header}\n${body}\n\nExtract pricing as JSON per the instructions.`;
}

async function extractWithClaude(groomerName, pages) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: EXTRACTION_INSTRUCTIONS,
    messages: [{ role: 'user', content: buildUserMessage(groomerName, pages) }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed?.prices)) return { prices: [], noPrices: true };
    return {
      prices: parsed.prices,
      noPrices: Boolean(parsed.no_prices_found) || parsed.prices.length === 0,
    };
  } catch (error) {
    console.warn(`  parse error: ${error.message}. Raw output:\n${cleaned.slice(0, 200)}`);
    return { prices: [], noPrices: true, parseError: true };
  }
}

function normalizeRows(groomerId, prices, sourceUrl) {
  const rows = [];
  for (const entry of prices) {
    if (!entry || typeof entry !== 'object') continue;
    const service = String(entry.service || '').trim().toLowerCase();
    if (!service) continue;

    const priceLow =
      Number.isFinite(Number(entry.price_low)) && Number(entry.price_low) > 0
        ? Number(entry.price_low)
        : null;
    const priceHigh =
      Number.isFinite(Number(entry.price_high)) && Number(entry.price_high) > 0
        ? Number(entry.price_high)
        : null;
    if (priceLow == null && priceHigh == null) continue;

    const dogSize =
      typeof entry.dog_size === 'string' && entry.dog_size.trim()
        ? entry.dog_size.trim().toLowerCase()
        : null;

    rows.push({
      groomer_id: groomerId,
      service,
      dog_size: dogSize,
      price_low: priceLow,
      price_high: priceHigh,
      currency: 'USD',
      source: 'website',
      source_url: sourceUrl,
      raw_text:
        typeof entry.raw_snippet === 'string' ? entry.raw_snippet.slice(0, 240) : null,
    });
  }
  return rows;
}

async function replaceGroomerPricing(groomerId, rows) {
  const { error: deleteError } = await supabase
    .from('groomer_pricing')
    .delete()
    .eq('groomer_id', groomerId)
    .eq('source', 'website');
  if (deleteError) {
    console.warn(`  delete error: ${deleteError.message}`);
    return;
  }

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from('groomer_pricing').insert(rows);
  if (insertError) {
    console.warn(`  insert error: ${insertError.message}`);
  }
}

async function pushExtractsToDatabase(extracts) {
  let pushed = 0;
  for (const extract of extracts) {
    await replaceGroomerPricing(extract.groomer_id, extract.rows || []);
    if ((extract.rows || []).length) pushed += 1;
  }
  return pushed;
}

async function runFromFile(args) {
  const raw = readFileSync(args.fromFile, 'utf8');
  const payload = JSON.parse(raw);
  const extracts = Array.isArray(payload?.extracts) ? payload.extracts : [];
  console.log(`Loaded ${extracts.length} extracts from ${args.fromFile}`);
  if (!args.push) {
    console.log('No --push flag, nothing to do. Pass --push to write to the live DB.');
    return;
  }
  const pushed = await pushExtractsToDatabase(extracts);
  console.log(`Pushed ${pushed} groomers with pricing to groomer_pricing.`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.fromFile) {
    await runFromFile(args);
    return;
  }

  if (!anthropic) {
    console.error('Missing ANTHROPIC_API_KEY. Get one at https://console.anthropic.com');
    process.exit(1);
  }

  console.log(`shinypawz: extracting groomer pricing (model=${MODEL})`);
  if (args.dryRun) console.log('DRY RUN — no file or DB writes');
  else if (args.push) console.log('Will write JSON to scripts/output/ AND push to live DB.');
  else console.log('Will write JSON to scripts/output/ only. Pass --push to also write to live DB.');

  const groomers = await loadGroomers(args);
  console.log(`Found ${groomers.length} groomers to process.`);

  const extracts = [];
  let processed = 0;
  let withPrices = 0;
  let totalRows = 0;
  let blocked = 0;
  let noPrices = 0;
  let errors = 0;

  for (const groomer of groomers) {
    processed += 1;
    const label = `[${processed}/${groomers.length}] ${groomer.name}`;
    console.log(`${label} — ${groomer.website}`);
    try {
      const { pages, reason } = await collectPages(groomer.website);
      if (pages.length === 0) {
        console.log(`  skipped (${reason})`);
        blocked += 1;
        extracts.push({
          groomer_id: groomer.id,
          groomer_name: groomer.name,
          website: groomer.website,
          status: 'blocked',
          reason,
          rows: [],
        });
        continue;
      }

      const { prices, noPrices: empty, parseError } = await extractWithClaude(
        groomer.name,
        pages,
      );
      if (parseError) errors += 1;

      if (empty) {
        console.log('  no prices found on public pages');
        noPrices += 1;
        extracts.push({
          groomer_id: groomer.id,
          groomer_name: groomer.name,
          website: groomer.website,
          status: 'no_prices',
          rows: [],
        });
        continue;
      }

      const rows = normalizeRows(groomer.id, prices, pages[0].url);
      if (rows.length === 0) {
        console.log('  no valid rows after normalisation');
        noPrices += 1;
        extracts.push({
          groomer_id: groomer.id,
          groomer_name: groomer.name,
          website: groomer.website,
          status: 'no_valid_rows',
          rows: [],
        });
        continue;
      }

      withPrices += 1;
      totalRows += rows.length;
      console.log(`  extracted ${rows.length} pricing rows`);
      extracts.push({
        groomer_id: groomer.id,
        groomer_name: groomer.name,
        website: groomer.website,
        status: 'ok',
        rows,
      });
    } catch (error) {
      errors += 1;
      console.warn(`  error: ${error?.message || error}`);
      extracts.push({
        groomer_id: groomer.id,
        groomer_name: groomer.name,
        website: groomer.website,
        status: 'error',
        error: error?.message || String(error),
        rows: [],
      });
    }
  }

  console.log('\n--- summary ---');
  console.log(`processed:       ${processed}`);
  console.log(`with prices:     ${withPrices}`);
  console.log(`no prices:       ${noPrices}`);
  console.log(`blocked / fetch: ${blocked}`);
  console.log(`errors:          ${errors}`);
  console.log(`total rows:      ${totalRows}`);

  if (args.dryRun) {
    console.log('\nDRY RUN — skipped both local JSON write and DB push.');
    return;
  }

  const outFile = outputFilePath();
  const payload = {
    extracted_at: new Date().toISOString(),
    model: MODEL,
    groomers_processed: processed,
    with_prices: withPrices,
    no_prices: noPrices,
    blocked,
    errors,
    extracts,
  };
  writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nWrote local extract: ${outFile}`);

  if (!args.push) {
    console.log('Review the file above. Re-run with --from-file <path> --push to write to the live DB.');
    return;
  }

  const pushed = await pushExtractsToDatabase(extracts);
  console.log(`Pushed ${pushed} groomers with pricing to groomer_pricing.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
