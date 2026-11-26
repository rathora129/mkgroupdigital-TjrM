// Minimal robots.txt parser. It follows the common convention closely enough
// for an audit crawler: per-agent groups, longest-match allow/disallow rules,
// wildcards, `$` anchors and a default of "allowed" when nothing matches.

export const AUDIT_ROBOTS_USER_AGENT = 'mkworkforceauditbot';

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let inAgentBlock = false;

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      inAgentBlock = false;
      continue;
    }

    if (field === 'user-agent') {
      if (!inAgentBlock || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
        inAgentBlock = true;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && current) {
      inAgentBlock = false;
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ type: field, path: value || '/' });
    }
  }

  return { groups, sitemaps: [...new Set(sitemaps)] };
}

function matchesAgent(agentValue, token) {
  const bare = agentValue.replace(/\/.*$/, '').trim();
  if (!bare) return false;
  if (bare === '*') return false;
  return token === bare || token.startsWith(bare);
}

export function rulesForAgent(parsed, agent = AUDIT_ROBOTS_USER_AGENT) {
  const token = String(agent || '').toLowerCase();
  const specific = parsed.groups.filter((group) =>
    group.agents.some((value) => matchesAgent(value, token)),
  );
  if (specific.length > 0) return specific.flatMap((group) => group.rules);

  const wildcard = parsed.groups.filter((group) =>
    group.agents.includes('*'),
  );
  return wildcard.flatMap((group) => group.rules);
}

function ruleMatches(pattern, pathname) {
  if (pattern === '/') return true;

  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  try {
    return new RegExp(`^${escaped}${anchored ? '$' : ''}`).test(pathname);
  } catch {
    return false;
  }
}

export function matchingRule(rules, pathname) {
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, pathname)) continue;
    const length = rule.path.length;
    if (
      !best ||
      length > best.length ||
      (length === best.length && rule.type === 'allow')
    ) {
      best = { ...rule, length };
    }
  }
  return best;
}

export function isPathAllowed(rules, pathname) {
  const rule = matchingRule(rules, pathname);
  return rule ? rule.type === 'allow' : true;
}
