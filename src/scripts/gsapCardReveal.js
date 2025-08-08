import { gsap } from 'gsap';

class CardRevealAnimator {
	constructor(cardElement) {
		this.cardElement = cardElement;
		this.cardId = cardElement.dataset.cardId;
		this.isVisible = false;
		this.currentTween = null;

		this.initializeElements();
	}

	initializeElements() {
		this.cardContainer = this.cardElement;
		this.contentCard = this.cardElement.querySelector('.content-card');
		this.imageCard = this.cardElement.querySelector('.image-card');
		this.titleElement = this.cardElement.querySelector('.card-title');
		this.descriptionElement = this.cardElement.querySelector('.fade-text');
		this.chevrons = this.cardElement.querySelectorAll('.chevron');
	}

	killCurrentTween() {
		if (this.currentTween) {
			this.currentTween.kill();
			this.currentTween = null;
		}
	}

	reveal() {
		if (this.isVisible) return;

		this.killCurrentTween();
		this.cardContainer.classList.add('visible');
		this.isVisible = true;

		this.currentTween = gsap.timeline();

		// Initial chevron setup
		gsap.set(this.chevrons, { opacity: 0 });

		// Set chevrons to center position
		gsap.set(this.cardContainer.querySelector('.chevron-top-left'), {
			top: 'calc(50% - 4rem)',
			left: 'calc(50% - 4rem)',
			transform: 'rotate(0deg)',
		});
		gsap.set(this.cardContainer.querySelector('.chevron-top-right'), {
			top: 'calc(50% - 4rem)',
			left: 'calc(50% + 4rem)',
			transform: 'rotate(90deg)',
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-left'), {
			top: 'calc(50% + 4rem)',
			left: 'calc(50% - 4rem)',
			transform: 'rotate(270deg)',
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-right'), {
			top: 'calc(50% + 4rem)',
			left: 'calc(50% + 4rem)',
			transform: 'rotate(180deg)',
		});

		// Chevron animation timeline
		const chevronTimeline = gsap.timeline();

		// Show chevrons with flicker effect
		chevronTimeline.to(this.chevrons, {
			opacity: 1,
			duration: 0.066,
			ease: 'stepped',
		});

		chevronTimeline.to(this.chevrons, {
			opacity: 0,
			duration: 0.066,
			ease: 'stepped',
		});

		chevronTimeline.to(this.chevrons, {
			opacity: 1,
			duration: 0.066,
			ease: 'stepped',
		});

		chevronTimeline.to(this.chevrons, {
			opacity: 1,
			duration: 0.66,
			ease: 'expo.out',
		});

		// Animate chevrons to corners
		chevronTimeline.to(
			this.cardContainer.querySelector('.chevron-top-left'),
			{
				top: 0,
				left: 0,
				xPercent: 0,
				yPercent: 0,
				transform: 'rotate(0deg)',
				duration: 0.66,
				ease: 'power2.out',
			},
			'-=0.66',
		);

		chevronTimeline.to(
			this.cardContainer.querySelector('.chevron-top-right'),
			{
				top: 0,
				right: 0,
				left: 'auto',
				xPercent: 0,
				yPercent: 0,
				transform: 'rotate(90deg)',
				duration: 0.66,
				ease: 'power2.out',
			},
			'-=0.66',
		);

		chevronTimeline.to(
			this.cardContainer.querySelector('.chevron-bottom-left'),
			{
				bottom: 0,
				left: 0,
				top: 'auto',
				xPercent: 0,
				yPercent: 0,
				transform: 'rotate(270deg)',
				duration: 0.66,
				ease: 'power2.out',
			},
			'-=0.66',
		);

		chevronTimeline.to(
			this.cardContainer.querySelector('.chevron-bottom-right'),
			{
				bottom: 0,
				right: 0,
				top: 'auto',
				left: 'auto',
				xPercent: 0,
				yPercent: 0,
				transform: 'rotate(180deg)',
				duration: 0.66,
				ease: 'power2.out',
			},
			'-=0.66',
		);

		// Add chevron timeline to main timeline
		this.currentTween.add(chevronTimeline);

		// Animate cards expanding
		this.currentTween.fromTo(
			this.contentCard,
			{ scale: 0 },
			{
				scale: 1,
				duration: 1,
				ease: 'power4.out',
			},
			'-=0.6',
		);

		this.currentTween.fromTo(
			this.imageCard,
			{ scale: 0 },
			{
				scale: 1,
				duration: 1,
				ease: 'power4.out',
			},
			'-=0.9',
		);

		// Animate title and description fade in
		this.currentTween.fromTo(
			this.titleElement,
			{
				autoAlpha: 0,
			},
			{
				autoAlpha: 1,
				duration: 0.8,
				ease: 'expo.out',
			},
			'-=0.8',
		);

		this.currentTween.fromTo(
			this.descriptionElement,
			{
				autoAlpha: 0,
			},
			{
				autoAlpha: 1,
				duration: 1.4,
				ease: 'power4.out',
			},
			'-=0.8',
		);
	}

