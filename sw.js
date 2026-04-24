const CACHE_NAME = 'spwinera-pwa-v2'
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

	// Serve only our own shell assets from cache
	if (url.origin === self.location.origin) {
		event.respondWith(
			caches
				.match(event.request)
				.then(cached => cached || fetch(event.request)),
		)
	}
})
