let isDragging = false;
let startY = 0;
let startScrollTop = 0;
let handle = null;
let lenisAPI = null;

function createScrollbarHandle() {
	const scrollbarHandle = document.createElement('div');
	scrollbarHandle.style.cssText = `
		position: fixed;
		top: 0;
		right: 5px;
		width: 5px;
		height: 100px;
		background: rgba(0, 0, 0, 0.8);
		border-radius: 2px;
		cursor: grab;
		z-index: 1000;
		will-change: transform;
	`;

	document.body.appendChild(scrollbarHandle);
	return scrollbarHandle;
}

function updateHandlePosition() {
	if (!handle || !lenisAPI) return;

	const scrollPercent = lenisAPI.scroll / (document.body.scrollHeight - window.innerHeight);
	const maxTop = window.innerHeight - 100;
	const translateY = scrollPercent * maxTop;
	handle.style.transform = `translateY(${translateY}px)`;
}

function startDrag(e) {
	isDragging = true;
	startY = e.clientY;
	startScrollTop = lenisAPI.scroll;
	handle.style.cursor = 'grabbing';
	e.preventDefault();
}

function onDrag(e) {
	if (!isDragging) return;

	const deltaY = e.clientY - startY;
	const maxHandleTop = window.innerHeight - 100;
	const scrollRatio = deltaY / maxHandleTop;
	const maxScroll = document.body.scrollHeight - window.innerHeight;
	const newScrollTop = startScrollTop + scrollRatio * maxScroll;
	// Access the underlying lenis instance through a method we'll add
	if (lenisAPI.scrollToPosition) {
		lenisAPI.scrollToPosition(Math.max(0, Math.min(maxScroll, newScrollTop)));
	}
}

function endDrag() {
	isDragging = false;
	handle.style.cursor = 'grab';
}

function setupEventListeners() {
	handle.addEventListener('mousedown', startDrag);
	document.addEventListener('mousemove', onDrag);
	document.addEventListener('mouseup', endDrag);
}

function setupLenisIntegration() {
	lenisAPI.onScroll(updateHandlePosition);
}

export function createCustomScrollbar(lenisManager) {
	lenisAPI = lenisManager;
	handle = createScrollbarHandle();
	setupEventListeners();
	setupLenisIntegration();
	updateHandlePosition();

	return {
		destroy: () => {
			if (handle) {
				handle.remove();
				handle = null;
			}
		},
	};
}

export function initializeScrollbarWhenReady() {
	if (window.lenisManager) {
		createCustomScrollbar(window.lenisManager);
	} else {
		const checkLenis = setInterval(() => {
			if (window.lenisManager) {
				createCustomScrollbar(window.lenisManager);
				clearInterval(checkLenis);
			}
		}, 100);
	}
}
