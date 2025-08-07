import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

const laptopScreenTexture = textureLoader.load('/laptop_screen.webp');
const laptopKeyboardTexture = textureLoader.load('/laptop_keyboard.webp');

function createRadialMap(size = 512) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');

	const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

	gradient.addColorStop(0, 'rgba(60, 60, 60, 1)');
	gradient.addColorStop(0.4, 'rgba(120, 120, 120, 1)');
	gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);

	// Create texture from canvas
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;

	return texture;
}

const heliOpacityTexture = createRadialMap(512);

laptopScreenTexture.flipY = false;
laptopScreenTexture.wrapS = THREE.RepeatWrapping;
laptopScreenTexture.wrapT = THREE.RepeatWrapping;

laptopKeyboardTexture.flipY = false;
laptopKeyboardTexture.wrapS = THREE.RepeatWrapping;
laptopKeyboardTexture.wrapT = THREE.RepeatWrapping;

laptopScreenTexture.colorSpace = THREE.SRGBColorSpace;
laptopKeyboardTexture.colorSpace = THREE.SRGBColorSpace;

export const defaultMaterial = new THREE.MeshStandardMaterial({
	color: 0x000000,
	roughness: 0.2,
	metalness: 0.8,
});
export const heliOpacityMaterial = new THREE.MeshStandardMaterial({
	color: 0x000000,
	roughness: 0.2,
	metalness: 0.8,
	alphaMap: heliOpacityTexture,
	transparent: true,
	//side: THREE.DoubleSide,
});

heliOpacityMaterial.alphaMap.wrapS = THREE.ClampToEdgeWrapping;
heliOpacityMaterial.alphaMap.wrapT = THREE.ClampToEdgeWrapping;

export const laptopGlossMaterial = new THREE.MeshStandardMaterial({
	color: 0x000000,
	roughness: 0.25,
	metalness: 0.95,
});

export const laptopMatteMaterial = new THREE.MeshStandardMaterial({
	color: 0x000000,
	roughness: 1,
	metalness: 0,
});

export const laptopKeyboardMaterial = new THREE.MeshStandardMaterial({
	color: 0xffffff,
	roughness: 1,
	metalness: 0,
	map: laptopKeyboardTexture,
});

export const laptopScreenMaterial = new THREE.MeshBasicMaterial({
	map: laptopScreenTexture,
});

export function applyMaterials(child) {
	if (!child.isMesh) return;

	if (child.name.toLowerCase().includes('laptop_main') || child.name.toLowerCase().includes('laptop_top')) {
		child.material = laptopGlossMaterial;
	} else if (child.name.toLowerCase().includes('laptop_matte')) {
		child.material = laptopMatteMaterial;
	} else if (child.name.toLowerCase().includes('laptop_keyboard')) {
		child.material = laptopKeyboardMaterial;
	} else if (child.name.toLowerCase().includes('laptop_screen')) {
		child.material = laptopScreenMaterial;
	} else if (child.name.toLowerCase().includes('heli_front')) {
		child.material = heliOpacityMaterial;
	} else {
		child.material = defaultMaterial;
	}
}

let originalUVOffsetY = 0;

export function initializeUVAnimation() {
	if (heliOpacityMaterial.alphaMap) {
		originalUVOffsetY = heliOpacityMaterial.alphaMap.offset.y;
	}
}

const FIRST_START = 0.5;
const FIRST_END = 0.68;
const FIRST_RANGE = FIRST_END - FIRST_START;
const SECOND_START = 0.72;
const SECOND_END = 0.85;
const SECOND_RANGE = SECOND_END - SECOND_START;
const MAX_Y_OFFSET = 0.65;

export function updateHeliOpacityUV(scrollProgress, easingFunction) {
	if (!heliOpacityMaterial.alphaMap) return;

	const targetUV = heliOpacityMaterial.alphaMap.offset;

	if (scrollProgress < FIRST_START) {
		targetUV.y = originalUVOffsetY;
		return;
	}
	if (scrollProgress > SECOND_END) {
		targetUV.y = 0;
		return;
	}

	if (scrollProgress <= FIRST_END) {
		const progress = (scrollProgress - FIRST_START) / FIRST_RANGE;
		targetUV.y = originalUVOffsetY + easingFunction(progress) * MAX_Y_OFFSET;
	} else if (scrollProgress < SECOND_START) {
		targetUV.y = originalUVOffsetY + MAX_Y_OFFSET;
	} else {
		const progress = (scrollProgress - SECOND_START) / SECOND_RANGE;
		const startValue = originalUVOffsetY + MAX_Y_OFFSET;
		targetUV.y = startValue + easingFunction(progress) * (0 - startValue);
	}
}
