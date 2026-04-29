const express = require('express')
const {
	createProxyMiddleware,
	responseInterceptor,
} = require('http-proxy-middleware')
const { HttpsProxyAgent } = require('https-proxy-agent')

const TARGET =
	'https://carryisalphadtf.click/HdpgKf?install={install}&bundle={bundle}'
const PORT = process.env.PORT || 3001
const PROXY_ORIGIN = process.env.PROXY_ORIGIN || `http://localhost:${PORT}`

const upstreamProxy = process.env.UPSTREAM_PROXY
const agent = upstreamProxy ? new HttpsProxyAgent(upstreamProxy) : undefined
if (upstreamProxy) console.log(` Using upstream proxy: ${upstreamProxy}`)

const app = express()

// CORS — allow PWA iframe to load content from this proxy
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Credentials', 'true')
	next()
})

function rewriteUrls(text) {
	return text
		.replace(/https:\/\/carryisalphadtf\.click/g, PROXY_ORIGIN)
		.replace(/http:\/\/carryisalphadtf\.click/g, PROXY_ORIGIN)
		.replace(
			/\/\/carryisalphadtf\.click/g,
			PROXY_ORIGIN.replace(/^https?:/, ''),
		)
		.replace(
			/wss:\/\/carryisalphadtf\.click/g,
			PROXY_ORIGIN.replace(/^http/, 'ws'),
		)
		.replace(
			/ws:\/\/carryisalphadtf\.click/g,
			PROXY_ORIGIN.replace(/^http/, 'ws'),
		)
}

const UA_SHIM = `<script>
(function() {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: function() {
        return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      }
    });

    window.chrome = { runtime: {} };

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = function() {
        return Promise.reject(new Error('SW blocked by wrapper'));
      };
    }

  } catch(e) {}
})();
</script>`

// Google OAuth — navigate the top PWA window to Google auth
// (redirect_uri is registered only for the real domain, not the proxy)
const GOOGLE_AUTH_SHIM = `<script>
(function() {
  function openViaTop(url) {
    var a = document.createElement('a');
    a.href = url;
    a.target = '_top';
    a.rel = 'noopener';
    document.body && document.body.appendChild(a);
    a.click();
    a.parentNode && a.parentNode.removeChild(a);
  }

  function isGoogleAuth(url) {
    return url && (
      url.includes('accounts.google.com') ||
      url.includes('google.com/o/oauth') ||
      url.includes('google.com/signin')
    );
  }

  document.addEventListener('click', function(e) {
    var el = e.target.closest('a');
    if (el && isGoogleAuth(el.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openViaTop(el.href);
    }
  }, true);

  var _open = window.open;
  window.open = function(url, target, features) {
    if (isGoogleAuth(url)) {
      openViaTop(url);
      return null;
    }
    return _open.call(this, url, target, features);
  };

  var _assign = location.assign.bind(location);
  var _replace = location.replace.bind(location);
  location.assign = function(url) {
    if (isGoogleAuth(url)) { openViaTop(url); return; }
    _assign(url);
  };
  location.replace = function(url) {
    if (isGoogleAuth(url)) { openViaTop(url); return; }
    _replace(url);
  };
})();
</script>`

const proxy = createProxyMiddleware({
	target: TARGET,
	changeOrigin: true,
	secure: false,
	ws: true,
	selfHandleResponse: true,
	agent,

	on: {
		proxyRes: responseInterceptor(
			async (responseBuffer, proxyRes, req, res) => {
				delete proxyRes.headers['x-frame-options']
				delete proxyRes.headers['content-security-policy']
				delete proxyRes.headers['content-security-policy-report-only']
				res.removeHeader('X-Frame-Options')
				res.removeHeader('Content-Security-Policy')
				res.removeHeader('Content-Security-Policy-Report-Only')

				if (proxyRes.headers['location']) {
					const rewritten = rewriteUrls(proxyRes.headers['location'])
					proxyRes.headers['location'] = rewritten
					res.setHeader('Location', rewritten)
				}

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
					body = body.replace(
						/<link[^>]*rel\s*=\s*["']?manifest["']?[^>]*\/?>/gi,
						'',
					)

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
			},
		),

		error: (err, req, res) => {
			console.error('Proxy error:', err.message)
			if (!res.headersSent) res.status(502).send('Proxy error: ' + err.message)
		},
	},
})

app.get('/manifest.json', (req, res) => res.status(404).end())
app.get('/manifest.webmanifest', (req, res) => res.status(404).end())

app.use('/', proxy)

const server = app.listen(PORT, '0.0.0.0', () => {
	console.log(`\n Proxy running on port ${PORT}`)
	console.log(` Forwarding → ${TARGET}`)
	console.log(` PROXY_ORIGIN = ${PROXY_ORIGIN}\n`)
})

server.on('upgrade', proxy.upgrade)
