// Small, dependency-free HTML inspection helpers. These are deliberately
// heuristic: findings produced from them are labelled as heuristics, never as
// Lighthouse or browser-measured results.

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

export function decodeEntities(value) {
  return String(value || '').replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (match, entity) => {
      const key = entity.toLowerCase();
      if (key.startsWith('#x')) {
        const code = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (key.startsWith('#')) {
        const code = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[key] ?? match;
    },
  );
}

export function attr(tag, name) {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = pattern.exec(tag);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

export function hasAttr(tag, name) {
  return new RegExp(`\\b${name}(?:\\s|=|>|$)`, 'i').test(tag);
}

export function stripTags(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function extractText(html, max = 4000) {
  const text = decodeEntities(stripTags(html))
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

export function extractTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  if (!match) return null;
  return decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 300) || null;
}

export function extractLang(html) {
  const match = /<html\b[^>]*>/i.exec(html || '');
  return match ? attr(match[0], 'lang') : null;
}

function parseMetaTags(html) {
  const tags = [];
  const pattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    tags.push(match[0]);
  }
  return tags;
}

export function extractMeta(html) {
  const result = {
    description: null,
    robots: null,
    viewport: null,
    ogTitle: null,
    ogDescription: null,
    charset: null,
  };

  for (const tag of parseMetaTags(html)) {
    const name = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (name === 'description' && result.description === null) {
      result.description = content;
    } else if (name === 'robots' && result.robots === null) {
      result.robots = content;
    } else if (name === 'viewport' && result.viewport === null) {
      result.viewport = content;
    } else if (name === 'og:title' && result.ogTitle === null) {
      result.ogTitle = content;
    } else if (name === 'og:description' && result.ogDescription === null) {
      result.ogDescription = content;
    } else if (name === 'charset' && result.charset === null) {
      result.charset = content;
    }
  }

  return result;
}

export function extractCanonical(html, baseUrl) {
  const pattern = /<link\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const rel = (attr(match[0], 'rel') || '').toLowerCase();
    if (rel.split(/\s+/).includes('canonical')) {
      const href = attr(match[0], 'href');
      if (!href) return null;
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return href;
      }
    }
  }
  return null;
}

export function extractHeadings(html) {
  const headings = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const text = decodeEntities(stripTags(match[2])).replace(/\s+/g, ' ').trim();
    headings.push({ level: Number(match[1]), text: text.slice(0, 200) });
  }
  return headings;
}

export function extractImages(html, baseUrl) {
  const images = [];
  const pattern = /<img\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const tag = match[0];
    const src = attr(tag, 'src');
    const alt = attr(tag, 'alt');
    const width = attr(tag, 'width');
    const height = attr(tag, 'height');
    const loading = attr(tag, 'loading');
    let absolute = null;
    if (src) {
      try {
        absolute = new URL(src, baseUrl).href;
      } catch {
        absolute = null;
      }
    }
    images.push({
      src,
      absolute,
      hasAlt: hasAttr(tag, 'alt'),
      alt,
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
      loading,
    });
  }
  return images;
}

export function extractLinks(html, baseUrl) {
  const links = [];
  let origin = null;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    origin = null;
  }

  const pattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const href = attr(match[0], 'href');
    if (!href) continue;
    const trimmed = href.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      /^(mailto:|tel:|javascript:|data:)/i.test(trimmed)
    ) {
      continue;
    }

    let absolute = null;
    try {
      absolute = new URL(trimmed, baseUrl);
    } catch {
      absolute = null;
    }

    const internal = Boolean(
      absolute && origin && absolute.origin === origin,
    );
    links.push({
      href: trimmed,
      absolute: absolute ? absolute.href : null,
      internal,
      text: decodeEntities(stripTags(match[1])).replace(/\s+/g, ' ').trim().slice(0, 120),
      rel: attr(match[0], 'rel'),
    });
  }
  return links;
}

export function extractJsonLd(html) {
  const blocks = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed = null;
    let error = null;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      error = parseError.message.slice(0, 200);
    }
    blocks.push({ raw: raw.slice(0, 5000), parsed, error });
  }
  return blocks;
}

export function extractFormControls(html) {
  const labelsFor = new Set();
  const labelPattern = /<label\b[^>]*>/gi;
  let labelMatch;
  while ((labelMatch = labelPattern.exec(html || ''))) {
    const target = attr(labelMatch[0], 'for');
    if (target) labelsFor.add(target.toLowerCase());
  }

  const controls = [];
  const pattern = /<(input|select|textarea)\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html || ''))) {
    const tag = match[0];
    const type = (attr(tag, 'type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;

    const id = attr(tag, 'id');
    const named =
      Boolean(attr(tag, 'aria-label')) ||
      Boolean(attr(tag, 'aria-labelledby')) ||
      Boolean(attr(tag, 'title')) ||
      (id ? labelsFor.has(id.toLowerCase()) : false);

    controls.push({
      tag: match[1].toLowerCase(),
      type,
      id,
      name: attr(tag, 'name'),
      labelled: named,
    });
  }
  return controls;
}

export function extractInlineScriptCount(html) {
  const matches = String(html || '').match(/<script\b/gi);
  return matches ? matches.length : 0;
}

export function extractStylesheetCount(html) {
  const matches = String(html || '').match(
    /<link\b[^>]*rel\s*=\s*["'][^"']*stylesheet/gi,
  );
  return matches ? matches.length : 0;
}
