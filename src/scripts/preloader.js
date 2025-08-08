export function triggerPreloaderExit() {
	const preloaderOverlay = document.getElementById('preloader-overlay');
	if (preloaderOverlay) {
		const preloaderCounter = document.getElementById('preloader-counter');
		if (preloaderCounter) {
			preloaderCounter.remove();
		}

		preloaderOverlay.classList.add('preloader-exit');

		setTimeout(() => {
			if (preloaderOverlay.parentNode) {
				preloaderOverlay.parentNode.removeChild(preloaderOverlay);
			}
		}, 3367);
	}
}
