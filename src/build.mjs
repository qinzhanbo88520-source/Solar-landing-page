import { cp, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

// Read catalogue sizes before replacing the current build. Missing PDF files
// fail the build instead of publishing an incomplete download section.
const catalogueSizes = new Map();
for (const category of products.categories) {
  for (const locale of Object.keys(pageUrls)) {
    for (const reference of [category.catalogues[locale], category.cataloguePreviews[locale]]) {
      if (!reference?.startsWith('/assets/') || reference.includes('..')) {
        throw new Error(`Invalid ${locale} catalogue path for ${category.id}`);
      }
      const relative = new URL(reference, 'https://gulaisolar.com').pathname.slice('/assets/'.length);
      const file = path.join(publicAssetsDir, relative);
      const content = await readFile(file);
      if (content.subarray(0, 5).toString() !== '%PDF-') throw new Error(`Invalid PDF: ${relative}`);
      catalogueSizes.set(reference, (await stat(file)).size);
    }
  }
}

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

const catalogueDetails = (locale, reference, pages) => {
  const bytes = catalogueSizes.get(reference);
  const unit = bytes >= 1_000_000 ? 'MB' : 'KB';
  const size = new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en', {
    maximumFractionDigits: unit === 'MB' ? 1 : 0
  }).format(bytes / (unit === 'MB' ? 1_000_000 : 1_000));
  return escapeHtml(`PDF · ${pages} ${translate(locale, 'products.pagesLabel')} · ${size} ${unit}`);
};

const structuredData = (locale) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://gulaisolar.com/#organization',
      name: 'GULAI',
      url: 'https://gulaisolar.com/',
      logo: 'https://gulaisolar.com/assets/gulivo-logo.webp',
      brand: { '@type': 'Brand', name: 'Gulivo' },
      email: 'qinzhanbo885220@gmail.com',
      telephone: '+86 195 6914 8825',
      address: {
        '@type': 'PostalAddress',
        streetAddress: translate(locale, 'contact.headquartersValue'),
        addressLocality: 'Shenzhen',
        addressRegion: 'Guangdong',
        addressCountry: 'CN'
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'sales',
        telephone: '+86 195 6914 8825',
        email: 'qinzhanbo885220@gmail.com',
        availableLanguage: ['es', 'en'],
        areaServed: { '@type': 'Country', name: 'Mexico' }
      },
      sameAs: [
        'https://www.linkedin.com/in/gulaisolar',
        'https://www.facebook.com/profile.php?id=61593365322162',
        'https://www.instagram.com/qinqin9681/',
        'https://www.tiktok.com/@gulaisolarfactory'
      ]
    },
    {
      '@type': 'WebSite',
      '@id': 'https://gulaisolar.com/#website',
      name: 'GULAI',
      url: 'https://gulaisolar.com/',
      inLanguage: ['es-MX', 'en'],
      publisher: { '@id': 'https://gulaisolar.com/#organization' }
    },
    {
      '@type': 'WebPage',
      '@id': `${pageUrls[locale].url}#webpage`,
      url: pageUrls[locale].url,
      name: translate(locale, 'seo.title'),
      description: translate(locale, 'seo.description'),
      inLanguage: pageUrls[locale].lang,
      isPartOf: { '@id': 'https://gulaisolar.com/#website' },
      about: { '@id': 'https://gulaisolar.com/#organization' }
    }
  ]
}).replaceAll('<', '\\u003c');

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
    return `<div class="catalog-item${item.id === 'landscape' ? ' catalog-item-landscape' : ''}"><div class="catalog-image"><img src="${item.image}" alt="${escapeHtml(translate(locale, `${base}.alt`))}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async"></div><div class="catalog-caption"><strong>${escapeHtml(translate(locale, `${base}.name`))}</strong><small>${escapeHtml(translate(locale, `${base}.description`))}</small></div></div>`;
  }).join('');
  const storageClass = category.id === 'storage' ? ' storage' : '';
  const catalogue = category.catalogues[locale];
  const preview = category.cataloguePreviews[locale];
  if (!catalogue) throw new Error(`Missing ${locale} catalogue path for ${category.id}`);
  const title = escapeHtml(translate(locale, category.titleKey));
  const previewLabel = escapeHtml(translate(locale, 'products.previewCta'));
  const catalogueLabel = escapeHtml(translate(locale, 'products.catalogueCta'));
  const links = `<div class="catalogue-options"><a class="catalog-link catalog-preview" href="${preview}" target="_blank" rel="noopener" aria-label="${previewLabel}: ${title}"><span>${previewLabel}</span><small>${catalogueDetails(locale, preview, category.previewPages)}</small></a><a class="catalog-link" href="${catalogue}" target="_blank" rel="noopener" aria-label="${catalogueLabel}: ${title}"><span>${catalogueLabel}</span><small>${catalogueDetails(locale, catalogue, category.cataloguePages)}</small></a></div>`;
  return `<article class="category${storageClass}"><div class="category-top"><div><div class="category-id">${escapeHtml(translate(locale, 'products.categoryLabel'))} ${category.number}</div><h3>${title}</h3><p class="category-copy">${escapeHtml(translate(locale, category.copyKey))}</p><div class="category-actions"><a class="nav-cta" href="${whatsappUrl(translate(locale, category.whatsappKey))}" target="_blank" rel="noopener">${escapeHtml(translate(locale, category.ctaKey))}</a></div>${links}</div><div class="family-list">${families}</div></div><div class="catalog-grid">${cards}</div></article>`;
}).join('');

const renderPage = (locale) => {
  const extras = {
    lang: pageUrls[locale].lang,
    canonical: pageUrls[locale].url,
    og_locale: locale === 'es' ? 'es_MX' : 'en_US',
    og_alternate_locale: locale === 'es' ? 'en_US' : 'es_MX',
    structured_data_json: structuredData(locale),
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
