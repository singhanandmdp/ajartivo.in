const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlmyjnslyijgdrfuktun.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_VZYzXaf0npSI8sdhgsIFjQ_1i-SMZY6';
const SITE_URL = (process.env.SITE_URL || 'https://www.ajartivo.in').replace(/\/+$/, '');
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

let cachedSitemapXml = null;
let cachedImageSitemapXml = null;
let lastGeneratedAt = 0;
let inflightPromise = null;
let sitemapStats = {
    totalUrls: 0,
    productUrls: 0,
    staticUrls: 0,
    lastGenerated: null
};

// Static public pages
const STATIC_ROUTES = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/product', priority: '0.9', changefreq: 'daily' },
    { path: '/premium', priority: '0.8', changefreq: 'weekly' },
    { path: '/about', priority: '0.7', changefreq: 'monthly' },
    { path: '/tools/image-resizer', priority: '0.8', changefreq: 'weekly' },
    { path: '/tools/image-converter', priority: '0.8', changefreq: 'weekly' },
    { path: '/tools/aj-colour-converter', priority: '0.7', changefreq: 'monthly' },
    { path: '/tools/aj-pixel-cut', priority: '0.7', changefreq: 'monthly' },
    { path: '/tools/aj-pixel-enhancer', priority: '0.7', changefreq: 'monthly' },
    { path: '/tools/aj-print-layout-pro', priority: '0.7', changefreq: 'monthly' },
    { path: '/terms', priority: '0.5', changefreq: 'monthly' },
    { path: '/privacy', priority: '0.5', changefreq: 'monthly' },
    { path: '/refund', priority: '0.5', changefreq: 'monthly' }
];

function escapeXml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatDate(dateInput) {
    if (!dateInput) return new Date().toISOString().split('T')[0];
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) {
            return new Date().toISOString().split('T')[0];
        }
        return d.toISOString().split('T')[0];
    } catch {
        return new Date().toISOString().split('T')[0];
    }
}

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'product';
}

/**
 * Fetch designs from Supabase with graceful fallback to local designs.json
 */
