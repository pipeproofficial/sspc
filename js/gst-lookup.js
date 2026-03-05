import { remoteConfig } from './firebase-config.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const STATE_CODE_MAP = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh'
};

let gstLookupBaseUrlCache = null;
let gstLookupApiKeyCache = null;
let gstLookupProxyUrlCache = null;

function pickString(...values) {
    for (const value of values) {
        if (value == null) continue;
        if (typeof value === 'object') continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function extractErrorMessage(payload = {}) {
    return pickString(
        payload?.message,
        payload?.detail,
        payload?.error?.message,
        payload?.error?.detail,
        payload?.error_description,
        payload?.error,
        payload?.statusMessage
    ) || 'Taxpayer lookup failed.';
}

function firstAddressObject(payload = {}) {
    if (payload?.pradr?.addr && typeof payload.pradr.addr === 'object') return payload.pradr.addr;
    if (payload?.address && typeof payload.address === 'object') return payload.address;
    if (payload?.addr && typeof payload.addr === 'object') return payload.addr;
    return {};
}

function composeAddress(payload = {}) {
    const primary = pickString(payload.addressLine1, payload.address, payload.address1, payload.addr, payload.pradr?.adr);
    if (primary) return primary;
    const addr = firstAddressObject(payload);
    const parts = [
        addr.bno,
        addr.flno,
        addr.bnm,
        addr.st,
        addr.loc,
        addr.dst,
        addr.city,
        addr.state,
        addr.pncd
    ].map((v) => pickString(v)).filter(Boolean);
    return parts.join(', ');
}

function normalizeState(stateValue, gstin) {
    const raw = pickString(stateValue);
    if (raw) {
        if (STATE_CODE_MAP[raw]) return STATE_CODE_MAP[raw];
        return raw;
    }
    const prefix = String(gstin || '').slice(0, 2);
    return STATE_CODE_MAP[prefix] || '';
}

export function deriveTaxpayerDetailsFromGstin(gstin) {
    const normalized = normalizeGstin(gstin);
    if (!isValidGstin(normalized)) return null;
    return {
        gstin: normalized,
        legalName: '',
        tradeName: '',
        status: '',
        state: normalizeState('', normalized),
        address: '',
        raw: null
    };
}

function parseTaxpayerPayload(payload, gstin) {
    const root = payload?.data || payload?.result || payload?.taxpayer || payload?.taxpayerInfo || payload || {};
    const legalName = pickString(root.legalName, root.legal_name, root.lgnm, root.businessName);
    const tradeName = pickString(root.tradeName, root.trade_name, root.tradeNam, root.dba, root.business_name);
    const status = pickString(root.status, root.gstStatus, root.sts, root.registrationStatus);
    const state = normalizeState(pickString(root.state, root.stateName, root.stateCode, root.pradr?.addr?.stcd), gstin);
    const address = composeAddress(root);
    const hasData = Boolean(legalName || tradeName || address || state);
    if (!hasData) return null;
    return {
        gstin,
        legalName,
        tradeName,
        status,
        state,
        address,
        raw: root
    };
}

export function normalizeGstin(value = '') {
    return String(value || '').toUpperCase().replace(/\s+/g, '').trim();
}

export function isValidGstin(value = '') {
    return GSTIN_REGEX.test(normalizeGstin(value));
}

export async function getGstLookupBaseUrl() {
    if (gstLookupBaseUrlCache !== null) return gstLookupBaseUrlCache;
    let base = '';
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            const keys = ['gst_lookup_api_base_url', 'gst_taxpayer_api_base_url'];
            for (const key of keys) {
                const candidate = remoteConfig.getValue(key).asString();
                if (candidate && candidate.trim()) {
                    base = candidate.trim();
                    break;
                }
            }
        }
    } catch (_) {
        // ignore remote config errors; local override fallback is below
    }
    if (!base) {
        base = pickString(
            localStorage.getItem('gst_lookup_api_base_url'),
            localStorage.getItem('gst_taxpayer_api_base_url'),
            window?.GST_LOOKUP_API_BASE_URL
        );
    }
    if (base && !base.includes('{gstin}') && !base.endsWith('/')) base += '/';
    gstLookupBaseUrlCache = base || '';
    return gstLookupBaseUrlCache;
}

async function getGstLookupApiKey() {
    if (gstLookupApiKeyCache !== null) return gstLookupApiKeyCache;
    let key = '';
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            const keys = ['gst_lookup_api_key', 'gst_taxpayer_api_key'];
            for (const name of keys) {
                const candidate = remoteConfig.getValue(name).asString();
                if (candidate && candidate.trim()) {
                    key = candidate.trim();
                    break;
                }
            }
        }
    } catch (_) {
        // ignore remote config errors
    }
    if (!key) {
        key = pickString(
            localStorage.getItem('gst_lookup_api_key'),
            localStorage.getItem('gst_taxpayer_api_key'),
            window?.GST_LOOKUP_API_KEY
        );
    }
    gstLookupApiKeyCache = key || '';
    return gstLookupApiKeyCache;
}

