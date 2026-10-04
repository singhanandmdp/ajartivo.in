const express = require('express');
const path = require('path');
const fs = require('fs');
const sitemapService = require('./lib/sitemap-service');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;

// Dynamic Sitemap Endpoint (always serves freshest products)
app.get(['/sitemap.xml', '/sitemap'], async (req, res) => {
    try {
        const force = req.query.refresh === '1' || req.query.force === 'true';
        const xml = await sitemapService.getSitemapXml(force);
        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.header('Cache-Control', 'public, max-age=60, s-maxage=3600');
        res.send(xml);
    } catch (err) {
        console.error('[Server] Sitemap generation error:', err);
        res.status(500).send('Error generating sitemap');
    }
});

// Dynamic Image Sitemap Endpoint
app.get('/image-sitemap.xml', async (req, res) => {
    try {
        const force = req.query.refresh === '1' || req.query.force === 'true';
        const xml = await sitemapService.getImageSitemapXml(force);
        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.header('Cache-Control', 'public, max-age=60, s-maxage=3600');
        res.send(xml);
    } catch (err) {
        console.error('[Server] Image sitemap generation error:', err);
        res.status(500).send('Error generating image sitemap');
    }
});

// Sitemap Management API for instant refresh and statistics
app.get(['/api/sitemap/refresh', '/api/sitemap/invalidate'], async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    try {
        sitemapService.invalidateCache();
        await sitemapService.getSitemapXml(true);
        res.json({
            success: true,
            message: 'Sitemap refreshed successfully with latest products',
            stats: sitemapService.getStats()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/sitemap/status', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.json({
        success: true,
        stats: sitemapService.getStats()
    });
});

// Serve product.html for /product or /product/*
app.use((req, res, next) => {
    if (req.path === '/product' || req.path.startsWith('/product/')) {
        // If requesting static assets under product (like a file extension), pass through
        if (path.extname(req.path)) {
            return next();
        }
        const productHtmlPath = path.join(ROOT_DIR, 'product.html');
        if (fs.existsSync(productHtmlPath)) {
            return res.sendFile(productHtmlPath);
        }
    }
    next();
});

// Designs API endpoint fallback with CORS
app.get(['/designs', '/api/designs'], (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const designsPath = path.join(ROOT_DIR, 'designs.json');
    if (fs.existsSync(designsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(designsPath, 'utf8'));
            const limit = parseInt(req.query.limit, 10);
            if (!isNaN(limit) && limit > 0 && Array.isArray(data)) {
                return res.json(data.slice(0, limit));
            }
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to read designs' });
        }
    }
    res.json([]);
});

// Serve static assets with extension resolution (supports clean URLs like /about -> /about.html or /about/index.html)
app.use(express.static(ROOT_DIR, {
    extensions: ['html', 'htm'],
    index: ['index.html']
}));

// Route fallback for extensionless requests
app.use((req, res, next) => {
    const cleanPath = req.path.replace(/\/+$/, '');
    const candidateHtml = path.join(ROOT_DIR, `${cleanPath}.html`);
    const candidateIndex = path.join(ROOT_DIR, cleanPath, 'index.html');

    if (fs.existsSync(candidateHtml) && fs.statSync(candidateHtml).isFile()) {
        return res.sendFile(candidateHtml);
    }

    if (fs.existsSync(candidateIndex) && fs.statSync(candidateIndex).isFile()) {
        return res.sendFile(candidateIndex);
    }

    // Custom 404 page
    const notFoundHtml = path.join(ROOT_DIR, '404.html');
    if (fs.existsSync(notFoundHtml)) {
        return res.status(404).sendFile(notFoundHtml);
    }

    res.status(404).send('Page not found');
});

app.listen(PORT, HOST, () => {
    console.log(`AJartivo server running at http://${HOST}:${PORT}`);
    // Warm up and sync dynamic sitemap on server startup
    sitemapService.getSitemapXml(true).then((xml) => {
        console.log(`[Sitemap] Initialized with ${sitemapService.getStats().totalUrls} URLs (${sitemapService.getStats().productUrls} products)`);
    }).catch((err) => {
        console.warn('[Sitemap] Startup generation warning:', err.message);
    });
});