async function fetchAllDesigns() {
    let designs = [];

    // 1. Fetch from live Supabase
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/designs?select=id,title,slug,created_at,image_url,category,description&order=created_at.desc`,
            {
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                },
                signal: controller.signal
            }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                designs = data;
            }
        } else {
            console.warn(`[Sitemap] Supabase responded with status ${response.status}`);
        }
    } catch (err) {
        console.warn('[Sitemap] Failed to fetch designs from Supabase:', err.message);
    }

    // 2. Read local designs.json for any extra fallback items
    const designsPath = path.join(__dirname, '..', 'designs.json');
    if (fs.existsSync(designsPath)) {
        try {
            const localRaw = fs.readFileSync(designsPath, 'utf8');
            const localData = JSON.parse(localRaw);
            if (Array.isArray(localData)) {
                const existingSlugs = new Set(designs.map(d => d.slug || slugify(d.title || d.name)));
                for (const item of localData) {
                    const fallbackSlug = slugify(item.name || item.title);
                    if (!existingSlugs.has(fallbackSlug)) {
                        designs.push({
                            id: item.id || fallbackSlug,
                            title: item.name || item.title,
                            slug: fallbackSlug,
                            image_url: item.image,
                            category: item.type,
                            created_at: new Date().toISOString()
                        });
                        existingSlugs.add(fallbackSlug);
                    }
                }
            }
        } catch (e) {
            console.warn('[Sitemap] Failed reading designs.json fallback:', e.message);
        }
    }

    return designs;
}

/**
 * Generate standard XML sitemap (with Google image extensions)
 */
function buildSitemapXml(designs) {
    const urls = [];

    // Static pages
    for (const route of STATIC_ROUTES) {
        urls.push(`  <url>
    <loc>${escapeXml(`${SITE_URL}${route.path}`)}</loc>
    <lastmod>${formatDate()}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`);
    }

    // Dynamic products
    for (const design of designs) {
        const slug = design.slug || slugify(design.title || design.name || design.id);
        const productUrl = `${SITE_URL}/product/${encodeURIComponent(slug)}`;
        const lastMod = formatDate(design.updated_at || design.created_at);

        let imageBlock = '';
        if (design.image_url) {
            const imgLoc = design.image_url.startsWith('http')
                ? design.image_url
                : `${SITE_URL}/${design.image_url.replace(/^\/+/, '')}`;
            const imgTitle = design.title || design.name || 'AJartivo Design Asset';
            const imgCaption = design.description || `${imgTitle} - High Quality Vector & Graphic Design File on AJartivo`;

            imageBlock = `
    <image:image>
      <image:loc>${escapeXml(imgLoc)}</image:loc>
      <image:title>${escapeXml(imgTitle)}</image:title>
      <image:caption>${escapeXml(imgCaption)}</image:caption>
    </image:image>`;
        }

        urls.push(`  <url>
    <loc>${escapeXml(productUrl)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${imageBlock}
  </url>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
}

/**
 * Generate dedicated Image Sitemap
 */
function buildImageSitemapXml(designs) {
    const urls = [];

    for (const design of designs) {
        if (!design.image_url) continue;

        const slug = design.slug || slugify(design.title || design.name || design.id);
        const productUrl = `${SITE_URL}/product/${encodeURIComponent(slug)}`;
        const imgLoc = design.image_url.startsWith('http')
            ? design.image_url
            : `${SITE_URL}/${design.image_url.replace(/^\/+/, '')}`;
        const imgTitle = design.title || design.name || 'AJartivo Graphic Design Asset';
        const imgCaption = design.description || `${imgTitle} - Instant Download on AJartivo`;

        urls.push(`  <url>
    <loc>${escapeXml(productUrl)}</loc>
    <image:image>
      <image:loc>${escapeXml(imgLoc)}</image:loc>
      <image:title>${escapeXml(imgTitle)}</image:title>
      <image:caption>${escapeXml(imgCaption)}</image:caption>
    </image:image>
  </url>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
}

/**
 * Generate or get cached sitemaps
 */
async function getSitemapXml(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && cachedSitemapXml && now - lastGeneratedAt < CACHE_TTL_MS) {
        return cachedSitemapXml;
    }

    if (inflightPromise) {
        return inflightPromise;
    }

    inflightPromise = (async () => {
        try {
            const designs = await fetchAllDesigns();
            const xml = buildSitemapXml(designs);
            const imageXml = buildImageSitemapXml(designs);

            cachedSitemapXml = xml;
            cachedImageSitemapXml = imageXml;
            lastGeneratedAt = Date.now();

            sitemapStats = {
                totalUrls: STATIC_ROUTES.length + designs.length,
                productUrls: designs.length,
                staticUrls: STATIC_ROUTES.length,
                lastGenerated: new Date().toISOString()
            };

            // Also persist to sitemap.xml on disk as static fallback
            try {
                const diskPath = path.join(__dirname, '..', 'sitemap.xml');
                fs.writeFileSync(diskPath, xml, 'utf8');
            } catch (err) {
                console.warn('[Sitemap] Could not write to disk:', err.message);
            }

            return xml;
        } finally {
            inflightPromise = null;
        }
    })();

    return inflightPromise;
}

async function getImageSitemapXml(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedImageSitemapXml && now - lastGeneratedAt < CACHE_TTL_MS) {
        return cachedImageSitemapXml;
    }
    await getSitemapXml(forceRefresh);
    return cachedImageSitemapXml;
}

function invalidateCache() {
    cachedSitemapXml = null;
    cachedImageSitemapXml = null;
    lastGeneratedAt = 0;
}

function getStats() {
    return {
        ...sitemapStats,
        cacheAgeMs: Date.now() - lastGeneratedAt,
        cacheTtlMs: CACHE_TTL_MS
    };
}

module.exports = {
    getSitemapXml,
    getImageSitemapXml,
    invalidateCache,
    getStats
};
