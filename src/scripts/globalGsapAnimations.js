import { gsap } from 'gsap';

// Wait for element helper
const waitForElement = (selector, callback) => {
	const element = document.querySelector(selector);
	if (element) {
		callback(element);
	} else {
		setTimeout(() => waitForElement(selector, callback), 100);
	}
};

// CNC Logo Reveal Animation
export function initCncLogoReveal() {
	gsap.defaults({
		ease: 'steps(1, end)',
		duration: 0.1,
	});
	waitForElement('#cnc-logo', (cncLogo) => {
		gsap.set(cncLogo, { opacity: 0 });

		const tl = gsap.timeline();
		tl.to(cncLogo, { duration: 2.4 })
			.to(cncLogo, { opacity: 1 })
			.to(cncLogo, { opacity: 0 })
			.to(cncLogo, { opacity: 1 })
			.to(cncLogo, { opacity: 0 })
			.to(cncLogo, { opacity: 1 });
	});
}

// Background CNC Letters Scroll Animation
let bgLettersScrollHandler = null;

export function initBgCncLettersScrollAnimation(lenisManager) {
	waitForElement('#bg-cnc-letters', (bgCncLetters) => {
		gsap.set(bgCncLetters, { opacity: 1 });

		bgLettersScrollHandler = (scrollPosition) => {
			const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
			const scrollPercent = (scrollPosition / scrollHeight) * 100;

			let opacity = 1;

			if (scrollPercent <= 10) {
				opacity = 1;
			} else if (scrollPercent <= 20) {
				const fadeProgress = (scrollPercent - 10) / 10;
				opacity = 1 - fadeProgress;
			} else {
				opacity = 0;
			}

			gsap.set(bgCncLetters, { opacity });
		};

		if (lenisManager) {
			lenisManager.onScroll(bgLettersScrollHandler);

			bgLettersScrollHandler(lenisManager.scroll);
		}
	});
}

// Init all animations
export function initGlobalGsapAnimations(lenisManager = null) {
	initCncLogoReveal();
	initBgCncLettersScrollAnimation(lenisManager);
}

// Cleanup all animations
export function cleanupGlobalGsapAnimations(lenisManager = null) {
	gsap.killTweensOf('#cnc-logo');

	if (lenisManager && bgLettersScrollHandler) {
		lenisManager.offScroll(bgLettersScrollHandler);
		bgLettersScrollHandler = null;
	}
}
