import { ApiError } from '@/lib/api-error';

// Discovery only reads from an operator-authorised source. Every provider here
// is environment-configured and reports its own readiness. When a provider is
// not configured the service refuses to run; it never invents businesses.
const PLACES_ENV_KEYS = ['GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY'];
const WEB_SEARCH_ENV_KEYS = ['DISCOVERY_SEARCH_ENDPOINT', 'DISCOVERY_SEARCH_API_KEY'];

const SEARCH_TIMEOUT_MS = 20_000;

const PROVIDERS = {
  google_places: {
    key: 'google_places',
    label: 'Google Places',
    description:
      'Searches the official Google Places Text Search API. Returns listing facts such as name, address, phone and website.',
    envKeys: PLACES_ENV_KEYS,
    requiredEnvKeys: PLACES_ENV_KEYS,
    verification: 'source_derived',
    sourceLabel: 'Google Places listing',
  },
  public_web_search: {
    key: 'public_web_search',
    label: 'Public web search',
    description:
      'Calls an operator-supplied JSON search endpoint. Listings are stored as unverified until a reviewer checks them.',
    envKeys: WEB_SEARCH_ENV_KEYS,
    requiredEnvKeys: ['DISCOVERY_SEARCH_ENDPOINT'],
    verification: 'unverified',
    sourceLabel: 'Public search result',
  },
};

function envValue(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function getDiscoveryProviderDefinition(key) {
  return PROVIDERS[key] || null;
}

export function isDiscoveryProviderConfigured(key) {
  const definition = PROVIDERS[key];
  if (!definition) return false;
  return definition.requiredEnvKeys.every((envKey) => Boolean(envValue([envKey])));
}

export function listDiscoveryProviderMetadata() {
  return Object.values(PROVIDERS).map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    envKeys: definition.envKeys,
    verification: definition.verification,
    sourceLabel: definition.sourceLabel,
    configured: isDiscoveryProviderConfigured(definition.key),
  }));
}

export function buildSearchQuery(criteria = {}, services = []) {
  const parts = [];
  if (criteria.industry) parts.push(criteria.industry);
  if (Array.isArray(services) && services.length > 0) {
    parts.push(services.join(', '));
  }
  const place = [criteria.area, criteria.city, criteria.state, criteria.country]
    .filter(Boolean)
    .join(', ');
  if (place) parts.push(place);
  if (criteria.businessSize) parts.push(criteria.businessSize);
  if (criteria.keywords) parts.push(criteria.keywords);
  if (criteria.qualityCriteria) parts.push(criteria.qualityCriteria);
  const query = parts.join(' ').replace(/\s+/g, ' ').trim();
  return query.slice(0, 400) || 'local businesses';
}

function normalizeHttpUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function text(value, max) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

async function postJson({ url, init, provider, fetchImpl, signal, timeoutMs }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Number(timeoutMs) || SEARCH_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) {
      throw new ApiError(499, 'DISCOVERY_CANCELLED', 'The discovery run was cancelled.');
    }
    if (timedOut || error?.name === 'AbortError') {
      throw new ApiError(
        502,
        'DISCOVERY_PROVIDER_UNAVAILABLE',
        `${provider} did not respond in time.`,
      );
    }
    throw new ApiError(
      502,
      'DISCOVERY_PROVIDER_UNAVAILABLE',
      `${provider} could not be reached.`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        409,
        'DISCOVERY_PROVIDER_AUTH',
        `${provider} rejected the configured credentials.`,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ApiError(
        502,
        'DISCOVERY_PROVIDER_UNAVAILABLE',
        `${provider} is temporarily unavailable (HTTP ${response.status}).`,
      );
    }
    throw new ApiError(
      422,
      'DISCOVERY_PROVIDER_REQUEST',
      `${provider} rejected the search request (HTTP ${response.status}).`,
    );
  }

  return body;
}

function readAddressComponent(components, type) {
  if (!Array.isArray(components)) return null;
  const match = components.find((item) => Array.isArray(item?.types) && item.types.includes(type));
  return text(match?.longText || match?.shortText, 120);
}

