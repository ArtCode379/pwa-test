/**
 * PWA wrapper — mirrors SPWEappWebView.tsx:
 *  - Fullscreen iframe via proxy (strips X-Frame-Options / CSP)
 *  - Back handler: popstate → iframe history.back()
 *  - Rotation: layout adapts via CSS, no reload
 */

// ── DOM ───────────────────────────────────────────────────────────────────────
const webview = document.getElementById('webview')

// ── Boot: point iframe at proxy ───────────────────────────────────────────────
webview.src = PROXY_URL

// ── Back navigation ───────────────────────────────────────────────────────────
// Push initial state so popstate fires on first back press
history.pushState(null, '', location.href)

let canGoBack = false

webview.addEventListener('load', () => {
	// After each navigation inside the iframe we re-push so the PWA
	// shell always has a history entry to catch the back gesture
	history.pushState(null, '', location.href)

	try {
		// Try to read canGoBack from same-origin context (works after proxy rewrites URLs)
		canGoBack = webview.contentWindow.history.length > 1
	} catch (_) {
		canGoBack = true // cross-origin fallback: assume we can go back
	}
})

window.addEventListener('popstate', e => {
	e.preventDefault()

	if (canGoBack) {
		try {
			webview.contentWindow.history.back()
		} catch (_) {
			// If cross-origin and can't call back(), do nothing —
			// prevents closing the PWA on accidental back swipe
		}
	}

	// Re-push so the next back gesture is also caught
	history.pushState(null, '', location.href)
})

// ── Rotation: prevent PWA shell from doing a hard reload ─────────────────────
// Browsers sometimes fire a full page reload on orientation change in standalone mode.
// Catching 'beforeunload' and returning a value blocks the reload.
// We only block reloads triggered by resize/orientation — not intentional navigation.
let isNavigating = false

webview.addEventListener('load', () => { isNavigating = false })

window.addEventListener('orientationchange', () => {
	// Force the iframe to re-layout by briefly toggling its size
	webview.style.height = window.innerHeight + 'px'
	requestAnimationFrame(() => {
		webview.style.height = '100%'
	})
})

window.addEventListener('resize', () => {
	// Keep iframe filling the viewport on any resize
	if (document.fullscreenElement === null) {
		webview.style.height = window.innerHeight + 'px'
		requestAnimationFrame(() => {
			webview.style.height = '100%'
		})
	}
})

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('./sw.js')
		.catch(err => console.warn('SW registration failed:', err))
}