	hide() {
		if (!this.isVisible) return;

		this.killCurrentTween();
		this.isVisible = false;

		this.currentTween = gsap.timeline({
			onComplete: () => {
				this.cardContainer.classList.remove('visible');
			},
		});

		// Chevron exit timeline
		const chevronExitTimeline = gsap.timeline();

		chevronExitTimeline.to(this.chevrons, {
			opacity: 0,
			duration: 0.066,
			ease: 'stepped',
		});

		chevronExitTimeline.to(this.chevrons, {
			opacity: 1,
			duration: 0.066,
			ease: 'stepped',
		});

		chevronExitTimeline.to(this.chevrons, {
			opacity: 0,
			duration: 0.066,
			ease: 'stepped',
		});

		this.currentTween.add(chevronExitTimeline);

		this.currentTween.to(
			this.imageCard,
			{
				scale: 0,
				duration: 0.5,
				ease: 'power2.in',
			},
			'-=0.3',
		);

		this.currentTween.to(
			this.contentCard,
			{
				scale: 0,
				duration: 0.5,
				ease: 'power2.in',
			},
			'-=0.4',
		);

		// Fade out text elements
		this.currentTween.to(
			[this.titleElement, this.descriptionElement],
			{
				autoAlpha: 0,
				duration: 0.5,
				ease: 'expo.in',
			},
			'-=0.7',
		);
	}

	forceHide() {
		this.killCurrentTween();
		this.isVisible = false;
		this.cardContainer.classList.remove('visible');
		gsap.set([this.contentCard, this.imageCard], { scale: 0 });

		// Reset text elements
		gsap.set([this.titleElement, this.descriptionElement], { autoAlpha: 0 });

		// Reset chevrons to smaller box position when hiding
		gsap.set(this.cardContainer.querySelector('.chevron-top-left'), {
			top: 'calc(50% - 4rem)',
			left: 'calc(50% - 4rem)',
			transform: 'rotate(0deg)',
			opacity: 0,
			scale: 0.8,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-top-right'), {
			top: 'calc(50% - 4rem)',
			left: 'calc(50% + 4rem)',
			transform: 'rotate(90deg)',
			opacity: 0,
			scale: 0.8,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-left'), {
			top: 'calc(50% + 4rem)',
			left: 'calc(50% - 4rem)',
			transform: 'rotate(270deg)',
			opacity: 0,
			scale: 0.8,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-right'), {
			top: 'calc(50% + 4rem)',
			left: 'calc(50% + 4rem)',
			transform: 'rotate(180deg)',
			opacity: 0,
			scale: 0.8,
		});
	}

	forceShow() {
		this.killCurrentTween();
		this.isVisible = true;
		this.cardContainer.classList.add('visible');
		gsap.set([this.contentCard, this.imageCard], { scale: 1 });

		// Reset text elements
		gsap.set([this.titleElement, this.descriptionElement], { autoAlpha: 1 });

		// Reset chevrons to their original positions
		gsap.set(this.cardContainer.querySelector('.chevron-top-left'), {
			top: 0,
			left: 0,
			xPercent: 0,
			yPercent: 0,
			transform: 'rotate(0deg)',
			opacity: 1,
			scale: 1,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-top-right'), {
			top: 0,
			right: 0,
			left: 'auto',
			xPercent: 0,
			yPercent: 0,
			transform: 'rotate(90deg)',
			opacity: 1,
			scale: 1,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-left'), {
			bottom: 0,
			left: 0,
			top: 'auto',
			xPercent: 0,
			yPercent: 0,
			transform: 'rotate(270deg)',
			opacity: 1,
			scale: 1,
		});
		gsap.set(this.cardContainer.querySelector('.chevron-bottom-right'), {
			bottom: 0,
			right: 0,
			top: 'auto',
			left: 'auto',
			xPercent: 0,
			yPercent: 0,
			transform: 'rotate(180deg)',
			opacity: 1,
			scale: 1,
		});
	}

	destroy() {
		this.killCurrentTween();
		// No split text to clean up
	}
}

// Global registry for card animators
const cardAnimators = new Map();

export function initializeCardAnimators() {
	const allCardContainers = document.querySelectorAll('.card-container[data-card-id]');

	allCardContainers.forEach((cardElement) => {
		const cardId = cardElement.dataset.cardId;

		if (!cardAnimators.has(cardId)) {
			const animator = new CardRevealAnimator(cardElement);
			cardAnimators.set(cardId, animator);
		}
	});
}

export function getCardAnimator(cardId) {
	return cardAnimators.get(cardId);
}

export function getAllCardAnimators() {
	return Array.from(cardAnimators.values());
}

export function destroyAllCardAnimators() {
	cardAnimators.forEach((animator) => {
		animator.destroy();
	});
	cardAnimators.clear();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeCardAnimators);
} else {
	initializeCardAnimators();
}
