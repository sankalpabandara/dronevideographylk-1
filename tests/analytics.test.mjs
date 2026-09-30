import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateKeyPairSync, verify } from 'node:crypto';
import ts from 'typescript';

// Test the actual TypeScript modules with synthetic credentials and mocked HTTP only.
function load(relative, mocks = {}, environment = process.env) {
  const filename = path.resolve(relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  const localRequire = createRequire(filename);
  new Function('require', 'module', 'exports', 'process', source)(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      const relativeModule = path.resolve(path.dirname(filename), `${name}.ts`);
      if (name.startsWith('./') && fs.existsSync(relativeModule)) return load(relativeModule, mocks, environment);
      return localRequire(name);
    }, testModule, testModule.exports, { env: environment },
  );
  return testModule.exports;
}
const { Ga4Client, parsePeriod, publicPageLabel, completeDailySeries } = load('src/lib/ga4-client.ts');
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { propertyId: '123', streamId: '456', email: 'test@fixture.iam.gserviceaccount.com', privateKey: key.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const row = (dimension, ...values) => ({ dimensionValues: [{ value: dimension }], metricValues: values.map(value => ({ value: String(value) })) });

test('real-time requests are scoped, correctly signed, coalesced and cached', async () => {
  const calls = [];
  const client = new Ga4Client(config, async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    if (url.includes('oauth2')) {
      const [header, payload, signature] = options.body.get('assertion').split('.');
      assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), key.publicKey, Buffer.from(signature, 'base64url')), true);
      const claims = JSON.parse(Buffer.from(payload, 'base64url'));
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/analytics.readonly');
      return Response.json({ access_token: 'synthetic-test-token', expires_in: 3600 });
    }
    assert.match(url, /properties\/123:runRealtimeReport$/);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.dimensionFilter.andGroup.expressions.map(item => item.filter.stringFilter.value), ['456', 'web']);
    assert.deepEqual(body.minuteRanges, [{ startMinutesAgo: 29, endMinutesAgo: 0 }]);
    return Response.json({ rows: body.dimensions ? [row('00', 3), row('29', 2)] : [row('', 4, 5)] });
  });
  const [a, b] = await Promise.all([client.realtime(), client.realtime()]);
  assert.deepEqual(a, b);
  assert.equal(a.activeUsers, 4);
  assert.equal(a.pageViews, 5);
  assert.equal(a.minutes.length, 30);
  assert.equal(a.minutes[0].value, 2);
  assert.equal(a.minutes[29].value, 3);
  assert.equal(a.minutes[1].value, 0);
  await client.realtime();
  assert.equal(calls.length, 3);
  assert.doesNotMatch(JSON.stringify(a), /synthetic-test-token|PRIVATE KEY/);
});

test('historical reports filter hostname and stream, request complete days and preserve privacy limits', async () => {
  const client = new Ga4Client(config, async (url, options) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'test', expires_in: 3600 });
    const body = JSON.parse(options.body);
    const requests = body.requests || [body];
    for (const request of requests) {
      assert.deepEqual(request.dateRanges, [{ startDate: '7daysAgo', endDate: 'yesterday' }]);
      assert.equal(request.dimensionFilter.andGroup.expressions[0].filter.stringFilter.value, '456');
      assert.deepEqual(request.dimensionFilter.andGroup.expressions[2].filter.inListFilter.values, ['dronevideography.lk', 'www.dronevideography.lk']);
    }
    if (!body.requests) return Response.json({ rows: [row('mobile', 12)] });
    assert.equal(body.requests.length, 5);
    return Response.json({ reports: [
      { rows: [row('', 12, 20, 32, 0.5)], metadata: { timeZone: 'Asia/Colombo', subjectToThresholding: true } },
      { rows: [row('20260929', 32)] }, { rows: [row('/contact?email=person@example.test', 10), row('/admin/orders', 1)] },
      { rows: [row('Organic Search', 20)] }, { rows: [row('Sri Lanka', 12)] },
    ] });
  });
  const result = await client.history(7);
  assert.equal(result.days, 7);
  assert.equal(result.engagementRate, 0.5);
  assert.equal(result.limited, true);
  assert.equal(result.trend.length, 7);
  assert.equal(result.pages[0].label, '/contact');
  assert.doesNotMatch(JSON.stringify(result), /person@|\/admin/);
});

