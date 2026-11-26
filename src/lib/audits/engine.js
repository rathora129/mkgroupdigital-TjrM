import { safeFetch } from '@/lib/net/safe-fetch';
import { AUDIT_MAX_PAGES_LIMIT, AUDIT_CATEGORIES } from './validation';
import {
  attr,
  extractCanonical,
  extractFormControls,
  extractHeadings,
  extractImages,
  extractInlineScriptCount,
  extractJsonLd,
  extractLang,
  extractLinks,
  extractMeta,
  extractStylesheetCount,
  extractTitle,
} from './html';
import {
  isPathAllowed,
  matchingRule,
  parseRobots,
  rulesForAgent,
} from './robots';

// Every check in this module observes what the server actually returned.
// Nothing here runs Lighthouse, PageSpeed Insights or Core Web Vitals
// collection; performance lines are explicitly labelled as response/metadata
// heuristics in the report.
export const AUDIT_SCORING = {
  weights: { critical: 20, high: 10, medium: 5, low: 2, info: 0 },
  method:
    'Heuristic penalty model: the audit starts at 100 and subtracts 20 for each critical finding, 10 for each high, 5 for each medium and 2 for each low finding. Informational findings do not change the score and the floor is 0. This is not a Lighthouse, PageSpeed Insights or Core Web Vitals score.',
};

export const AUDIT_LIMITS = {
  requestDelayMs: 350,
  pageBytes: 400_000,
  pageDecodedBytes: 800_000,
  pageTimeoutMs: 12_000,
  pageRedirects: 3,
  linkCheckBudget: 8,
  linkCheckBytes: 150_000,
  linkCheckTimeoutMs: 6_000,
  linkCheckRedirects: 2,
  slowResponseMs: 2_000,
  largeHtmlBytes: 500_000,
  veryLargeHtmlBytes: 1_500_000,
  heavyResourceCount: 20,
  oversizedImageDimension: 2_000,
  imagesMissingDimensionsThreshold: 5,
};

const RETRYABLE_FETCH_CODES = new Set([
  'timeout',
  'dns_failure',
  'decode_failure',
]);

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export class AuditError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
  }
}

export class AuditCancelledError extends Error {
  constructor(partial = {}) {
    super('The audit was cancelled.');
    this.name = 'AuditCancelledError';
    this.code = 'cancelled';
    this.partial = { pages: partial.pages || [], findings: partial.findings || [] };
  }
}

const defaultDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function visitKey(value) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.origin}${pathname}${url.search}`;
}

function addFinding(list, finding) {
  list.push({
    category: finding.category,
    severity: finding.severity,
    code: finding.code,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence ? String(finding.evidence).slice(0, 1_000) : null,
    recommendation: finding.recommendation,
    sourcePage: finding.sourcePage || null,
  });
}

function mergeFindings(raw) {
  const groups = new Map();

  for (const finding of raw) {
    const key = `${finding.category}:${finding.code}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        recommendation: finding.recommendation,
        evidence: [],
        pages: [],
      };
      groups.set(key, group);
    } else if (
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[group.severity]
    ) {
      group.severity = finding.severity;
    }

    if (finding.evidence && group.evidence.length < 6) {
      group.evidence.push(String(finding.evidence).slice(0, 300));
    }
    if (
      finding.sourcePage &&
      !group.pages.includes(finding.sourcePage) &&
      group.pages.length < 8
    ) {
      group.pages.push(finding.sourcePage);
    }
  }

  const merged = [];
  for (const group of groups.values()) {
    const extra =
      group.pages.length > 1
        ? ` Affected pages: ${group.pages.slice(0, 5).join(', ')}${
            group.pages.length > 5
              ? `, and ${group.pages.length - 5} more`
              : ''
          }.`
        : '';
    merged.push({
      category: group.category,
      severity: group.severity,
      code: group.code,
      title: group.title,
      description: `${group.description}${extra}`.slice(0, 2_000),
      evidence: group.evidence.length
        ? group.evidence.join('; ').slice(0, 1_000)
        : null,
      recommendation: group.recommendation,
      sourcePage: group.pages[0] || null,
      affectedPages: group.pages.length,
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  merged.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.code.localeCompare(b.code),
  );

  return merged;
}

export function scoreFindings(findings) {
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const penalties = Object.fromEntries(
    AUDIT_CATEGORIES.map((category) => [category, 0]),
  );
  let total = 0;

  for (const finding of findings) {
    const weight = AUDIT_SCORING.weights[finding.severity] ?? 0;
    if (Object.hasOwn(severityCounts, finding.severity)) {
      severityCounts[finding.severity] += 1;
    }
    if (Object.hasOwn(penalties, finding.category)) {
      penalties[finding.category] += weight;
    }
    total += weight;
  }

  const categoryScores = {};
  for (const category of AUDIT_CATEGORIES) {
    categoryScores[category] = Math.max(0, 100 - penalties[category]);
  }

  return {
    overallScore: Math.max(0, 100 - total),
    categoryScores,
    severityCounts,
    scoringMethod: AUDIT_SCORING.method,
  };
}

export function aggregateFindings(findings) {
  return mergeFindings(findings);
}

function extractResources(html, baseUrl) {
  const resources = [];
  const pattern = /<(script|img|iframe|link)\b[^>]*>/gi;
  let match;

  while ((match = pattern.exec(html || ''))) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    const raw = kind === 'link' ? attr(tag, 'href') : attr(tag, 'src');
    if (!raw) continue;

    if (kind === 'link') {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      if (!/stylesheet|preload|icon|modulepreload/.test(rel)) continue;
    }

    const trimmed = raw.trim();
    let absolute = null;
    let protocol = null;
    try {
      const url = new URL(trimmed, baseUrl);
      absolute = url.href;
      protocol = url.protocol;
    } catch {
      protocol = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase()
        ? `${/^([a-z][a-z0-9+.-]*):/i.exec(trimmed)[1].toLowerCase()}:`
        : null;
    }

    resources.push({ kind, raw: trimmed, url: absolute, protocol });
  }

  return resources;
}

