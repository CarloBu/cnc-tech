import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'gsap';
import { createLenisManager } from './lenis.js';

import { applyMaterials, initializeUVAnimation, updateHeliOpacityUV } from './materials.js';

const canvas = document.getElementById('canvas');
const scrollIndicator = document.getElementById('scroll-indicator');
const scene = new THREE.Scene();

const lenisAPI = createLenisManager();

canvas.addEventListener('contextmenu', (e) => {}, false);

let camera = null;
let mixer = null;
let action = null;
let controls = null;

const cameraTarget = new THREE.Vector3();
const baseSpherical = new THREE.Spherical();
let hasCameraRig = false;
let currentTheta = 0;
let currentPhi = 0;
let baseRadius = 1;

const desiredMouse = { x: 0, y: 0 };
const smoothMouse = { x: 0, y: 0 };

const maxAzimuthOffset = THREE.MathUtils.degToRad(3); // left-right
const maxPolarOffset = THREE.MathUtils.degToRad(2); // up-down
const sphericalEpsilon = 1e-3;

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
		// Don't move the camera from its original position in the scene
		// This preserves the animation tracks that reference it
		if (!camera.parent) {
			scene.add(camera);
		}

		const targetNode = findCameraTargetNode(gltf.scene);
		if (targetNode) {
			targetNode.updateWorldMatrix(true, false);
			targetNode.getWorldPosition(cameraTarget);
		} else {
			const bbox = new THREE.Box3().setFromObject(gltf.scene);
			bbox.getCenter(cameraTarget);
		}

		camera.updateMatrixWorld(true);
		const offset = new THREE.Vector3().copy(camera.position).sub(cameraTarget);
		baseSpherical.setFromVector3(offset);
		baseRadius = baseSpherical.radius;
		currentTheta = baseSpherical.theta;
		currentPhi = baseSpherical.phi;
		hasCameraRig = true;

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.12;
		controls.enableZoom = false;
		controls.enablePan = false;
		controls.enableRotate = false;

		controls.minAzimuthAngle = baseSpherical.theta - maxAzimuthOffset;
		controls.maxAzimuthAngle = baseSpherical.theta + maxAzimuthOffset;
		controls.minPolarAngle = Math.max(sphericalEpsilon, baseSpherical.phi - maxPolarOffset);
		controls.maxPolarAngle = Math.min(Math.PI - sphericalEpsilon, baseSpherical.phi + maxPolarOffset);

		controls.target.copy(cameraTarget);
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		controls.enabled = false;
		controls.update();
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

function findCameraTargetNode(root) {
	let found = null;
	root.traverse((obj) => {
		if (found || !obj.name) return;
		const name = obj.name.toLowerCase();
		if (name.includes('camera') && name.includes('target')) {
			found = obj;
		} else if (name === 'target' || name === 'lookat') {
			found = obj;
		}
	});
	return found;
}

function onMouseMove(event) {
	const nx = (event.clientX / window.innerWidth) * 2 - 1;
	const ny = (event.clientY / window.innerHeight) * 2 - 1;
	desiredMouse.x = THREE.MathUtils.clamp(nx, -1, 1);
	desiredMouse.y = THREE.MathUtils.clamp(ny, -1, 1);
}

const isDesktop = window.matchMedia('(pointer: fine)').matches;
if (isDesktop) {
	window.addEventListener('mousemove', onMouseMove);
}

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
	const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	if (isMobile) return;

	if (camera) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
	renderer.setSize(window.innerWidth, window.innerHeight);
	if (controls) controls.update();
});

const tick = () => {
	lenisAPI.update();
	if (camera) {
		smoothMouse.x += (desiredMouse.x - smoothMouse.x) * 0.08;
		smoothMouse.y += (desiredMouse.y - smoothMouse.y) * 0.08;

		if (hasCameraRig && isDesktop) {
			const targetTheta = THREE.MathUtils.clamp(
				baseSpherical.theta - smoothMouse.x * maxAzimuthOffset,
				baseSpherical.theta - maxAzimuthOffset,
				baseSpherical.theta + maxAzimuthOffset,
			);
			const targetPhi = THREE.MathUtils.clamp(
				baseSpherical.phi - smoothMouse.y * maxPolarOffset,
				Math.max(sphericalEpsilon, baseSpherical.phi - maxPolarOffset),
				Math.min(Math.PI - sphericalEpsilon, baseSpherical.phi + maxPolarOffset),
			);

			currentTheta += (targetTheta - currentTheta) * 0.08;
			currentPhi += (targetPhi - currentPhi) * 0.08;

			const spherical = new THREE.Spherical(baseRadius, currentPhi, currentTheta);
			const newPos = new THREE.Vector3().setFromSpherical(spherical).add(cameraTarget);
			camera.position.copy(newPos);
			camera.lookAt(cameraTarget);
			if (controls) {
				controls.target.copy(cameraTarget);
				controls.update();
			}
		}
		renderer.render(scene, camera);
	}
	requestAnimationFrame(tick);
};

tick();

window.lenisManager = lenisAPI;

window.addEventListener('beforeunload', () => {
	lenisAPI.destroy();
	dracoLoader.dispose();
	if (controls) controls.dispose();
	if (isDesktop) window.removeEventListener('mousemove', onMouseMove);
});
