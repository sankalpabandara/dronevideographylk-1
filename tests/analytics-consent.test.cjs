const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/analytics-consent.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(moduleUnderTest.exports);
const { ConsentAnalytics, analyticsPage, readConsent, CONSENT_DAYS } = moduleUnderTest.exports;
const pages = { '/': 'Home', '/contact': 'Contact', '/services': 'Services' };
const page = path => analyticsPage(path, pages);

function fixture(options = {}) {
  const events = [];
  let disabled = false;
  const port = {
    disable(value) { disabled = value; events.push(['disable', value]); },
    clearAnalyticsCookies() { events.push(['clearCookies']); },
    command(...args) { events.push(['command', ...args]); },
    async loadTag() { events.push(['load']); if (options.load) await options.load(); },
  };
  return { controller: new ConsentAnalytics('G-TESTONLY', port), events, isDisabled: () => disabled,
    views: () => events.filter(e => e[0] === 'command' && e[1] === 'event' && e[2] === 'page_view') };
}

test('fresh, rejected and expired choices never load Google or issue commands', async () => {
  const f = fixture();
  for (const choice of [null, 'rejected', readConsent('{"choice":"accepted","expires":1}')]) {
    await f.controller.update(choice, page('/'));
    await f.controller.update(choice, page('/contact'));
  }
  assert.equal(f.isDisabled(), true);
  assert.equal(f.events.some(e => ['load', 'command'].includes(e[0])), false);
});

test('accepted views are unique per route, reload defaults are safe, unknown paths excluded', async () => {
  const f = fixture();
  await f.controller.update('accepted', page('/'));
  await f.controller.update('accepted', page('/'));
  await f.controller.update('accepted', page('/contact'));
  assert.equal(f.views().length, 2);
  assert.equal(f.events.filter(e => e[0] === 'load').length, 1);
  for (const config of f.events.filter(e => e[1] === 'config')) {
    assert.equal(config[3].send_page_view, false);
    assert.equal(config[3].allow_google_signals, false);
    assert.equal(config[3].allow_ad_personalization_signals, false);
    assert.equal(config[3].cookie_expires, 2592000);
    assert.equal(config[3].cookie_update, false);
  }
  await f.controller.update('accepted', page('/admin'));
  assert.equal(f.isDisabled(), true);
  await f.controller.update('accepted', page('/contact'));
  assert.equal(f.views().length, 3);
});

test('withdrawal disables before updating consent and clears only through Analytics port', async () => {
  const f = fixture();
  await f.controller.update('accepted', page('/'));
  const start = f.events.length;
  await f.controller.update('rejected', page('/'));
  await f.controller.update('rejected', page('/contact'));
  assert.deepEqual(f.events[start], ['disable', true]);
  assert.deepEqual(f.events[start + 1], ['clearCookies']);
  assert.equal(f.isDisabled(), true);
  assert.equal(f.views().length, 1);
  await f.controller.update('accepted', page('/contact'));
  assert.equal(f.views().length, 2);
  assert.equal(f.events.filter(e => e[0] === 'load').length, 1);
});

test('withdrawal while script downloads cancels every pending page view', async () => {
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => loading });
  const pending = f.controller.update('accepted', page('/'));
  await f.controller.update('rejected', page('/'));
  release();
  await pending;
  assert.equal(f.isDisabled(), true);
  assert.equal(f.views().length, 0);
  assert.equal(f.events.some(e => e[1] === 'config'), false);
});

test('navigation while script downloads emits only the latest page and stop cancels work', async () => {
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => loading });
  const first = f.controller.update('accepted', page('/'));
  const second = f.controller.update('accepted', page('/contact'));
  release();
  await Promise.all([first, second]);
  assert.equal(f.views().length, 1);
  assert.equal(f.views()[0][3].page_location, 'https://dronevideography.lk/contact');
  f.controller.stop();
  assert.equal(f.isDisabled(), true);
});

test('failed loading remains disabled and can retry without duplicate page views', async () => {
  let fails = true;
  const f = fixture({ load: () => { if (fails) throw new Error('blocked'); } });
  await f.controller.update('accepted', page('/'));
  assert.equal(f.views().length, 0);
  assert.equal(f.isDisabled(), true);
  fails = false;
  await f.controller.update('accepted', page('/'));
  assert.equal(f.views().length, 1);
});

test('page payloads are exact allowlisted values and do not use personal input', () => {
  for (const path of ['/admin', '/shop/cart', '/contact?email=test@example.com', '/contact#phone', '/services/alice-smith', '/constructor', '/__proto__']) {
    assert.equal(page(path), null);
  }
  assert.deepEqual(page('/contact/'), { page_location: 'https://dronevideography.lk/contact', page_title: 'Contact | Drone Videography LK', page_referrer: '' });
});

test('stored consent validates malformed choices and expiration', () => {
  const now = 1000000;
  assert.equal(readConsent(JSON.stringify({ choice: 'accepted', expires: now + CONSENT_DAYS * 86400000 }), now), 'accepted');
  for (const value of [null, '{', '{}', '{"choice":"yes","expires":2000000}', '{"choice":"accepted","expires":999999}']) {
    assert.equal(readConsent(value, now), null);
  }
});
