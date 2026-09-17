import { URL } from 'url';

// Private and reserved IP patterns for SSRF protection
const PRIVATE_IP_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|::1|fe80::.*)$/i;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSafeUrl(urlString: string, serviceHost?: string): ValidationResult {
  let parsed: URL;

  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 1. Only allow standard HTTP/HTTPS protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Unsupported protocol. Only http and https URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Prevent SSRF / Private network probing
  if (PRIVATE_IP_REGEX.test(hostname) || hostname === 'localhost') {
    return { valid: false, error: 'Cannot shorten URLs pointing to internal or private addresses' };
  }

  // 3. Prevent self-referential redirect loops
  if (serviceHost && hostname === serviceHost.toLowerCase()) {
    return { valid: false, error: 'Recursive short links to this domain are not allowed' };
  }

  return { valid: true };
}