async function getGstLookupProxyUrl() {
    if (gstLookupProxyUrlCache !== null) return gstLookupProxyUrlCache;
    let proxy = '';
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            const keys = ['gst_lookup_proxy_url', 'gst_taxpayer_proxy_url'];
            for (const key of keys) {
                const candidate = remoteConfig.getValue(key).asString();
                if (candidate && candidate.trim()) {
                    proxy = candidate.trim();
                    break;
                }
            }
        }
    } catch (_) {
        // ignore remote config errors
    }
    if (!proxy) {
        proxy = pickString(
            localStorage.getItem('gst_lookup_proxy_url'),
            localStorage.getItem('gst_taxpayer_proxy_url'),
            window?.GST_LOOKUP_PROXY_URL
        );
    }
    if (!proxy) {
        const host = String(window?.location?.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
            proxy = 'http://localhost:8787/api/gst-lookup';
        }
    }
    gstLookupProxyUrlCache = proxy || '';
    return gstLookupProxyUrlCache;
}

function buildLookupUrl(base, gstin, apiKey = '') {
    const encoded = encodeURIComponent(gstin);
    if (base.includes('{gstin}')) {
        return base.replace('{gstin}', encoded).replace('{apiKey}', encodeURIComponent(apiKey));
    }
    if (base.includes('?')) {
        return `${base}&gstin=${encoded}`;
    }
    if (/\/search\/?$/i.test(base)) {
        return `${base}?gstin=${encoded}`;
    }
    if (base.endsWith('/')) {
        return `${base}${encoded}`;
    }
    return `${base}/${encoded}`;
}

function buildProxyLookupUrl(proxyBase, gstin, targetUrl = '') {
    const encodedGstin = encodeURIComponent(gstin);
    const encodedTarget = encodeURIComponent(targetUrl || '');
    if (proxyBase.includes('{gstin}')) {
        return proxyBase.replace('{gstin}', encodedGstin).replace('{target}', encodedTarget);
    }
    const separator = proxyBase.includes('?') ? '&' : '?';
    return `${proxyBase}${separator}gstin=${encodedGstin}${targetUrl ? `&target=${encodedTarget}` : ''}`;
}

async function requestJson(url, headers = {}) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            ...headers
        }
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        // response not JSON
    }

    if (!response.ok) {
        const message = extractErrorMessage(payload);
        throw new Error(message);
    }

    if (payload && (payload.success === false || String(payload.status || '').toLowerCase() === 'error')) {
        const message = extractErrorMessage(payload);
        throw new Error(message);
    }
    return payload;
}

export async function fetchTaxpayerDetailsByGstin(gstin) {
    const normalized = normalizeGstin(gstin);
    if (!isValidGstin(normalized)) {
        throw new Error('Enter a valid GSTIN.');
    }

    const base = await getGstLookupBaseUrl();
    if (!base) {
        throw new Error('GST lookup API is not configured. Add `gst_lookup_api_base_url` in Remote Config.');
    }

    const apiKey = await getGstLookupApiKey();
    const directUrl = buildLookupUrl(base, normalized, apiKey);
    const proxyUrl = await getGstLookupProxyUrl();
    const headers = apiKey ? { apikey: apiKey, 'x-api-key': apiKey, Authorization: `Bearer ${apiKey}` } : {};

    // Avoid noisy CORS errors in browser when API is cross-origin and no proxy is configured.
    if (!proxyUrl) {
        let targetOrigin = '';
        try {
            targetOrigin = new URL(directUrl, window.location.href).origin;
        } catch (_) {
            targetOrigin = '';
        }
        if (targetOrigin && targetOrigin !== window.location.origin) {
            throw new Error('GST API blocked by CORS. Configure `gst_lookup_proxy_url` and call GST API via your backend proxy.');
        }
    }

    let payload = null;
    try {
        if (proxyUrl) {
            payload = await requestJson(buildProxyLookupUrl(proxyUrl, normalized, directUrl), headers);
        } else {
            payload = await requestJson(directUrl, headers);
        }
    } catch (error) {
        const isCorsOrNetwork = error instanceof TypeError || /failed to fetch/i.test(String(error?.message || ''));
        if (isCorsOrNetwork && !proxyUrl) {
            throw new Error('GST API blocked by CORS. Configure `gst_lookup_proxy_url` and call GST API via your backend proxy.');
        }
        if (isCorsOrNetwork && proxyUrl) {
            throw new Error('GST proxy is not reachable. Start `gst-proxy-server.js` on port 8787 or update `gst_lookup_proxy_url`.');
        }
        throw error;
    }

    const details = parseTaxpayerPayload(payload, normalized);
    if (!details) {
        throw new Error('No taxpayer details found for this GSTIN.');
    }
    return details;
}
