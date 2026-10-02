const assert = require('node:assert/strict');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.GULAI_TEST_URL || 'http://127.0.0.1:4173';
const systemBrowser = process.env.GULAI_CHROMIUM_PATH || '/usr/bin/chromium';
const outputDirectory = path.join(__dirname, '..', 'test-results');
const results = { run: new Date().toISOString(), layouts: [], interactions: [], catalogues: [] };

async function ready(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach(image => image.loading = 'eager');
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
}

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemBrowser) ? { executablePath: systemBrowser } : {})
  });
  try {
    for (const language of ['es', 'en']) {
      for (const width of [320, 390, 768, 821, 900, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        const failedResponses = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().startsWith(base) && response.status() >= 400) {
            failedResponses.push(`${response.status()} ${response.url()}`);
          }
        });
        const response = await page.goto(`${base}/${language}/`, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        await ready(page);
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter(image => !image.naturalWidth).map(image => image.src),
          clippedControls: [...document.querySelectorAll('a,button')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width && rect.height && (rect.right > innerWidth + 1 || rect.left < -1
              || element.scrollWidth > element.clientWidth + 2);
          }).map(element => element.textContent.trim()),
          headingOverlapsHeader: document.querySelector('h1').getBoundingClientRect().top
            < document.querySelector('header').getBoundingClientRect().bottom,
          whatsapp: [...document.querySelectorAll('a[href^="https://wa.me/"]')].map(link => ({
            href: link.href, target: link.target, rel: link.rel
          }))
        }));
        assert.ok(layout.documentWidth <= width + 1, `${language}/${width}: horizontal overflow`);
        assert.deepEqual(layout.brokenImages, [], `${language}/${width}: missing images`);
        assert.deepEqual(layout.clippedControls, [], `${language}/${width}: clipped controls`);
        assert.equal(layout.headingOverlapsHeader, false);
        assert.deepEqual(errors, [], `${language}/${width}: JavaScript errors`);
        assert.deepEqual(failedResponses, [], `${language}/${width}: failed resources`);
        assert.ok(layout.whatsapp.length >= 4);
        for (const link of layout.whatsapp) {
          const url = new URL(link.href);
          assert.equal(url.hostname, 'wa.me');
          assert.equal(url.pathname, '/8619569148825');
          assert.ok(url.searchParams.get('text').length > 20);
          assert.equal(link.target, '_blank');
          assert.ok(link.rel.split(' ').includes('noopener'));
        }
        results.layouts.push({ language, width, status: 'passed', imageCount: await page.locator('img').count() });

        if (language === 'es' && [390, 1440].includes(width)) {
          await page.screenshot({ path: path.join(outputDirectory, `gulai-${width}.png`), fullPage: true });
        }

        if (width === 390) {
          const toggle = page.locator('.menu-toggle');
          const menu = page.locator('#mobile-menu');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert.equal(await menu.isVisible(), true);
          await page.keyboard.press('Escape');
          assert.equal(await menu.isVisible(), false);
          assert.ok(await toggle.evaluate(element => element === document.activeElement));
          await toggle.click();
          await page.locator('.hero-note').click();
          assert.equal(await menu.isVisible(), false);
          await toggle.click();
          await menu.locator('a[href="#products"]').click();
          assert.equal(await menu.isVisible(), false);
          assert.equal(new URL(page.url()).hash, '#products');
          results.interactions.push({ language, check: 'mobile menu, Escape, outside click and section link', status: 'passed' });

          const otherLanguage = language === 'es' ? 'en' : 'es';
          const languageLink = page.locator(`[data-lang-target="/${otherLanguage}/"]`);
          await page.waitForFunction(({ target, hash }) =>
            document.querySelector(`[data-lang-target="${target}"]`).getAttribute('href') === target + hash,
          { target: `/${otherLanguage}/`, hash: '#products' });
          assert.equal(await languageLink.getAttribute('href'), `/${otherLanguage}/#products`);
          await Promise.all([
            page.waitForURL(`${base}/${otherLanguage}/#products`),
            languageLink.click()
          ]);
          assert.equal(new URL(page.url()).pathname, `/${otherLanguage}/`);
          assert.equal(new URL(page.url()).hash, '#products');
          results.interactions.push({ language, check: 'language switch retains section', status: 'passed' });
        }
        await page.close();
      }
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    const page = await context.newPage();
    await page.goto(`${base}/es/`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('.skip-link').evaluate(element => element === document.activeElement));
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'home');
    results.interactions.push({ check: 'keyboard skip link focuses main content', status: 'passed' });

    const dock = page.locator('.whatsapp-dock');
    await page.waitForFunction(() => document.querySelector('.whatsapp-dock').hidden);
    await page.locator('#factory').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !document.querySelector('.whatsapp-dock').hidden);
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.whatsapp-dock').hidden);
    results.interactions.push({ check: 'WhatsApp dock appears between hero and contact', status: 'passed' });

    const copyButton = page.locator('[data-copy-wechat]');
    await copyButton.click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Skeke55');
    assert.equal(await page.locator('#wechat-status').textContent(), await copyButton.getAttribute('data-success'));
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard permission denied'));
    });
    await copyButton.click();
    await page.waitForFunction(() => document.getElementById('wechat-status').textContent
      === document.querySelector('[data-copy-wechat]').dataset.failure);
    results.interactions.push({ check: 'WeChat clipboard success and permission-denied message', status: 'passed' });

    const cataloguePaths = new Set();
    for (const language of ['es', 'en']) {
      await page.goto(`${base}/${language}/`, { waitUntil: 'networkidle' });
      for (const href of await page.locator('.catalog-link').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
        cataloguePaths.add(href);
      }
    }
    assert.equal(cataloguePaths.size, 4);
    for (const cataloguePath of cataloguePaths) {
      const response = await context.request.get(`${base}${cataloguePath}`);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /application\/pdf/);
      const content = await response.body();
      assert.equal(content.subarray(0, 5).toString(), '%PDF-');
      results.catalogues.push({ path: cataloguePath, bytes: content.length, status: 'passed' });
    }
    await context.close();
    writeFileSync(path.join(outputDirectory, 'browser.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(`${results.layouts.length} layout checks, ${results.interactions.length} interaction checks, and ${results.catalogues.length} catalogues passed.`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
