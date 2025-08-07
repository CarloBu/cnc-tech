import { gsap } from 'gsap';
import { getCardAnimator, initializeCardAnimators } from './gsapCardReveal.js';

const cardRanges = [
	{ start: 22, end: 47, id: 'mission' },
	{ start: 52, end: 75, id: 'training' },
	{ start: 92, end: 100, id: 'live' },
];

let cards = [];
let lastScrollPosition = 0;
let scrollVelocity = 0;
let lenisAPI = null;
let handleScrollRef = null;

function initializeWhenReady(initializeFn) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initializeFn);
	} else {
		initializeFn();
	}
}

function initialize() {
	// Initialize card animators first
	initializeCardAnimators();

	cards = cardRanges
		.map((range) => {
			const animator = getCardAnimator(range.id);

			return animator
				? {
						...range,
						animator: animator,
						wasVisible: false,
					}
				: null;
		})
		.filter(Boolean);

	if (cards.length > 0 && lenisAPI) {
		handleScrollRef = (scrollPosition) => handleScroll(scrollPosition);
		lenisAPI.onScroll(handleScrollRef);
		handleScroll(lenisAPI.scroll);
	}
}

function handleScroll(scrollPosition) {
	scrollVelocity = Math.abs(scrollPosition - lastScrollPosition);
	lastScrollPosition = scrollPosition;

	const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
	const scrollPercent = (scrollPosition / scrollHeight) * 100;

	cards.forEach((card) => {
		const shouldBeVisible = scrollPercent >= card.start && scrollPercent <= card.end;
		const isCurrentlyVisible = card.wasVisible;

		if (shouldBeVisible && !isCurrentlyVisible) {
			scrollVelocity > 100 ? card.animator.forceShow() : card.animator.reveal();
			card.wasVisible = true;
		} else if (!shouldBeVisible && isCurrentlyVisible) {
			scrollVelocity > 100 ? card.animator.forceHide() : card.animator.hide();
			card.wasVisible = false;
		}
	});
}

export function initializeCardsReveal(lenisManager) {
	lenisAPI = lenisManager;
	initializeWhenReady(initialize);
	return getCardsAPI();
}

export function getCardsAPI() {
	return {
		showCard: (cardId) => {
			const animator = getCardAnimator(cardId);
			if (animator) {
				animator.reveal();
			}
		},
		hideCard: (cardId) => {
			const animator = getCardAnimator(cardId);
			if (animator) {
				animator.hide();
			}
		},
		hideAllCards: () => {
			cards.forEach((card) => {
				card.animator.forceHide();
				card.wasVisible = false;
			});
		},
		destroy: () => {
			if (lenisAPI && handleScrollRef) {
				lenisAPI.offScroll(handleScrollRef);
			}
		},
	};
}