function detectHeadingSkips(headings) {
  const skips = [];
  let previous = null;
  for (const heading of headings) {
    if (previous && heading.level > previous.level + 1) {
      skips.push({ from: previous.level, to: heading.level });
    }
    previous = heading;
  }
  return skips;
}

function pageOptions(limits) {
  return {
    maxBytes: limits.pageBytes,
    maxDecodedBytes: limits.pageDecodedBytes,
    timeoutMs: limits.pageTimeoutMs,
    maxRedirects: limits.pageRedirects,
  };
}

function analyzePage({ requestedUrl, response, limits }) {
  const redirects = Array.isArray(response.redirects) ? response.redirects : [];
  const finalUrl = redirects.length ? redirects[redirects.length - 1] : response.url;
  const html = response.text || '';
  const findings = [];

  const title = html ? extractTitle(html) : null;
  const meta = html ? extractMeta(html) : {};
  const headings = html ? extractHeadings(html) : [];
  const images = html ? extractImages(html, finalUrl) : [];
  const links = html ? extractLinks(html, finalUrl) : [];
  const jsonLd = html ? extractJsonLd(html) : [];
  const controls = html ? extractFormControls(html) : [];
  const canonical = html ? extractCanonical(html, finalUrl) : null;
  const lang = html ? extractLang(html) : null;
  const resources = html ? extractResources(html, finalUrl) : [];
  const stylesheets = html ? extractStylesheetCount(html) : 0;
  const inlineScripts = html ? extractInlineScriptCount(html) : 0;

  const robotsDirective = String(meta.robots || '').toLowerCase();
  const xRobots = String(response.headers?.['x-robots-tag'] || '').toLowerCase();
  const contentOk = response.status >= 200 && response.status < 300;
  const indexable =
    contentOk &&
    !robotsDirective.includes('noindex') &&
    !xRobots.includes('noindex');

  const h1Count = headings.filter((heading) => heading.level === 1).length;
  const imagesMissingAlt = images.filter((image) => !image.hasAlt).length;
  const internalLinks = links.filter((link) => link.internal).length;
  const externalLinks = links.filter((link) => !link.internal).length;
  const htmlBytes = response.decodedBytes ?? response.rawBytes ?? null;

  const page = {
    url: requestedUrl,
    finalUrl,
    statusCode: response.status,
    contentType: response.contentType || '',
    responseTimeMs: response.durationMs ?? null,
    htmlBytes,
    redirectCount: redirects.length,
    indexable,
    title,
    metaDescription: meta.description || null,
    h1Count,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    jsonLdBlocks: jsonLd.length,
  };

  const sourcePage = finalUrl;
  const push = (finding) => addFinding(findings, { ...finding, sourcePage });

  if (response.status >= 400) {
    push({
      category: 'technical_seo',
      severity: 'high',
      code: 'http_error',
      title: 'A page returned an HTTP error',
      description: `The audit received HTTP ${response.status} for this page, so search engines and visitors cannot read its content.`,
      evidence: `HTTP ${response.status} at ${finalUrl}`,
      recommendation:
        'Restore the page with a 200 response, or redirect it to the closest live page if it was intentionally removed.',
    });
  } else if (response.status >= 300) {
    push({
      category: 'technical_seo',
      severity: 'medium',
      code: 'unresolved_redirect',
      title: 'A page returned an unresolved redirect',
      description: `The audit received HTTP ${response.status} without a usable target for this page.`,
      evidence: `HTTP ${response.status} at ${finalUrl}`,
      recommendation:
        'Point the URL directly at the final destination and return a 200 response.',
    });
  }

  if (redirects.length > 0) {
    push({
      category: 'technical_seo',
      severity: 'low',
      code: 'page_redirects',
      title: 'A page was reached through a redirect',
      description:
        'Each extra redirect adds latency and dilutes link signals. This finding lists pages that only loaded after a redirect.',
      evidence: `${redirects.length} redirect(s): ${requestedUrl} → ${finalUrl}`,
      recommendation:
        'Link to the final URL directly and keep at most one intentional redirect (for example HTTP to HTTPS).',
    });
  }

  if (!html) {
    push({
      category: 'technical_seo',
      severity: 'medium',
      code: 'not_html',
      title: 'A page did not return HTML',
      description:
        'The audit inspects HTML documents. This response was not textual HTML, so on-page checks could not run for it.',
      evidence: response.contentType
        ? `Content-Type: ${String(response.contentType).slice(0, 200)}`
        : 'No content type was declared.',
      recommendation:
        'Confirm the URL is meant to be a page. Link to documents from a page rather than from navigation.',
    });
    return { page, findings, links: [], resources: [], jsonLd, headings, controls };
  }

  if (!title) {
    push({
      category: 'on_page_seo',
      severity: 'high',
      code: 'title_missing',
      title: 'A page has no title element',
      description:
        'Search results and browser tabs need a unique, descriptive title. Without one, the page displays the URL or a generic label.',
      evidence: `No <title> element at ${finalUrl}`,
      recommendation:
        'Add a unique <title> of roughly 15–60 characters that names the page and the business.',
    });
  } else if (title.length < 15) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'title_short',
      title: 'A page title is very short',
      description:
        'Short titles usually leave out the page topic or the business name, which weakens search snippets.',
      evidence: `"${title}" (${title.length} characters)`,
      recommendation:
        'Expand the title to 15–60 characters, front-loading the page topic.',
    });
  } else if (title.length > 65) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'title_long',
      title: 'A page title may be truncated in search results',
      description:
        'Long titles are often cut off in search snippets, hiding the distinguishing words.',
      evidence: `"${title}" (${title.length} characters)`,
      recommendation: 'Keep the title under roughly 60–65 characters.',
    });
  }

  const description = meta.description || '';
  if (!description) {
    push({
      category: 'on_page_seo',
      severity: 'medium',
      code: 'meta_description_missing',
      title: 'A page has no meta description',
      description:
        'A meta description is the default snippet text in search results. Without one, search engines invent a snippet.',
      evidence: `No meta description at ${finalUrl}`,
      recommendation:
        'Add a unique meta description of roughly 70–160 characters summarising the page.',
    });
  } else if (description.length < 50) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'meta_description_short',
      title: 'A meta description is very short',
      description:
        'Short descriptions rarely explain the offer well enough to earn a click.',
      evidence: `"${description.slice(0, 200)}" (${description.length} characters)`,
      recommendation: 'Aim for 70–160 characters per description.',
    });
  } else if (description.length > 170) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'meta_description_long',
      title: 'A meta description may be truncated',
      description: 'Long descriptions are cut off in search results.',
      evidence: `"${description.slice(0, 200)}…" (${description.length} characters)`,
      recommendation: 'Keep descriptions under roughly 160 characters.',
    });
  }

  if (h1Count === 0) {
    push({
      category: 'on_page_seo',
      severity: 'high',
      code: 'h1_missing',
      title: 'A page has no H1 heading',
      description:
        'The H1 states the page topic. Missing it weakens both search relevance and screen-reader navigation.',
      evidence: `No <h1> element at ${finalUrl}`,
      recommendation:
        'Add one H1 that matches the page intent, and use H2/H3 for sections.',
    });
  } else if (h1Count > 1) {
    push({
      category: 'on_page_seo',
      severity: 'medium',
      code: 'h1_multiple',
      title: 'A page has more than one H1 heading',
      description:
        'Several H1s make the primary topic ambiguous for search engines and assistive technology.',
      evidence: `${h1Count} <h1> elements at ${finalUrl}`,
      recommendation: 'Keep a single H1 and move the rest to H2 level.',
    });
  }

  const skips = detectHeadingSkips(headings);
  if (skips.length > 0) {
    push({
      category: 'accessibility',
      severity: 'low',
      code: 'heading_hierarchy',
      title: 'Heading levels are skipped',
      description:
        'Screen readers follow heading order. Jumping from one level to a deeper one (for example H2 to H4) breaks that outline.',
      evidence: `${skips.length} skipped level(s); first: H${skips[0].from} followed by H${skips[0].to}`,
      recommendation: 'Use headings sequentially (H1 → H2 → H3).',
    });
  }

  if (imagesMissingAlt > 0) {
    push({
      category: 'accessibility',
      severity: 'medium',
      code: 'image_alt_missing',
      title: 'Images are missing alt text',
      description:
        'Alt text describes images for screen readers and shows when an image fails to load.',
      evidence: `${imagesMissingAlt} of ${images.length} image(s) do not declare alt text at ${finalUrl}`,
      recommendation:
        'Add descriptive alt text, or an empty alt="" for purely decorative images.',
    });
  }

  if (controls.length > 0) {
    const unlabelled = controls.filter((control) => !control.labelled);
    if (unlabelled.length > 0) {
      push({
        category: 'accessibility',
        severity: 'medium',
        code: 'form_label_missing',
        title: 'Form controls have no accessible label',
        description:
          'Every input needs a label that assistive technology can announce. A placeholder is not a substitute.',
        evidence: `${unlabelled.length} of ${controls.length} control(s) at ${finalUrl} lack a label, aria-label or aria-labelledby.`,
        recommendation:
          'Associate each control with a <label for="…">, or add aria-label when a visible label is not possible.',
      });
    }
  }

  if (!lang) {
    push({
      category: 'accessibility',
      severity: 'low',
      code: 'lang_missing',
      title: 'The page does not declare a language',
      description:
        'A missing lang attribute makes screen readers guess the pronunciation language.',
      evidence: `No lang attribute on <html> at ${finalUrl}`,
      recommendation: 'Set a language, for example <html lang="en-GB">.',
    });
  }

  if (!meta.viewport) {
    push({
      category: 'accessibility',
      severity: 'low',
      code: 'viewport_missing',
      title: 'The page does not declare a viewport',
      description:
        'Without a viewport meta tag, mobile browsers scale the desktop layout, making text hard to read.',
      evidence: `No viewport meta tag at ${finalUrl}`,
      recommendation:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    });
  }

  if (!canonical) {
    push({
      category: 'technical_seo',
      severity: 'low',
      code: 'canonical_missing',
      title: 'A page has no canonical URL',
      description:
        'A canonical tag tells search engines which address is the preferred version when several URLs show the same content.',
      evidence: `No canonical link at ${finalUrl}`,
      recommendation: `Add <link rel="canonical" href="${finalUrl}"> (or the preferred URL).`,
    });
  } else {
    let canonicalUrl = null;
    try {
      canonicalUrl = new URL(canonical);
    } catch {
      canonicalUrl = null;
    }
    if (!canonicalUrl || (canonicalUrl.protocol !== 'http:' && canonicalUrl.protocol !== 'https:')) {
      push({
        category: 'technical_seo',
        severity: 'medium',
        code: 'canonical_invalid',
        title: 'A canonical URL is not a valid web address',
        description:
          'Search engines ignore canonical tags that do not resolve to an http or https URL.',
        evidence: String(canonical).slice(0, 300),
        recommendation: 'Use one absolute http or https URL in the canonical tag.',
      });
    } else if (canonicalUrl.origin !== new URL(finalUrl).origin) {
      push({
        category: 'technical_seo',
        severity: 'medium',
        code: 'canonical_cross_origin',
        title: 'A canonical URL points at another site',
        description:
          'A cross-origin canonical asks search engines to credit a different domain with this page, which may remove the page from results.',
        evidence: `${finalUrl} declares canonical ${canonicalUrl.href}`,
        recommendation:
          'Point the canonical at the preferred URL on this same site.',
      });
    }
  }

  if (!indexable) {
    push({
      category: 'technical_seo',
      severity: 'medium',
      code: 'page_noindex',
      title: 'A page asks search engines not to index it',
      description:
        'A noindex directive or X-Robots-Tag removes the page from search results.',
      evidence: robotsDirective.includes('noindex')
        ? `Meta robots: ${robotsDirective.slice(0, 120)}`
        : `X-Robots-Tag: ${xRobots.slice(0, 120)}`,
      recommendation:
        'Remove the noindex directive if the page should appear in search, and keep it only for genuinely private pages.',
    });
  }

  if (internalLinks === 0) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'internal_links_missing',
      title: 'A page has no internal links',
      description:
        'Internal links spread relevance and help visitors continue their journey. A page with none is usually a dead end.',
      evidence: `0 internal links among ${links.length} link(s) at ${finalUrl}`,
      recommendation:
        'Link to related services, case studies or contact pages using descriptive text.',
    });
  }

  const pathname = new URL(finalUrl).pathname;
  if (/[A-Z]/.test(pathname)) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'url_uppercase',
      title: 'A URL contains uppercase characters',
      description:
        'Uppercase characters create duplicate variants because paths are case-sensitive.',
      evidence: pathname.slice(0, 200),
      recommendation: 'Use lowercase, hyphen-separated slugs.',
    });
  }

  if (finalUrl.length > 120) {
    push({
      category: 'on_page_seo',
      severity: 'low',
      code: 'url_long',
      title: 'A URL is unusually long',
      description:
        'Very long URLs are harder to share and often come from unmanaged filters or duplicates.',
      evidence: `${finalUrl.length} characters: ${finalUrl.slice(0, 180)}`,
      recommendation: 'Shorten the path and keep necessary query parameters only.',
    });
  }

  if (jsonLd.some((block) => block.error)) {
    const broken = jsonLd.filter((block) => block.error);
    push({
      category: 'structured_data',
      severity: 'medium',
      code: 'jsonld_invalid',
      title: 'Structured data could not be parsed',
      description:
        'A JSON-LD block contains invalid JSON, so search engines cannot read the structured data on this page.',
      evidence: `${broken.length} block(s); ${broken[0].error.slice(0, 200)}`,
      recommendation:
        'Correct the JSON syntax and validate it with a structured-data testing tool.',
    });
  }

  const responseTime = response.durationMs;
  if (typeof responseTime === 'number' && responseTime > limits.slowResponseMs) {
    push({
      category: 'performance',
      severity: 'medium',
      code: 'slow_server_response',
      title: 'The server took a long time to return the HTML',
      description:
        'This is the time from the audit request to the complete HTML response for one page — a server signal, not a Core Web Vitals score.',
      evidence: `${responseTime} ms for ${finalUrl}`,
      recommendation:
        'Check server rendering, database queries and caching for this route before optimising front-end assets.',
    });
  }

  if (typeof htmlBytes === 'number' && htmlBytes > limits.veryLargeHtmlBytes) {
    push({
      category: 'performance',
      severity: 'high',
      code: 'large_html_document',
      title: 'The HTML document is very large',
      description:
        'A large HTML document delays rendering and uses mobile data before any asset loads. The figure is the decoded HTML size, not the total page weight.',
      evidence: `${htmlBytes} bytes of HTML at ${finalUrl}`,
      recommendation:
        'Move repeated markup into components, paginate long lists and remove unused inline data.',
    });
  } else if (typeof htmlBytes === 'number' && htmlBytes > limits.largeHtmlBytes) {
    push({
      category: 'performance',
      severity: 'medium',
      code: 'large_html_document',
      title: 'The HTML document is large',
      description:
        'A large HTML document slows first render. The figure is the decoded HTML size, not the total page weight.',
      evidence: `${htmlBytes} bytes of HTML at ${finalUrl}`,
      recommendation: 'Trim repeated markup and inline data from the document.',
    });
  }

  if (
    response.compressed === false &&
    typeof htmlBytes === 'number' &&
    htmlBytes > 100_000
  ) {
    push({
      category: 'performance',
      severity: 'low',
      code: 'no_compression',
      title: 'The HTML response was not compressed',
      description:
        'The audit offered gzip, deflate and brotli, but the server returned this HTML without a content encoding.',
      evidence: `${htmlBytes} bytes delivered without compression at ${finalUrl}`,
      recommendation:
        'Enable gzip or brotli compression for HTML at the server or CDN.',
    });
  }

  if (stylesheets + inlineScripts > limits.heavyResourceCount) {
    push({
      category: 'performance',
      severity: 'low',
      code: 'heavy_document_resources',
      title: 'The document references many stylesheets and scripts',
      description:
        'The count covers stylesheet links and script tags in the HTML only. It is a markup heuristic, not a browser request total.',
      evidence: `${stylesheets} stylesheet link(s) and ${inlineScripts} script tag(s) at ${finalUrl}`,
      recommendation:
        'Combine stylesheets and defer non-critical scripts; measure real request counts in a browser before changing architecture.',
    });
  }

  if (response.truncated) {
    push({
      category: 'performance',
      severity: 'low',
      code: 'response_truncated',
      title: 'The HTML response was truncated at the audit limit',
      description:
        'The document exceeded the audit response-size cap, so later markup was not examined.',
      evidence: `Response exceeded ${limits.pageBytes} bytes at ${finalUrl}`,
      recommendation:
        'Reduce the document size, then re-run the audit for a complete review.',
    });
  }

  const oversized = images.find(
    (image) =>
      image.width > limits.oversizedImageDimension ||
      image.height > limits.oversizedImageDimension,
  );
  if (oversized) {
    push({
      category: 'performance',
      severity: 'low',
      code: 'oversized_image_dimensions',
      title: 'An image declares very large dimensions',
      description:
        'Declared width and height attributes show the image will be scaled down in the layout, which usually means an oversized source file.',
      evidence: `${String(oversized.absolute || oversized.src || '').slice(0, 200)} declares ${oversized.width || '?'}×${oversized.height || '?'}px`,
      recommendation:
        'Serve a source image close to its display size and keep width and height attributes for layout stability.',
    });
  }

  const imagesWithoutDimensions = images.filter(
    (image) => !image.width || !image.height,
  ).length;
  if (imagesWithoutDimensions > limits.imagesMissingDimensionsThreshold) {
    push({
      category: 'performance',
      severity: 'low',
      code: 'image_dimensions_missing',
      title: 'Many images declare no width or height',
      description:
        'Without intrinsic dimensions the browser cannot reserve space, which shifts content while the page loads.',
      evidence: `${imagesWithoutDimensions} of ${images.length} image(s) at ${finalUrl} lack width or height attributes.`,
      recommendation:
        'Set width and height attributes (or an equivalent CSS aspect ratio) on images.',
    });
  }

  const finalIsHttps = finalUrl.startsWith('https:');
  if (finalIsHttps) {
    const mixed = resources.filter(
      (resource) => resource.protocol === 'http:',
    );
    if (mixed.length > 0) {
      const active = mixed.some((resource) =>
        ['script', 'iframe', 'link'].includes(resource.kind),
      );
      push({
        category: 'security',
        severity: active ? 'high' : 'medium',
        code: 'mixed_content',
        title: 'An HTTPS page loads resources over HTTP',
        description:
          'Browsers block or warn about insecure resources on HTTPS pages, which can break styles, scripts and images.',
        evidence: mixed
          .slice(0, 3)
          .map((resource) => `${resource.kind}: ${String(resource.url).slice(0, 160)}`)
          .join('; '),
        recommendation:
          'Serve every script, stylesheet, font and image from an HTTPS URL.',
      });
    }

    const unsafe = resources.filter(
      (resource) =>
        (resource.kind === 'script' || resource.kind === 'iframe') &&
        (resource.protocol === 'data:' ||
          /^javascript:/i.test(resource.raw || '')),
    );
    if (unsafe.length > 0) {
      push({
        category: 'security',
        severity: 'high',
        code: 'unsafe_resource',
        title: 'A page loads a script or frame from an unsafe URL',
        description:
          'Inline data scripts and javascript: URLs bypass normal script loading and are difficult to audit or control with a content security policy.',
        evidence: unsafe
          .slice(0, 3)
          .map((resource) => `${resource.kind}: ${resource.raw.slice(0, 160)}`)
          .join('; '),
        recommendation:
          'Host scripts as normal HTTPS files and remove javascript: URLs from embeds.',
      });
    }
  }

  return { page, findings, links, resources, jsonLd, headings, controls };
}