test('daily charts fill zero-visit days using the property timezone across month boundaries', () => {
  const result = completeDailySeries([{ label: '20260930', value: 4 }], 3, 'Asia/Colombo', new Date('2026-09-30T20:00:00Z'));
  assert.deepEqual(result, [
    { label: '2026-09-28', value: 0 },
    { label: '2026-09-29', value: 0 },
    { label: '2026-09-30', value: 4 },
  ]);
});

test('invalid data and upstream failures are not displayed as zero visitors', async () => {
  const client = new Ga4Client(config, async url => url.includes('oauth2')
    ? Response.json({ access_token: 'test', expires_in: 3600 })
    : Response.json({ rows: [row('', 'not-a-number')] }));
  await assert.rejects(client.realtime(), /Invalid report data/);
  const unavailable = new Ga4Client(config, async () => new Response('private upstream detail', { status: 403 }));
  await assert.rejects(unavailable.realtime(), error => !error.message.includes('private upstream detail'));
});

test('only supported ranges and public labels are accepted', () => {
  assert.equal(parsePeriod(null), 28);
  assert.equal(parsePeriod('90'), 90);
  assert.equal(parsePeriod('1000000'), null);
  assert.equal(publicPageLabel('/contact?phone=123#name'), '/contact');
  assert.equal(publicPageLabel('/shop/checkout'), 'Other pages');
  assert.equal(publicPageLabel('/admin/enquiries'), 'Other pages');
  assert.equal(publicPageLabel('/customer/person@example.test'), 'Other pages');
  assert.equal(publicPageLabel('/fleet/alice-smith'), 'Other pages');
  assert.equal(publicPageLabel('/shop/dji-mini-2?email=example'), '/shop/dji-mini-2');
  assert.throws(() => new Ga4Client({ ...config, propertyId: '../../other' }));
});

function route(authenticated, client, defaults = false, environment = {}) {
  return load('src/app/api/admin/analytics/route.ts', {
    '@/lib/auth': { isAuthenticated: async () => authenticated, usingDefaults: () => defaults },
    '@/lib/analytics-server': { analyticsClient: client, analyticsDestination: () => ({ propertyId: '123', streamId: '456' }) },
    '@/lib/ga4-client': { parsePeriod },
  }, environment);
}
test('unauthenticated access never queries Google and has private no-store headers', async () => {
  const response = await route(false, () => { throw new Error('must not be called'); }).GET(new Request('https://dronevideography.lk/api/admin/analytics'));
  assert.equal(response.status, 401);
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(response.headers.get('Vary'), 'Cookie');
});
test('unconfigured reports explicitly show disconnected, not success or zero', async () => {
  const response = await route(true, () => null).GET(new Request('https://dronevideography.lk/api/admin/analytics'));
  const data = await response.json();
  assert.equal(data.status, 'not_configured');
  assert.equal(data.data, undefined);
});

test('production refuses reporting with default admin configuration before querying Google', async () => {
  const handler = route(true, () => { throw new Error('must not query'); }, true, { NODE_ENV: 'production' });
  const response = await handler.GET(new Request('https://dronevideography.lk/api/admin/analytics'));
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /configured admin login/);
});

test('reporting stays disabled or rejects a mismatched destination without constructing a client', () => {
  let constructed = 0;
  const mocks = { 'server-only': {}, './ga4-client': { Ga4Client: class { constructor() { constructed++; } } } };
  for (const environment of [
    {}, { GA4_REPORTS_ENABLED: 'false' },
    { GA4_REPORTS_ENABLED: 'true', GA4_PROPERTY_ID: '999', GA4_STREAM_ID: '15888838415', GA4_SERVICE_ACCOUNT_EMAIL: config.email, GA4_SERVICE_ACCOUNT_PRIVATE_KEY: 'synthetic' },
    { GA4_REPORTS_ENABLED: 'true', GA4_PROPERTY_ID: '556761523', GA4_STREAM_ID: '999', GA4_SERVICE_ACCOUNT_EMAIL: config.email, GA4_SERVICE_ACCOUNT_PRIVATE_KEY: 'synthetic' },
  ]) {
    assert.equal(load('src/lib/analytics-server.ts', mocks, environment).analyticsClient(), null);
  }
  assert.equal(constructed, 0);
});
test('the reporting endpoint rejects arbitrary ranges and sanitizes Google failures', async () => {
  const handler = route(true, () => ({ realtime: () => { throw new Error('secret upstream body'); } }));
  const invalid = await handler.GET(new Request('https://dronevideography.lk/api/admin/analytics?days=999'));
  assert.equal(invalid.status, 400);
  const response = await handler.GET(new Request('https://dronevideography.lk/api/admin/analytics'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret upstream/);
});
