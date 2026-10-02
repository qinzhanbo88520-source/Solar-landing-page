import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
let fixture;

before(async () => {
  fixture = await mkdtemp(path.join(tmpdir(), 'gulai-build-test-'));
  await cp(path.join(projectRoot, 'src'), path.join(fixture, 'src'), { recursive: true });
  await cp(path.join(projectRoot, 'public'), path.join(fixture, 'public'), { recursive: true });
});

after(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

function build() {
  return spawnSync(process.execPath, ['src/build.mjs'], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 20_000
  });
}

function expectSuccessfulBuild() {
  const result = build();
  assert.equal(result.status, 0, result.stderr || String(result.error || 'Build failed'));
}

async function fingerprint(directory) {
  const files = {};
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else files[path.relative(directory, target)] = createHash('sha256')
        .update(await readFile(target)).digest('hex');
    }
  }
  await walk(directory);
  return files;
}

test('a clean checkout builds complete Spanish and English pages with original assets', async () => {
  expectSuccessfulBuild();
  const dist = path.join(fixture, 'dist');
  const references = new Set();

  for (const [language, htmlLanguage] of [['es', 'es-MX'], ['en', 'en']]) {
    const html = await readFile(path.join(dist, language, 'index.html'), 'utf8');
    assert.ok(html.includes(`<html lang="${htmlLanguage}">`));
    assert.ok(html.includes(`rel="canonical" href="https://gulaisolar.com/${language}/"`));
    assert.ok(html.includes('hreflang="es-MX"'));
    assert.ok(html.includes('hreflang="en"'));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.includes('https://wa.me/8619569148825?text='));
    assert.ok(html.includes('class="skip-link"'));
    assert.ok(html.includes('name="gulai-release" content="28"'));
    assert.ok(html.includes('property="og:url" content="https://gulaisolar.com/' + language + '/"'));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    assert.equal((html.match(/class="catalog-link catalog-preview"/g) || []).length, 2);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
    assert.equal(structured['@context'], 'https://schema.org');
    const organization = structured['@graph'].find(item => item['@type'] === 'Organization');
    assert.equal(organization.name, 'GULAI');
    assert.equal(organization.brand.name, 'Gulivo');
    assert.equal(organization.address.addressCountry, 'CN');
    assert.equal(organization.contactPoint.telephone, '+86 195 6914 8825');
    const page = structured['@graph'].find(item => item['@type'] === 'WebPage');
    assert.equal(page.inLanguage, htmlLanguage);
    assert.equal(page.url, `https://gulaisolar.com/${language}/`);
    if (language === 'en') {
      assert.ok(html.includes('Garden &amp; Post Lights'));
      assert.ok(!html.includes('Garden &amp; Capital Lights'));
    }
    assert.doesNotMatch(html, /\{\{[^}]+\}\}/);
    for (const [, reference] of html.matchAll(/(?:href|src|srcset)="([^" ]+)"/g)) {
      if (reference.startsWith('/assets/')) references.add(reference);
    }
  }

  assert.equal(await readFile(path.join(dist, 'index.html'), 'utf8'),
    await readFile(path.join(dist, 'es/index.html'), 'utf8'));

  const css = await readFile(path.join(dist, 'assets/site.css'), 'utf8');
  for (const [, reference] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (reference.startsWith('/assets/')) references.add(reference);
  }
  assert.ok(references.size > 20, 'The test must cover images, fonts and catalogues');
  for (const reference of references) {
    const assetPath = new URL(reference, 'https://gulaisolar.com').pathname.slice(1);
    const data = await readFile(path.join(dist, assetPath));
    assert.ok(data.length > 0, `Empty asset: ${reference}`);
    if (assetPath.endsWith('.pdf')) assert.equal(data.subarray(0, 5).toString(), '%PDF-');
  }

  const originalAssets = await fingerprint(path.join(fixture, 'public/assets'));
  const generatedAssets = await fingerprint(path.join(dist, 'assets'));
  for (const [name, checksum] of Object.entries(originalAssets)) {
    assert.equal(generatedAssets[name], checksum, `Changed original asset: ${name}`);
  }
  const previews = JSON.parse(await readFile(path.join(dist, 'assets/previews/manifest.json'), 'utf8'));
  assert.equal(previews.length, 4);
  for (const preview of previews) {
    assert.equal(originalAssets[preview.source], preview.sourceSha256);
    assert.equal(originalAssets[preview.preview], preview.previewSha256);
    assert.equal((await readFile(path.join(dist, 'assets', preview.preview))).length, preview.previewBytes);
    assert.ok(preview.previewBytes < preview.sourceBytes * 0.35);
    assert.equal(preview.sourcePages.length, preview.category === 'solar' ? 7 : 3);
  }
  assert.match(await readFile(path.join(dist, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/gulaisolar\.com\/sitemap\.xml/);
  assert.match(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'), /https:\/\/gulaisolar\.com\/en\//);
});

test('a missing catalogue fails without discarding the last successful build', async () => {
  expectSuccessfulBuild();
  const dist = path.join(fixture, 'dist');
  const expected = await fingerprint(dist);
  const previewPath = path.join(fixture, 'public/assets/previews/solar-lighting-es-preview.pdf');
  const original = await readFile(previewPath);
  await rm(previewPath);
  try {
    const result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /solar-lighting-es-preview\.pdf/);
    assert.deepEqual(await fingerprint(dist), expected);
  } finally {
    await writeFile(previewPath, original);
  }
});

test('rebuilding is deterministic and removes stale generated output', async () => {
  expectSuccessfulBuild();
  const dist = path.join(fixture, 'dist');
  const expected = await fingerprint(dist);
  await writeFile(path.join(dist, 'obsolete-page.html'), 'old output');
  expectSuccessfulBuild();
  assert.deepEqual(await fingerprint(dist), expected);
});

test('a missing translation fails without replacing the last successful build', async () => {
  expectSuccessfulBuild();
  const dist = path.join(fixture, 'dist');
  const expected = await fingerprint(dist);
  const localePath = path.join(fixture, 'src/locales/es.json');
  const original = await readFile(localePath, 'utf8');
  const locale = JSON.parse(original);
  delete locale.nav.skipContent;
  await writeFile(localePath, JSON.stringify(locale));
  try {
    const result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing es translation: nav\.skipContent/);
    assert.deepEqual(await fingerprint(dist), expected);
  } finally {
    await writeFile(localePath, original);
  }
});
