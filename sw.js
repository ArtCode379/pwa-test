const CACHE_NAME = 'spwinera-pwa-v3'
const SHELL_ASSETS = [
	'./',
	'./index.html',
	'./manifest.json',
	'./css/style.css',
	'./js/config.js',
	'./js/app.js',
	'./icons/icon.png',
]

self.addEventListener('install', event => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then(cache => cache.addAll(SHELL_ASSETS))
			.then(() => self.skipWaiting()),
	)
})

self.addEventListener('activate', event => {
	event.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)),
				),
			)
			.then(() => self.clients.claim()),
	)
})

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url)

	if (url.hostname.includes('ngrok')) {
		event.respondWith(
			fetch(url.toString(), {
				method: event.request.method,
				headers: new Headers({
					...Object.fromEntries(event.request.headers.entries()),
					'ngrok-skip-browser-warning': '1',
				}),
				credentials: 'include',
				redirect: 'follow',
			}),
		)
		return
	}

	if (url.origin === self.location.origin) {
		event.respondWith(
			caches
				.match(event.request)
				.then(cached => cached || fetch(event.request)),
		)
	}
})
