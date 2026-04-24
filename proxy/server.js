/**
 * Proxy server — strips iframe-blocking headers from slotcity.ua.
 *
 * Deploy to Railway:
 *  1. Push this repo to GitHub
 *  2. New Railway project → Deploy from GitHub → Root Directory: proxy
 *  3. Add env var: PROXY_ORIGIN = https://your-service.up.railway.app
 *  4. Copy the Railway URL → paste into PWA_App/js/config.js
 */

const express = require('express')
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware')

const TARGET      = 'https://slotcity.ua'
const PORT        = process.env.PORT || 3001
const PROXY_ORIGIN = process.env.PROXY_ORIGIN || `http://localhost:${PORT}`

const app = express()

// CORS — allow PWA iframe to load content from this proxy
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Credentials', 'true')
	next()
})

// ── URL rewriter ──────────────────────────────────────────────────────────────
function rewriteUrls(text) {
	return text
		.replace(/https:\/\/slotcity\.ua/g, PROXY_ORIGIN)
		.replace(/http:\/\/slotcity\.ua/g,  PROXY_ORIGIN)
		.replace(/\/\/slotcity\.ua/g,        PROXY_ORIGIN.replace(/^https?:/, ''))
		.replace(/wss:\/\/slotcity\.ua/g,   PROXY_ORIGIN.replace(/^http/, 'ws'))
		.replace(/ws:\/\/slotcity\.ua/g,    PROXY_ORIGIN.replace(/^http/, 'ws'))
}

// ── iOS UA + chrome shim (mirrors SPWEappWebView injectedJavaScript) ──────────
const UA_SHIM = `<script>
(function() {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: function() {
        return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      }
    });
    window.chrome = { runtime: {} };
    if (window.webkit && window.webkit.messageHandlers) {
      try { delete window.webkit.messageHandlers; } catch(e) {}
    }
  } catch(e) {}
})();
</script>`

// ── Google OAuth: open in new tab (redirect_uri is locked to slotcity.ua) ────
const GOOGLE_AUTH_SHIM = `<script>
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href*="accounts.google.com"], a[href*="google.com/o/oauth"]');
    if (el) { e.preventDefault(); window.open(el.href, '_blank'); }
  }, true);
})();
</script>`

// ── Proxy ─────────────────────────────────────────────────────────────────────
const proxy = createProxyMiddleware({
	target: TARGET,
	changeOrigin: true,
	secure: false,
	ws: true,
	selfHandleResponse: true,

	on: {
		proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
			// Strip iframe-blocking headers
			delete proxyRes.headers['x-frame-options']
			delete proxyRes.headers['content-security-policy']
			delete proxyRes.headers['content-security-policy-report-only']
			res.removeHeader('X-Frame-Options')
			res.removeHeader('Content-Security-Policy')
			res.removeHeader('Content-Security-Policy-Report-Only')

			// Rewrite Location header so redirects stay inside the proxy
			if (proxyRes.headers['location']) {
				const rewritten = rewriteUrls(proxyRes.headers['location'])
				proxyRes.headers['location'] = rewritten
				res.setHeader('Location', rewritten)
			}

			// Strip domain from Set-Cookie so cookies work on proxy origin
			if (proxyRes.headers['set-cookie']) {
				const cookies = Array.isArray(proxyRes.headers['set-cookie'])
					? proxyRes.headers['set-cookie']
					: [proxyRes.headers['set-cookie']]
				const rewritten = cookies.map(c =>
					c.replace(/;\s*domain=[^;]*/gi, '').replace(/;\s*secure/gi, ''),
				)
				proxyRes.headers['set-cookie'] = rewritten
				res.setHeader('Set-Cookie', rewritten)
			}

			const contentType = proxyRes.headers['content-type'] || ''
			const isText =
				contentType.includes('text/') ||
				contentType.includes('javascript') ||
				contentType.includes('json') ||
				contentType.includes('xml')

			if (!isText) return responseBuffer

			let body = responseBuffer.toString('utf8')
			body = rewriteUrls(body)

			if (contentType.includes('text/html')) {
				const inject = UA_SHIM + GOOGLE_AUTH_SHIM
				if (body.includes('<head>')) {
					body = body.replace('<head>', '<head>' + inject)
				} else if (body.includes('<html')) {
					body = body.replace(/<html[^>]*>/, m => m + inject)
				} else {
					body = inject + body
				}
			}

			return Buffer.from(body, 'utf8')
		}),

		error: (err, req, res) => {
			console.error('Proxy error:', err.message)
			if (!res.headersSent) res.status(502).send('Proxy error: ' + err.message)
		},
	},
})

app.use('/', proxy)

const server = app.listen(PORT, '0.0.0.0', () => {
	console.log(`\n Proxy running on port ${PORT}`)
	console.log(` Forwarding → ${TARGET}`)
	console.log(` PROXY_ORIGIN = ${PROXY_ORIGIN}\n`)
})

server.on('upgrade', proxy.upgrade)
