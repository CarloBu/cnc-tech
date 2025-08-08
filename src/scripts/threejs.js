import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { gsap } from 'gsap';
import { createLenisManager } from './lenis.js';

import { applyMaterials, initializeUVAnimation, updateHeliOpacityUV } from './materials.js';

const canvas = document.getElementById('canvas');
const scrollIndicator = document.getElementById('scroll-indicator');
const scene = new THREE.Scene();

const lenisAPI = createLenisManager();

// keep default right click menu
canvas.addEventListener('contextmenu', (e) => {}, false);

let camera = null;
let mixer = null;
let action = null;

const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	alpha: true,
});
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const rgbeLoader = new RGBELoader();
rgbeLoader.load('/cnc-hdri.hdr', (texture) => {
	texture.mapping = THREE.EquirectangularReflectionMapping;
	scene.environment = texture;
});

const dracoLoader = new DRACOLoader();
// Use local Draco decoder assets served from /public
dracoLoader.setDecoderPath('/');
dracoLoader.setDecoderConfig({ type: 'wasm' });

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.load('/cnc.glb', (gltf) => {
	gltf.scene.traverse(applyMaterials);
	scene.add(gltf.scene);

	initializeUVAnimation();

	camera = gltf.cameras.find((cam) => cam.name === 'camera') || gltf.cameras[0];
	if (camera) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}

	if (gltf.animations.length > 0) {
		mixer = new THREE.AnimationMixer(gltf.scene);
		action = mixer.clipAction(gltf.animations[0]);
		action.setLoop(THREE.LoopOnce);
		action.clampWhenFinished = true;
		action.play();
		action.paused = true;
	}
});

lenisAPI.onScroll((scroll) => {
	if (!action) return;

	const scrollPercent = scroll / (document.body.scrollHeight - window.innerHeight);
	const progress = Math.max(0, Math.min(1, scrollPercent));

	updateScrollIndicator(progress);
	updateAnimation(progress);
	updateHeliOpacityUV(progress, gsap.parseEase('power2.inOut'));
});

function updateScrollIndicator(progress) {
	if (scrollIndicator) {
		scrollIndicator.textContent = `${(progress * 100).toFixed(1)}%`;
	}
}

function updateAnimation(progress) {
	if (action) {
		action.time = progress * action.getClip().duration;
		mixer.update(0);
	}
}

window.addEventListener('resize', () => {
	// prevent mobile from resizing the camera
	const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	if (isMobile) return;

	if (camera) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
	renderer.setSize(window.innerWidth, window.innerHeight);
});

const tick = () => {
	lenisAPI.update();
	if (camera) {
		renderer.render(scene, camera);
	}
	requestAnimationFrame(tick);
};

tick();

window.lenisManager = lenisAPI;

window.addEventListener('beforeunload', () => {
	lenisAPI.destroy();
	dracoLoader.dispose();
});