export function mapGooglePlace(place, criteria = {}) {
  if (!place) return null;
  const name = text(place.displayName?.text || place.displayName, 200);
  if (!name) return null;

  const components = place.addressComponents;
  const address = text(place.formattedAddress, 300);
  const website = normalizeHttpUrl(place.websiteUri);
  const phone = text(
    place.internationalPhoneNumber || place.nationalPhoneNumber,
    60,
  );
  const city =
    readAddressComponent(components, 'locality') ||
    readAddressComponent(components, 'postal_town');
  const state = readAddressComponent(components, 'administrative_area_level_1');
  const country = readAddressComponent(components, 'country');
  const industry = text(place.primaryTypeDisplayName?.text, 160);

  return {
    businessName: name,
    website,
    phone,
    email: null,
    contactName: null,
    address,
    city: city || criteria.city || null,
    state: state || criteria.state || null,
    country: country || criteria.country || null,
    industry: industry || criteria.industry || null,
    businessSize: criteria.businessSize || null,
    sourceUrls: [normalizeHttpUrl(place.googleMapsUri)].filter(Boolean),
    facts: {
      provider: 'google_places',
      listedName: name,
      address,
      phone,
      website,
      businessStatus: text(place.businessStatus, 40),
      providerTypes: Array.isArray(place.types) ? place.types.slice(0, 10) : [],
    },
    observations: {
      hasWebsite: Boolean(website),
      locationFromCriteria: !city && !state,
    },
  };
}

export function mapWebSearchResult(item, criteria = {}) {
  if (!item || typeof item !== 'object') return null;
  const name = text(
    item.businessName || item.name || item.title || item.company,
    200,
  );
  if (!name) return null;

  const explicitWebsite = normalizeHttpUrl(item.website || item.site);
  const listedUrl = normalizeHttpUrl(item.url || item.link || item.href || item.website);
  const address = text(item.address || item.location, 300);
  const phone = text(item.phone || item.telephone, 60);
  const city = text(item.city, 120);
  const state = text(item.state || item.region, 120);
  const country = text(item.country, 120);
  const industry = text(item.industry || item.category, 160);

  return {
    businessName: name,
    // Only an explicitly declared website counts. A directory listing URL is
    // kept as a source, never presented as the company's own site.
    website: explicitWebsite,
    phone,
    email: text(item.email, 200),
    contactName: text(item.contactName || item.contact, 160),
    address,
    city: city || criteria.city || null,
    state: state || criteria.state || null,
    country: country || criteria.country || null,
    industry: industry || criteria.industry || null,
    businessSize: criteria.businessSize || null,
    sourceUrls: [listedUrl, explicitWebsite].filter(Boolean),
    facts: {
      provider: 'public_web_search',
      listedName: name,
      listedUrl,
      snippet: text(item.snippet || item.description, 600),
      address,
      phone,
      website: explicitWebsite,
    },
    observations: {
      hasWebsite: Boolean(explicitWebsite),
      locationFromCriteria: !city && !state,
    },
  };
}

export async function searchBusinesses({
  provider,
  criteria = {},
  services = [],
  limit = 20,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const definition = getDiscoveryProviderDefinition(provider);
  if (!definition) {
    throw new ApiError(
      422,
      'DISCOVERY_PROVIDER_UNSUPPORTED',
      'Choose a supported discovery provider.',
    );
  }
  if (!isDiscoveryProviderConfigured(provider)) {
    throw new ApiError(
      409,
      'DISCOVERY_PROVIDER_NOT_CONFIGURED',
      `${definition.label} is not configured on this server. Add ${definition.requiredEnvKeys.join(' or ')} to enable discovery, or continue with a configured provider.`,
    );
  }

  const query = buildSearchQuery(criteria, services);
  const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));

  if (provider === 'google_places') {
    const apiKey = envValue(PLACES_ENV_KEYS);
    const body = await postJson({
      url: 'https://places.googleapis.com/v1/places:searchText',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.displayName',
            'places.formattedAddress',
            'places.websiteUri',
            'places.nationalPhoneNumber',
            'places.internationalPhoneNumber',
            'places.addressComponents',
            'places.primaryTypeDisplayName',
            'places.types',
            'places.googleMapsUri',
            'places.businessStatus',
          ].join(','),
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: Math.min(pageSize, 20),
          languageCode: 'en',
        }),
      },
      provider: definition.label,
      fetchImpl,
      signal,
    });

    const places = Array.isArray(body?.places) ? body.places : [];
    return places
      .map((place) => mapGooglePlace(place, criteria))
      .filter(Boolean)
      .slice(0, pageSize);
  }

  const endpoint = envValue(['DISCOVERY_SEARCH_ENDPOINT']);
  const apiKey = envValue(['DISCOVERY_SEARCH_API_KEY']);
  const body = await postJson({
    url: endpoint,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, limit: pageSize }),
    },
    provider: definition.label,
    fetchImpl,
    signal,
  });

  const results = Array.isArray(body)
    ? body
    : Array.isArray(body?.results)
      ? body.results
      : Array.isArray(body?.items)
        ? body.items
        : Array.isArray(body?.data)
          ? body.data
          : [];

  return results
    .map((item) => mapWebSearchResult(item, criteria))
    .filter(Boolean)
    .slice(0, pageSize);
}
