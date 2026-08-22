import { ApiProblem } from './http';
import { sha256 } from './security';
import type { Env, MarketSource } from './types';

interface ScrapedElement {
  text?: string;
  html?: string;
  attributes?: Array<{ name: string; value: string }>;
}

interface ScrapeGroup {
  selector?: string;
  results?: ScrapedElement[] | ScrapedElement;
}

interface ScrapePayload {
  success?: boolean;
  result?: ScrapeGroup[];
  errors?: Array<{ message?: string }>;
}

function clean(value: string | undefined): string {
  return (value || '').replace(/\s+/gu, ' ').trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/p\s*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (_match, entity: string) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] || ' ';
    })
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n\s+/gu, '\n')
    .trim();
}

function groupResults(payload: ScrapePayload, selector: string): ScrapedElement[] {
  const results = payload.result?.find((entry) => entry.selector === selector)?.results;
  if (!results) return [];
  return Array.isArray(results) ? results : [results];
}

function attribute(element: ScrapedElement | undefined, name: string): string {
  return element?.attributes?.find((item) => item.name.toLowerCase() === name)?.value || '';
}

function isLinkedInHost(hostname: string): boolean {
  return /(^|\.)linkedin\.com$/u.test(hostname);
}

async function enrichLinkedInDescription(source: MarketSource): Promise<MarketSource> {
  try {
    const url = new URL(source.url);
    if (!isLinkedInHost(url.hostname)) return source;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RatedN/1.0 career-discovery; public-job-evidence' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return source;
    const html = await response.text();
    const match = html.match(/<div[^>]+class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/iu);
    if (!match) return source;
    return { ...source, description: decodeHtml(match[1]).slice(0, 4_500) };
  } catch {
    return source;
  }
}

async function scrapeLinkedInJobs(env: Env, titles: string[], location: string): Promise<MarketSource[]> {
  const search = new URL('https://www.linkedin.com/jobs/search/');
  search.searchParams.set('keywords', titles.join(' OR '));
  search.searchParams.set('location', location);
  search.searchParams.set('f_TPR', 'r604800');
  search.searchParams.set('position', '1');
  search.searchParams.set('pageNum', '0');

  let payload: ScrapePayload;
  try {
    const browserResponse = await env.BROWSER.quickAction('scrape', {
      url: search.toString(),
      elements: [
        { selector: 'a.base-card__full-link' },
        { selector: '.base-search-card__title' },
        { selector: '.base-search-card__subtitle' },
        { selector: '.job-search-card__location' }
      ],
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 20_000 },
      waitForTimeout: 1_800
    });
    payload = await browserResponse.json<ScrapePayload>();
  } catch (caught) {
    console.error('linkedin_scrape_failed', caught instanceof Error ? caught.message : String(caught));
    throw new ApiProblem(503, 'market_discovery_unavailable', 'Live role discovery is temporarily unavailable. Please try again shortly.');
  }

  if (!payload.success) {
    console.error('linkedin_scrape_rejected', payload.errors?.map((error) => error.message).join('; '));
    throw new ApiProblem(503, 'market_discovery_unavailable', 'Live role discovery is temporarily unavailable. Please try again shortly.');
  }

  const links = groupResults(payload, 'a.base-card__full-link');
  const jobTitles = groupResults(payload, '.base-search-card__title');
  const employers = groupResults(payload, '.base-search-card__subtitle');
  const locations = groupResults(payload, '.job-search-card__location');
  const found: MarketSource[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.min(links.length, 40); index += 1) {
    const rawUrl = attribute(links[index], 'href').split('?')[0];
    let normalizedUrl: string;
    try {
      const candidate = new URL(rawUrl);
      if (!isLinkedInHost(candidate.hostname)) continue;
      normalizedUrl = candidate.toString();
    } catch { continue; }
    const title = clean(jobTitles[index]?.text || links[index]?.text);
    if (!title || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    found.push({ title, employer: clean(employers[index]?.text) || 'Employer not listed', location: clean(locations[index]?.text) || location, url: normalizedUrl });
  }
  if (found.length < 8) throw new ApiProblem(503, 'insufficient_market_results', 'Not enough current public job listings were available for this search. Try a broader location.');

  const selected = found.slice(0, 14);
  const enriched: MarketSource[] = [];
  for (let index = 0; index < selected.length; index += 4) {
    enriched.push(...await Promise.all(selected.slice(index, index + 4).map(enrichLinkedInDescription)));
  }
  return enriched;
}

export async function discoverMarketSources(env: Env, searchTitles: string[], region: string): Promise<MarketSource[]> {
  const titles = [...new Set(searchTitles.map(clean).filter(Boolean))].slice(0, 4);
  if (!titles.length) throw new ApiProblem(422, 'no_search_titles', 'No credible market search could be derived from this experience.');
  const location = clean(region) || 'Remote';
  const queryKey = await sha256(JSON.stringify([titles.map((value) => value.toLowerCase()), location.toLowerCase()]));
  const cached = await env.DB.prepare('SELECT payload_json FROM market_cache WHERE query_key = ? AND expires_at > ?')
    .bind(queryKey, new Date().toISOString()).first<{ payload_json: string }>();
  if (cached) {
    try { return JSON.parse(cached.payload_json) as MarketSource[]; } catch { /* refresh malformed cache */ }
  }

  const enriched = await scrapeLinkedInJobs(env, titles, location);
  const timestamp = new Date();
  await env.DB.prepare(`INSERT INTO market_cache (query_key, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(query_key) DO UPDATE SET payload_json = excluded.payload_json, expires_at = excluded.expires_at, created_at = excluded.created_at`)
    .bind(queryKey, JSON.stringify(enriched), new Date(timestamp.getTime() + 6 * 3_600_000).toISOString(), timestamp.toISOString()).run();
  return enriched;
}
