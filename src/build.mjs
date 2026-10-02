import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(sourceDir);
const distDir = path.join(projectDir, 'dist');
const publicAssetsDir = path.join(projectDir, 'public/assets');
const template = await readFile(path.join(sourceDir, 'template.html'), 'utf8');
const products = JSON.parse(await readFile(path.join(sourceDir, 'data/products.json'), 'utf8'));
const locales = {
  en: JSON.parse(await readFile(path.join(sourceDir, 'locales/en.json'), 'utf8')),
  es: JSON.parse(await readFile(path.join(sourceDir, 'locales/es.json'), 'utf8'))
};
const pageUrls = {
  es: { lang: 'es-MX', url: 'https://gulaisolar.com/es/' },
  en: { lang: 'en', url: 'https://gulaisolar.com/en/' }
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const getValue = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);

const translate = (locale, key) => {
  const value = getValue(locales[locale], key);
  if (typeof value !== 'string') throw new Error(`Missing ${locale} translation: ${key}`);
  return value;
};

const whatsappUrl = (message) => `https://wa.me/8619569148825?text=${encodeURIComponent(message)}`;

const languageSwitch = (locale) => {
  const label = escapeHtml(translate(locale, 'nav.language'));
  const option = (code, href, lang) => {
    const active = code === locale;
    return `<a class="language-option${active ? ' active' : ''}" href="${href}" data-lang-target="${href}" lang="${lang}" hreflang="${lang}"${active ? ' aria-current="page"' : ''}>${code.toUpperCase()}</a>`;
  };
  return `<div class="language-switch" role="group" aria-label="${label}">${option('es', '/es/', 'es-MX')}<span aria-hidden="true">|</span>${option('en', '/en/', 'en')}</div>`;
};

const renderProducts = (locale) => products.categories.map((category) => {
  const families = category.familyKeys.map((key) => `<span>${escapeHtml(translate(locale, key))}</span>`).join('');
  const cards = category.items.map((item) => {
    const base = `products.cards.${item.id}`;
    return `<div class="catalog-item"><img src="${item.image}" alt="${escapeHtml(translate(locale, `${base}.alt`))}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async"><div><strong>${escapeHtml(translate(locale, `${base}.name`))}</strong><small>${escapeHtml(translate(locale, `${base}.description`))}</small></div></div>`;
  }).join('');
  const storageClass = category.id === 'storage' ? ' storage' : '';
  const catalogue = category.catalogues[locale];
  if (!catalogue) throw new Error(`Missing ${locale} catalogue path for ${category.id}`);
  return `<article class="category${storageClass}"><div class="category-top"><div><div class="category-id">${escapeHtml(translate(locale, 'products.categoryLabel'))} ${category.number}</div><h3>${escapeHtml(translate(locale, category.titleKey))}</h3><p class="category-copy">${escapeHtml(translate(locale, category.copyKey))}</p><div class="category-actions"><a class="nav-cta" href="${whatsappUrl(translate(locale, category.whatsappKey))}" target="_blank" rel="noopener">${escapeHtml(translate(locale, category.ctaKey))}</a><a class="catalog-link" href="${catalogue}" target="_blank" rel="noopener">${escapeHtml(translate(locale, 'products.catalogueCta'))}</a></div></div><div class="family-list">${families}</div></div><div class="catalog-grid">${cards}</div></article>`;
}).join('');

const renderPage = (locale) => {
  const extras = {
    lang: pageUrls[locale].lang,
    canonical: pageUrls[locale].url,
    hreflang_html: Object.values(pageUrls).map(({ lang, url }) =>
      `<link rel="alternate" hreflang="${lang}" href="${url}">`
    ).join('\n  '),
    language_switch_html: languageSwitch(locale),
    products_html: renderProducts(locale),
    hero_whatsapp_url: whatsappUrl(translate(locale, 'whatsapp.hero')),
    contact_whatsapp_url: whatsappUrl(translate(locale, 'whatsapp.contact'))
  };

  const html = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (Object.hasOwn(extras, key)) return extras[key];
    return escapeHtml(translate(locale, key));
  });

  if (/\{\{[^}]+\}\}/.test(html)) throw new Error(`Unresolved template value in ${locale} page`);
  return html;
};

// Validate both locales and render pages before replacing the previous build.
const spanishPage = renderPage('es');
const englishPage = renderPage('en');
// Read permanent assets before clearing generated output, so a missing source
// directory cannot accidentally discard the last working build.
await readFile(path.join(publicAssetsDir, 'favicon.png'));
await rm(distDir, { recursive: true, force: true });
await cp(publicAssetsDir, path.join(distDir, 'assets'), { recursive: true });
await mkdir(path.join(distDir, 'es'), { recursive: true });
await mkdir(path.join(distDir, 'en'), { recursive: true });
await copyFile(path.join(sourceDir, 'site.css'), path.join(distDir, 'assets/site.css'));
await copyFile(path.join(sourceDir, 'site.js'), path.join(distDir, 'assets/site.js'));
await writeFile(path.join(distDir, 'index.html'), spanishPage);
await writeFile(path.join(distDir, 'es/index.html'), spanishPage);
await writeFile(path.join(distDir, 'en/index.html'), englishPage);
await writeFile(path.join(distDir, 'robots.txt'),
  'User-agent: *\nAllow: /\nSitemap: https://gulaisolar.com/sitemap.xml\n');
await writeFile(path.join(distDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.values(pageUrls).map(({ url }) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);

console.log('Built /, /es/, /en/, robots.txt, and sitemap.xml from shared source, product data, and locale files.');
