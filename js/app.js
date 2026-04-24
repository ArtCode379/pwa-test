const TARGET_URL = 'https://slotcity.ua/'

// Register Service Worker
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('./sw.js')
		.catch(err => console.warn('SW registration failed:', err))
}

// Redirect to target URL inside the PWA standalone window
window.location.replace(TARGET_URL)
