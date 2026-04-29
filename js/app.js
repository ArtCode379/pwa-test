const webview = document.getElementById('webview')

webview.src = PROXY_URL

history.pushState(null, '', location.href)

webview.addEventListener('load', () => {
	history.pushState(null, '', location.href)
})

window.addEventListener('popstate', e => {
	e.preventDefault()

	try {
		webview.contentWindow.history.back()
	} catch (_) {
		// cross-origin: ignore SecurityError
	}

	history.pushState(null, '', location.href)
})

window.addEventListener('orientationchange', () => {
	webview.style.height = window.innerHeight + 'px'
	requestAnimationFrame(() => {
		webview.style.height = '100%'
	})
})

window.addEventListener('resize', () => {
	if (document.fullscreenElement === null) {
		webview.style.height = window.innerHeight + 'px'
		requestAnimationFrame(() => {
			webview.style.height = '100%'
		})
	}
})

if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('./sw.js')
		.catch(err => console.warn('SW registration failed:', err))
}