export async function auditWebsite({
  audit,
  fetchPage = safeFetch,
  delay = defaultDelay,
  onLog = () => {},
  isCancelled = () => false,
  limits: overrides = {},
} = {}) {
  const limits = { ...AUDIT_LIMITS, ...overrides };
  const findings = [];
  const pages = [];
  const log = async (level, message, metadata) => {
    try {
      await onLog(level, message, metadata);
    } catch {
      // Logging must never abort the audit.
    }
  };

  let start;
  try {
    start = new URL(audit?.normalizedUrl);
  } catch {
    throw new AuditError('invalid_url', 'The audit URL could not be parsed.');
  }
  if (start.protocol !== 'http:' && start.protocol !== 'https:') {
    throw new AuditError(
      'invalid_url',
      'Only http and https websites can be audited.',
    );
  }

  const maxPages = Math.max(
    1,
    Math.min(Number(audit?.maxPages) || 5, AUDIT_MAX_PAGES_LIMIT),
  );

  const cancelled = () =>
    new AuditCancelledError({ pages, findings });

  if (await isCancelled()) throw cancelled();

  let robotsRules = [];
  let robotsFound = false;
  let sitemapUrl = null;

  try {
    const robotsResponse = await fetchPage(`${start.origin}/robots.txt`, {
      maxBytes: 64_000,
      maxDecodedBytes: 128_000,
      timeoutMs: 8_000,
      maxRedirects: 2,
    });

    if (
      robotsResponse.status >= 200 &&
      robotsResponse.status < 300 &&
      robotsResponse.text
    ) {
      robotsFound = true;
      const parsed = parseRobots(robotsResponse.text);
      robotsRules = rulesForAgent(parsed);
      const declared = parsed.sitemaps.find((value) => {
        try {
          return new URL(value, start.origin).origin === start.origin;
        } catch {
          return false;
        }
      });
      if (declared) sitemapUrl = new URL(declared, start.origin).href;
      await log(
        'info',
        `robots.txt loaded with ${robotsRules.length} rule(s) for this crawler.`,
      );
    } else if (
      robotsResponse.status === 401 ||
      robotsResponse.status === 403
    ) {
      robotsFound = true;
      robotsRules = [{ type: 'disallow', path: '/' }];
      await log(
        'warn',
        'robots.txt denied access; the crawler will treat the site as disallowed.',
      );
    } else {
      await log(
        'info',
        `No robots.txt was found (HTTP ${robotsResponse.status}).`,
      );
    }
  } catch (error) {
    if (RETRYABLE_FETCH_CODES.has(error?.code)) throw error;
    await log(
      'warn',
      `robots.txt could not be read (${error?.code || 'network_error'}); continuing without it.`,
    );
  }

  if (!isPathAllowed(robotsRules, start.pathname || '/')) {
    throw new AuditError(
      'blocked_by_robots',
      "The site's robots.txt disallows this crawler from the requested URL.",
    );
  }

  if (await isCancelled()) throw cancelled();

  const effectiveSitemap = sitemapUrl || `${start.origin}/sitemap.xml`;
  let sitemapFound = false;
  try {
    const sitemapResponse = await fetchPage(effectiveSitemap, {
      maxBytes: 200_000,
      maxDecodedBytes: 400_000,
      timeoutMs: 8_000,
      maxRedirects: 2,
    });
    if (
      sitemapResponse.status >= 200 &&
      sitemapResponse.status < 300 &&
      sitemapResponse.text
    ) {
      sitemapFound = /<(urlset|sitemapindex)\b/i.test(sitemapResponse.text);
      await log(
        sitemapFound ? 'info' : 'warn',
        sitemapFound
          ? `Sitemap found at ${effectiveSitemap}.`
          : `${effectiveSitemap} responded but is not a sitemap.`,
      );
    } else {
      await log(
        'info',
        `No sitemap was found at ${effectiveSitemap} (HTTP ${sitemapResponse.status}).`,
      );
    }
  } catch (error) {
    if (RETRYABLE_FETCH_CODES.has(error?.code)) throw error;
    await log(
      'warn',
      `Sitemap check skipped (${error?.code || 'network_error'}).`,
    );
  }

  const queue = [start.href];
  const queued = new Set([visitKey(start.href)]);
  const visited = new Set();
  const discoveredLinks = [];
  let entryHeaders = null;

  while (queue.length > 0 && pages.length < maxPages) {
    if (await isCancelled()) throw cancelled();

    const requestedUrl = queue.shift();
    const key = visitKey(requestedUrl);
    if (visited.has(key)) continue;
    visited.add(key);

    let target;
    try {
      target = new URL(requestedUrl);
    } catch {
      continue;
    }

    if (!isPathAllowed(robotsRules, target.pathname || '/')) {
      const rule = matchingRule(robotsRules, target.pathname || '/');
      await log(
        'info',
        `Skipped ${requestedUrl}: robots.txt disallows ${rule?.path || '/'}.`,
      );
      continue;
    }

    if (pages.length > 0 && limits.requestDelayMs > 0) {
      await delay(limits.requestDelayMs);
      if (await isCancelled()) throw cancelled();
    }

    let response;
    try {
      response = await fetchPage(requestedUrl, pageOptions(limits));
    } catch (error) {
      if (pages.length === 0 && RETRYABLE_FETCH_CODES.has(error?.code)) {
        throw error;
      }
      if (pages.length === 0) {
        throw new AuditError(
          'entry_unreachable',
          `The starting page could not be fetched (${error?.code || 'network_error'}).`,
        );
      }
      await log(
        'warn',
        `Failed to fetch ${requestedUrl} (${error?.code || 'network_error'}).`,
      );
      addFinding(findings, {
        category: 'technical_seo',
        severity: 'medium',
        code: 'page_unreachable',
        title: 'A linked page could not be fetched',
        description: `The crawler could not fetch ${requestedUrl}, so its content was not audited.`,
        evidence: String(error?.message || error?.code || 'network_error').slice(
          0,
          300,
        ),
        recommendation:
          'Check the page responds for normal visitors and remove links to pages that no longer exist.',
        sourcePage: requestedUrl,
      });
      continue;
    }

    if (!entryHeaders && response.status >= 200 && response.status < 400) {
      entryHeaders = response.headers || {};
    }

    const analyzed = analyzePage({ requestedUrl, response, limits });
    pages.push(analyzed.page);
    findings.push(...analyzed.findings);

    for (const link of analyzed.links) {
      if (!link.internal || !link.absolute) continue;
      discoveredLinks.push({
        url: link.absolute,
        sourcePage: analyzed.page.finalUrl || requestedUrl,
      });

      let linkUrl;
      try {
        linkUrl = new URL(link.absolute);
      } catch {
        continue;
      }
      if (linkUrl.protocol !== 'http:' && linkUrl.protocol !== 'https:') {
        continue;
      }
      const linkKey = visitKey(linkUrl.href);
      if (
        !visited.has(linkKey) &&
        !queued.has(linkKey) &&
        queue.length < maxPages * 3
      ) {
        queued.add(linkKey);
        queue.push(linkUrl.href);
      }
    }

    await log(
      'info',
      `Scanned ${analyzed.page.finalUrl || requestedUrl} (HTTP ${response.status}).`,
      { pagesScanned: pages.length },
    );
  }

  if (pages.length === 0) {
    throw new AuditError(
      'no_pages',
      'No pages could be scanned. The start URL did not return a usable page.',
    );
  }

  const entryPage = pages[0];
  const entryUrl = entryPage.finalUrl || start.href;
  const entryIsHttps = String(entryUrl).startsWith('https:');
  const headers = entryHeaders || {};
  const header = (name) => String(headers[name] || '');

  if (!entryIsHttps) {
    addFinding(findings, {
      category: 'security',
      severity: 'high',
      code: 'https_missing',
      title: 'The site is served over plain HTTP',
      description:
        'Without HTTPS, traffic can be read or modified in transit and browsers mark the site as not secure.',
      evidence: entryUrl,
      recommendation:
        'Serve the site over HTTPS and redirect HTTP requests to the HTTPS URL.',
      sourcePage: entryUrl,
    });
  } else {
    if (!header('strict-transport-security')) {
      addFinding(findings, {
        category: 'security',
        severity: 'medium',
        code: 'hsts_missing',
        title: 'Strict-Transport-Security is not set',
        description:
          'HSTS tells browsers to use HTTPS automatically, protecting repeat visitors from downgrade attempts.',
        evidence: 'No Strict-Transport-Security header on the entry page.',
        recommendation:
          'Send Strict-Transport-Security with a long max-age once HTTPS works on every subdomain.',
        sourcePage: entryUrl,
      });
    }
  }

  if (!header('content-security-policy')) {
    addFinding(findings, {
      category: 'security',
      severity: 'medium',
      code: 'csp_missing',
      title: 'No Content-Security-Policy is set',
      description:
        'A content security policy limits which scripts and resources can run, reducing the impact of injected code.',
      evidence: 'No Content-Security-Policy header on the entry page.',
      recommendation:
        'Add a restrictive Content-Security-Policy and extend it only for resources the site actually needs.',
      sourcePage: entryUrl,
    });
  }

  if (!header('x-content-type-options')) {
    addFinding(findings, {
      category: 'security',
      severity: 'low',
      code: 'nosniff_missing',
      title: 'X-Content-Type-Options is not set',
      description:
        'Without nosniff, some browsers guess content types and may execute files as scripts.',
      evidence: 'No X-Content-Type-Options header on the entry page.',
      recommendation: 'Send X-Content-Type-Options: nosniff.',
      sourcePage: entryUrl,
    });
  }

  const csp = header('content-security-policy').toLowerCase();
  if (!header('x-frame-options') && !csp.includes('frame-ancestors')) {
    addFinding(findings, {
      category: 'security',
      severity: 'medium',
      code: 'frame_protection_missing',
      title: 'Clickjacking protection is not configured',
      description:
        'Neither X-Frame-Options nor a CSP frame-ancestors directive was returned, so other sites may embed this page in a frame.',
      evidence: 'No X-Frame-Options header and no frame-ancestors directive.',
      recommendation:
        "Send X-Frame-Options: SAMEORIGIN or a CSP frame-ancestors directive.",
      sourcePage: entryUrl,
    });
  }

  if (!header('referrer-policy')) {
    addFinding(findings, {
      category: 'security',
      severity: 'low',
      code: 'referrer_policy_missing',
      title: 'Referrer-Policy is not set',
      description:
        'Without a referrer policy, full URLs can leak to third-party sites through the Referer header.',
      evidence: 'No Referrer-Policy header on the entry page.',
      recommendation: 'Send Referrer-Policy: strict-origin-when-cross-origin.',
      sourcePage: entryUrl,
    });
  }

  if (!robotsFound) {
    addFinding(findings, {
      category: 'technical_seo',
      severity: 'info',
      code: 'robots_txt_missing',
      title: 'No robots.txt was found',
      description:
        'A robots.txt file lets crawlers know which paths to avoid and can advertise the sitemap.',
      evidence: `No usable robots.txt at ${start.origin}/robots.txt`,
      recommendation:
        'Add a robots.txt that points to the sitemap and disallows only paths that should not be crawled.',
      sourcePage: `${start.origin}/robots.txt`,
    });
  }

  if (!sitemapFound) {
    addFinding(findings, {
      category: 'technical_seo',
      severity: 'low',
      code: 'sitemap_missing',
      title: 'No XML sitemap was found',
      description:
        'A sitemap helps search engines discover pages, especially ones that are not linked prominently.',
      evidence: `No valid sitemap at ${effectiveSitemap}`,
      recommendation:
        'Publish an XML sitemap and reference it from robots.txt.',
      sourcePage: effectiveSitemap,
    });
  }

  const titles = new Map();
  const descriptions = new Map();
  for (const page of pages) {
    if (page.title) {
      if (!titles.has(page.title)) titles.set(page.title, []);
      titles.get(page.title).push(page.url);
    }
    if (page.metaDescription) {
      if (!descriptions.has(page.metaDescription)) {
        descriptions.set(page.metaDescription, []);
      }
      descriptions.get(page.metaDescription).push(page.url);
    }
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      addFinding(findings, {
        category: 'on_page_seo',
        severity: 'medium',
        code: 'duplicate_titles',
        title: 'The same title is used on several pages',
        description:
          'Duplicate titles make it hard for search engines and visitors to tell the pages apart.',
        evidence: `"${title.slice(0, 160)}" appears on ${urls.length} pages: ${urls.slice(0, 4).join(', ')}`,
        recommendation:
          'Give each page a unique title that names its specific topic.',
        sourcePage: urls[0],
      });
    }
  }

  for (const [description, urls] of descriptions) {
    if (urls.length > 1) {
      addFinding(findings, {
        category: 'on_page_seo',
        severity: 'low',
        code: 'duplicate_meta_descriptions',
        title: 'The same meta description is used on several pages',
        description:
          'Duplicate descriptions waste the chance to explain each page in search results.',
        evidence: `The description "${description.slice(0, 120)}…" appears on ${urls.length} pages.`,
        recommendation: 'Write a distinct description for each page.',
        sourcePage: urls[0],
      });
    }
  }

  const jsonLdTotal = pages.reduce(
    (total, page) => total + page.jsonLdBlocks,
    0,
  );
  if (jsonLdTotal === 0) {
    addFinding(findings, {
      category: 'structured_data',
      severity: 'low',
      code: 'structured_data_missing',
      title: 'No JSON-LD structured data was found',
      description:
        'Structured data helps search engines understand the organisation, services and content on the site.',
      evidence: 'No application/ld+json script blocks on the sampled pages.',
      recommendation:
        'Add valid JSON-LD for the most relevant types (for example Organization and LocalBusiness) and test it before publishing.',
      sourcePage: entryUrl,
    });
  } else {
    addFinding(findings, {
      category: 'structured_data',
      severity: 'info',
      code: 'structured_data_detected',
      title: 'JSON-LD structured data is present',
      description:
        'JSON-LD script blocks were detected. The audit validates JSON syntax only; it does not confirm rich-result eligibility.',
      evidence: `${jsonLdTotal} JSON-LD block(s) across ${pages.length} page(s).`,
      recommendation:
        'Validate each block with a structured-data testing tool and keep types accurate.',
      sourcePage: entryUrl,
    });
  }

  const unvisited = [];
  const seenTargets = new Set();
  for (const link of discoveredLinks) {
    let url;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    if (url.origin !== start.origin) continue;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const key = visitKey(url.href);
    if (visited.has(key) || seenTargets.has(key)) continue;
    if (!isPathAllowed(robotsRules, url.pathname || '/')) continue;
    seenTargets.add(key);
    unvisited.push({ url: url.href, sourcePage: link.sourcePage });
  }

  const broken = [];
  for (const target of unvisited.slice(0, limits.linkCheckBudget)) {
    if (await isCancelled()) throw cancelled();
    try {
      const response = await fetchPage(target.url, {
        maxBytes: limits.linkCheckBytes,
        maxDecodedBytes: limits.linkCheckBytes,
        timeoutMs: limits.linkCheckTimeoutMs,
        maxRedirects: limits.linkCheckRedirects,
      });
      if (response.status >= 400) {
        broken.push({
          url: target.url,
          status: response.status,
          sourcePage: target.sourcePage,
        });
      }
    } catch (error) {
      if (RETRYABLE_FETCH_CODES.has(error?.code)) {
        broken.push({
          url: target.url,
          status: null,
          error: error.code,
          sourcePage: target.sourcePage,
        });
      }
    }
    if (limits.requestDelayMs > 0) {
      await delay(Math.floor(limits.requestDelayMs / 2));
    }
  }

  if (broken.length > 0) {
    addFinding(findings, {
      category: 'technical_seo',
      severity: 'high',
      code: 'broken_internal_links',
      title: 'Internal links point at broken pages',
      description:
        'These links returned an error or could not be reached. Visitors and crawlers hitting them lose a path through the site.',
      evidence: broken
        .slice(0, 8)
        .map((item) =>
          item.status
            ? `${item.url} (HTTP ${item.status}, linked from ${item.sourcePage})`
            : `${item.url} (${item.error}, linked from ${item.sourcePage})`,
        )
        .join('; ')
        .slice(0, 1_000),
      recommendation:
        'Repair the links or redirect them to the correct live page.',
      sourcePage: broken[0].sourcePage,
    });
  }

  addFinding(findings, {
    category: 'performance',
    severity: 'info',
    code: 'core_web_vitals_not_measured',
    title: 'Core Web Vitals and Lighthouse were not measured',
    description:
      'This audit inspects server responses, delivered HTML and a bounded sample of pages. It does not run Lighthouse, PageSpeed Insights or field Core Web Vitals collection.',
    evidence:
      'Performance findings use response time, HTML payload size, compression and document markup signals from the actual responses.',
    recommendation:
      'Use Lighthouse or PageSpeed Insights separately for lab or field Core Web Vitals; treat those figures as a different, browser-measured source.',
    sourcePage: entryUrl,
  });

  const merged = mergeFindings(findings);
  const scoring = scoreFindings(merged);

  return {
    startUrl: start.href,
    finalUrl: entryUrl,
    pages,
    findings: merged,
    robots: { found: robotsFound, ruleCount: robotsRules.length },
    sitemap: { found: sitemapFound, url: effectiveSitemap },
    maxPages,
    ...scoring,
  };
}
