const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT || 8787);
const GST_LOOKUP_BASE_URL = process.env.GST_LOOKUP_BASE_URL || 'https://gstapi.charteredinfo.com/commonapi/v1.1/search';
const GST_LOOKUP_API_KEY = process.env.GST_LOOKUP_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5502';
const GST_LOOKUP_ASPID = process.env.GST_LOOKUP_ASPID || '';
const GST_LOOKUP_PASSWORD = process.env.GST_LOOKUP_PASSWORD || '';
const GST_LOOKUP_USERNAME = process.env.GST_LOOKUP_USERNAME || '';

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-api-key');
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
}

function buildTargetUrl(gstin, incomingTarget) {
    if (incomingTarget) {
        const decoded = decodeURIComponent(String(incomingTarget));
        const parsed = new URL(decoded);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Invalid target URL protocol');
        }
        if (GST_LOOKUP_ASPID && !parsed.searchParams.has('aspid')) parsed.searchParams.set('aspid', GST_LOOKUP_ASPID);
        if (GST_LOOKUP_PASSWORD && !parsed.searchParams.has('password')) parsed.searchParams.set('password', GST_LOOKUP_PASSWORD);
        if (GST_LOOKUP_USERNAME && !parsed.searchParams.has('username')) parsed.searchParams.set('username', GST_LOOKUP_USERNAME);
        if (!parsed.searchParams.has('gstin')) parsed.searchParams.set('gstin', gstin);
        return parsed.toString();
    }

    const base = new URL(GST_LOOKUP_BASE_URL);
    if (base.searchParams.has('gstin')) base.searchParams.set('gstin', gstin);
    else base.searchParams.set('gstin', gstin);
    if (GST_LOOKUP_ASPID && !base.searchParams.has('aspid')) base.searchParams.set('aspid', GST_LOOKUP_ASPID);
    if (GST_LOOKUP_PASSWORD && !base.searchParams.has('password')) base.searchParams.set('password', GST_LOOKUP_PASSWORD);
    if (GST_LOOKUP_USERNAME && !base.searchParams.has('username')) base.searchParams.set('username', GST_LOOKUP_USERNAME);

    if (/\/search\/?$/i.test(base.pathname)) {
        return base.toString();
    }

    if (base.pathname.endsWith('/')) {
        base.pathname = `${base.pathname}${encodeURIComponent(gstin)}`;
    } else {
        base.pathname = `${base.pathname}/${encodeURIComponent(gstin)}`;
    }
    return base.toString();
}

function proxyJsonGet(targetUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(targetUrl);
        const requester = parsed.protocol === 'https:' ? https : http;
        const req = requester.request(
            parsed,
            { method: 'GET', headers },
            (resp) => {
                let data = '';
                resp.setEncoding('utf8');
                resp.on('data', (chunk) => {
                    data += chunk;
                });
                resp.on('end', () => {
                    let payload = null;
                    try {
                        payload = data ? JSON.parse(data) : {};
                    } catch (_) {
                        payload = { raw: data };
                    }
                    resolve({
                        statusCode: resp.statusCode || 500,
                        payload
                    });
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, service: 'gst-proxy', time: new Date().toISOString() });
        return;
    }

    if (!(req.method === 'GET' && url.pathname === '/api/gst-lookup')) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }

    try {
        const gstin = String(url.searchParams.get('gstin') || '').trim().toUpperCase();
        const target = url.searchParams.get('target') || '';
        if (!gstin) {
            sendJson(res, 400, { error: 'Missing gstin query parameter' });
            return;
        }

        const targetUrl = buildTargetUrl(gstin, target);
        const proxyHeaders = {
            Accept: 'application/json',
            ...(GST_LOOKUP_API_KEY ? { apikey: GST_LOOKUP_API_KEY, 'x-api-key': GST_LOOKUP_API_KEY, Authorization: `Bearer ${GST_LOOKUP_API_KEY}` } : {}),
            ...(GST_LOOKUP_ASPID ? { aspid: GST_LOOKUP_ASPID } : {}),
            ...(GST_LOOKUP_PASSWORD ? { password: GST_LOOKUP_PASSWORD } : {}),
            ...(GST_LOOKUP_USERNAME ? { username: GST_LOOKUP_USERNAME } : {})
        };

        const upstream = await proxyJsonGet(targetUrl, proxyHeaders);
        sendJson(res, upstream.statusCode, upstream.payload);
    } catch (error) {
        sendJson(res, 502, { error: error.message || 'Proxy request failed' });
    }
});

server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`GST proxy running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Allowed origin: ${ALLOWED_ORIGIN}`);
    // eslint-disable-next-line no-console
    console.log(`Auth params configured: aspid=${GST_LOOKUP_ASPID ? 'yes' : 'no'}, apiKey=${GST_LOOKUP_API_KEY ? 'yes' : 'no'}`);
});
