import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import zlib from 'node:zlib';

// A deliberately small HTTP client for worker jobs. It never follows
// redirects to unvalidated hosts, never uses a proxy, never accepts private
// addresses, and pins the validated IP so a second DNS answer cannot redirect
// the connection into the internal network (DNS rebinding).
export const SAFE_USER_AGENT =
  'MKWorkforceAuditBot/1.0 (+https://mkgroupdigital.com; website audit; contact via workspace)';

export const DEFAULT_LIMITS = {
  maxBytes: 2_000_000,
  maxDecodedBytes: 5_000_000,
  timeoutMs: 10_000,
  maxRedirects: 3,
};

export class FetchError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_IPV4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_IPV6_PREFIXES = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
];

function ipv4ToBytes(address) {
  return address.split('.').map(Number);
}

function ipv4InRange(bytes, base, bits) {
  const baseBytes = ipv4ToBytes(base);
  let remainder = bits;
  for (let index = 0; index < 4; index += 1) {
    if (remainder <= 0) return true;
    const take = Math.min(8, remainder);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((bytes[index] & mask) !== (baseBytes[index] & mask)) return false;
    remainder -= take;
  }
  return true;
}

function expandIpv6(address) {
  const lower = address.toLowerCase();
  const zoneIndex = lower.indexOf('%');
  const value = zoneIndex >= 0 ? lower.slice(0, zoneIndex) : lower;

  // An embedded dotted IPv4 is converted into two hex groups first.
  let groupsText = value;
  if (groupsText.includes('.')) {
    const lastColon = groupsText.lastIndexOf(':');
    const dotted = groupsText.slice(lastColon + 1);
    if (isIP(dotted) !== 4) return null;
    const bytes = ipv4ToBytes(dotted);
    groupsText = `${groupsText.slice(0, lastColon)}:${(
      ((bytes[0] << 8) | bytes[1]).toString(16)
    )}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }

  const [head, tail] = groupsText.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;

  const groups = [
    ...headGroups,
    ...Array.from({ length: groupsText.includes('::') ? missing : 0 }, () => '0'),
    ...tailGroups,
  ];
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    const group = Number.parseInt(groups[index], 16);
    if (!Number.isInteger(group) || group < 0 || group > 0xffff) return null;
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}

function ipv6InPrefix(bytes, base, bits) {
  const baseBytes = expandIpv6(base);
  if (!baseBytes) return false;
  let remainder = bits;
  for (let index = 0; index < 16; index += 1) {
    if (remainder <= 0) return true;
    const take = Math.min(8, remainder);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((bytes[index] & mask) !== (baseBytes[index] & mask)) return false;
    remainder -= take;
  }
  return true;
}

function mappedIpv4(bytes) {
  for (let index = 0; index < 10; index += 1) {
    if (bytes[index] !== 0) return null;
  }
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;
  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}

export function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const bytes = ipv4ToBytes(address);
    if (bytes.some((value) => !Number.isInteger(value))) return true;
    return BLOCKED_IPV4.some(([base, bits]) => ipv4InRange(bytes, base, bits));
  }

  if (family === 6) {
    const bytes = expandIpv6(address);
    if (!bytes) return true;

    const mapped = mappedIpv4(bytes);
    if (mapped) return isBlockedAddress(mapped);

    if (BLOCKED_IPV6_PREFIXES.some(([base, bits]) => ipv6InPrefix(bytes, base, bits))) {
      return true;
    }

    // 6to4 embeds an IPv4 address at bytes 2-5.
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
      return isBlockedAddress(`${bytes[2]}.${bytes[3]}.${bytes[4]}.${bytes[5]}`);
    }

    return false;
  }

  // Anything that is neither a valid IPv4 nor IPv6 literal is rejected.
  return true;
}

export function assertSafeUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(String(input));
  } catch {
    throw new FetchError('invalid_url', 'That URL could not be parsed.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError(
      'unsupported_protocol',
      'Only http and https URLs can be fetched.',
    );
  }

  if (url.username || url.password) {
    throw new FetchError(
      'credentials_in_url',
      'URLs with embedded credentials are not allowed.',
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new FetchError('invalid_url', 'That URL has no host.');
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new FetchError(
      'internal_host',
      'That host is not reachable from the audit worker.',
    );
  }

  if (isIP(hostname) && isBlockedAddress(hostname)) {
    throw new FetchError(
      'internal_address',
      'That address is not reachable from the audit worker.',
    );
  }

  return url;
}

export async function resolveSafeAddress(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new FetchError(
        'internal_address',
        'That address is not reachable from the audit worker.',
      );
    }
    return { address: host, family: isIP(host) };
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new FetchError('dns_failure', 'That host could not be resolved.');
  }

  if (!records.length) {
    throw new FetchError('dns_failure', 'That host could not be resolved.');
  }

  // Every answer must be public: a mixed answer could reach an internal host
  // on a later connection if only the first record were validated.
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new FetchError(
        'internal_address',
        'That host resolves to an address the audit worker cannot reach.',
      );
    }
  }

  const preferred =
    records.find((record) => record.family === 4) || records[0];
  return { address: preferred.address, family: preferred.family };
}

function decodeBody(raw, encoding, maxDecodedBytes) {
  if (!encoding) return raw;
  const value = String(encoding).toLowerCase();

  try {
    if (value.includes('br')) {
      return zlib.brotliDecompressSync(raw, { maxOutputLength: maxDecodedBytes });
    }
    if (value.includes('gzip')) {
      return zlib.gunzipSync(raw, { maxOutputLength: maxDecodedBytes });
    }
    if (value.includes('deflate')) {
      return zlib.inflateSync(raw, { maxOutputLength: maxDecodedBytes });
    }
  } catch {
    throw new FetchError('decode_failure', 'The response could not be decoded.');
  }
  return raw;
}

function charsetFrom(contentType) {
  const match = /charset=["']?([\w-]+)/i.exec(contentType || '');
  return match ? match[1].toLowerCase() : 'utf-8';
}

function textual(contentType) {
  return /^(text\/|application\/(xhtml|xml|json|ld\+json|rss\+xml))/i.test(
    contentType || '',
  );
}

async function requestOnce(url, pin, options) {
  const lib = url.protocol === 'https:' ? https : http;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new FetchError('timeout', 'The request timed out.')),
    options.timeoutMs,
  );

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const request = lib.request(
      url,
      {
        method: 'GET',
        signal: controller.signal,
        // The pinned address is the only answer we allow. Node 20+ may ask for
        // every candidate (autoSelectFamily), which needs the array form.
        lookup: (_hostname, opts, callback) => {
          if (opts && opts.all) {
            callback(null, [{ address: pin.address, family: pin.family }]);
            return;
          }
          callback(null, pin.address, pin.family);
        },
        headers: {
          'user-agent': options.userAgent || SAFE_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
          'accept-encoding': 'gzip, deflate, br',
          connection: 'close',
        },
      },
      (response) => {
        const headers = response.headers;
        const status = response.statusCode || 0;
        const contentType = String(headers['content-type'] || '');
        const chunks = [];
        let received = 0;
        let truncated = false;

        const build = () => {
          const raw = Buffer.concat(chunks);
          const encoding = headers['content-encoding'] || '';
          let decoded = raw;
          if (!truncated) {
            try {
              decoded = decodeBody(raw, encoding, options.maxDecodedBytes);
            } catch (error) {
              finish(reject, error);
              return;
            }
          }

          const body = textual(contentType) ? decoded : null;
          const readable = body && (!truncated || !encoding);
          const result = {
            url: url.href,
            status,
            headers,
            contentType,
            rawBytes: raw.length,
            decodedBytes: decoded.length,
            compressed: Boolean(encoding),
            contentEncoding: String(encoding || ''),
            truncated,
            durationMs: Date.now() - startedAt,
            body: readable ? body : null,
            text: readable
              ? body.toString(
                  charsetFrom(contentType),
                  0,
                  Math.min(body.length, options.maxDecodedBytes),
                )
              : null,
          };

          finish(resolve, result);
          response.destroy();
        };

        response.on('data', (chunk) => {
          if (truncated) return;
          received += chunk.length;
          if (received > options.maxBytes) {
            const allowed = Math.max(0, options.maxBytes - (received - chunk.length));
            if (allowed > 0) chunks.push(chunk.subarray(0, allowed));
            truncated = true;
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', build);
        response.on('close', () => {
          if (!settled) build();
        });
        response.on('error', (error) => {
          finish(reject, error);
        });
      },
    );

    request.on('error', (error) => {
      if (controller.signal.aborted && controller.signal.reason instanceof FetchError) {
        finish(reject, controller.signal.reason);
        return;
      }
      finish(reject, error);
    });

    request.end();
  });
}

export async function safeFetch(input, options = {}, deps = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  // `deps` exists so tests can exercise redirect validation without network
  // access; production callers never pass it.
  const request = deps.requestOnce || requestOnce;
  const resolve = deps.resolveAddress || resolveSafeAddress;
  let current = assertSafeUrl(input);
  const redirects = [];
  let last = null;

  for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
    const pin = await resolve(current.hostname);
    const result = await request(current, pin, limits);

    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const header = result.headers.location;
      const location = Array.isArray(header) ? header[0] : header;
      if (!location) return { ...result, redirects };

      const next = new URL(String(location), current);
      current = assertSafeUrl(next.href);
      redirects.push(current.href);
      last = result;
      continue;
    }

    return { ...result, redirects };
  }

  throw new FetchError('too_many_redirects', 'That URL redirected too many times.', {
    redirects,
    status: last?.status ?? null,
  });
}
