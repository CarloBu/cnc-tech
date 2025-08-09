let preloaderHasExited = false;

export function triggerPreloaderExit() {
	if (preloaderHasExited) {
		return;
	}

	const preloaderOverlay = document.getElementById('preloader-overlay');
	if (!preloaderOverlay) {
		try {
			// Mark sticky trigger for late listeners
			window.__lottieTriggersFired = window.__lottieTriggersFired || {};
			window.__lottieTriggersFired['preloader:reveal'] = true;
		} catch (_) {}
		preloaderHasExited = true;
		return;
	}

	preloaderOverlay.classList.add('preloader-exit');

	const preloaderCounter = document.getElementById('preloader-counter');
	const inlineLoaderPlaceholder = document.getElementById('inline-loader-placeholder');
	if (preloaderCounter) {
		setTimeout(() => {
			try {
				preloaderCounter.remove();
			} catch (_) {}
			try {
				inlineLoaderPlaceholder && inlineLoaderPlaceholder.remove();
			} catch (_) {}
		}, 10);
	}

	setTimeout(() => {
		if (preloaderOverlay.parentNode) {
			preloaderOverlay.parentNode.removeChild(preloaderOverlay);
		}
		preloaderHasExited = true;
	}, 3367);

	try {
		// Mark sticky trigger for late listeners
		window.__lottieTriggersFired = window.__lottieTriggersFired || {};
		window.__lottieTriggersFired['preloader:reveal'] = true;
		const event = new Event('preloader:reveal');
		window.dispatchEvent(event);
	} catch (_) {}
}

export function startPreloaderCounter() {
	const durationMs = 500;
	const preloaderOverlay = document.getElementById('preloader-overlay');
	const preloaderCounter = document.getElementById('preloader-counter');

	if (!preloaderOverlay || !preloaderCounter) {
		triggerPreloaderExit();
		return;
	}

	let animationFrameId = 0;
	let animationStartTime = 0;

	const updateCounter = (timestamp) => {
		if (!animationStartTime) {
			animationStartTime = timestamp;
		}

		const elapsedMs = timestamp - animationStartTime;
		const progress = Math.min(1, elapsedMs / durationMs);
		const percent = Math.floor(progress * 100);
		preloaderCounter.textContent = `${percent}%`;

		if (progress < 1) {
			animationFrameId = requestAnimationFrame(updateCounter);
			return;
		}

		preloaderCounter.textContent = '100%';
		cancelAnimationFrame(animationFrameId);

		triggerPreloaderExit();
	};

	preloaderCounter.textContent = '0%';
	animationFrameId = requestAnimationFrame(updateCounter);

	// Safety: if overlay disappears early, stop the animation
	const observer = new MutationObserver(() => {
		if (!document.body.contains(preloaderOverlay)) {
			cancelAnimationFrame(animationFrameId);
			observer.disconnect();
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
}
