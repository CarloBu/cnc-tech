/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

// Wait for DOM to be ready
function initFluidSimulation() {
	// Simulation section
	const canvas = document.getElementById('fluidCanvas');
	if (!canvas) {
		console.log('Canvas not found, skipping fluid simulation initialization');
		return;
	}

	// Check if canvas already has a fluid simulation initialized
	if (canvas.dataset.fluidInitialized === 'true') {
		//console.log('Fluid simulation already initialized for this canvas');
		return;
	}

	// Mark canvas as initialized
	canvas.dataset.fluidInitialized = 'true';
	//console.log('Starting fluid simulation initialization');

	resizeCanvas();

	let config = {
		SIM_RESOLUTION: 128,
		DYE_RESOLUTION: 256,
		DENSITY_DISSIPATION: 5,
		VELOCITY_DISSIPATION: 2,
		SPLAT_RADIUS: 0.4,
		SPLAT_FORCE: 2000,
		GRADIENT_TOP: { r: 246, g: 173, b: 169 },
		GRADIENT_BOTTOM: { r: 231, g: 74, b: 87 },
		BACK_COLOR: { r: 179, g: 173, b: 169 },
	};

	// Add velocity tracking configuration
	const velocityConfig = {
		maxPoints: 5,
		velocitySmoothing: 0.3,
		interpolationSteps: 5,
		minDistance: 5,
	};

	// Track intermediate points for velocity calculation
	function addPointerPoint(pointer, x, y, timestamp) {
		pointer.points.push({ x, y, timestamp });
		if (pointer.points.length > velocityConfig.maxPoints) {
			pointer.points.shift();
		}
	}

	// Calculate velocity based on points history
	function calculateVelocity(points, currentTimestamp) {
		if (points.length < 2) return { vx: 0, vy: 0 };

		const oldestPoint = points[0];
		const newestPoint = points[points.length - 1];
		const timeDelta = (currentTimestamp - oldestPoint.timestamp) / 1000; // Convert to seconds

		if (timeDelta <= 0) return { vx: 0, vy: 0 };

		const vx = (newestPoint.x - oldestPoint.x) / timeDelta;
		const vy = (newestPoint.y - oldestPoint.y) / timeDelta;

		return { vx, vy };
	}

	// Interpolate between two points
	function interpolatePoints(start, end, t) {
		return {
			x: start.x + (end.x - start.x) * t,
			y: start.y + (end.y - start.y) * t,
		};
	}

	// Handle fast movements with interpolation
	function handleFastMovement(pointer, currentX, currentY, timestamp) {
		if (pointer.points.length < 2) return [{ x: currentX, y: currentY }];

		const lastPoint = pointer.points[pointer.points.length - 1];
		const distance = Math.hypot(currentX - lastPoint.x, currentY - lastPoint.y);

		if (distance < velocityConfig.minDistance) return [{ x: currentX, y: currentY }];

		const interpolatedPoints = [];
		for (let i = 1; i <= velocityConfig.interpolationSteps; i++) {
			const t = i / velocityConfig.interpolationSteps;
			const point = interpolatePoints(lastPoint, { x: currentX, y: currentY }, t);
			interpolatedPoints.push(point);
		}

		return interpolatedPoints;
	}

	function pointerPrototype() {
		this.id = -1;
		this.texcoordX = 0;
		this.texcoordY = 0;
		this.prevTexcoordX = 0;
		this.prevTexcoordY = 0;
		this.deltaX = 0;
		this.deltaY = 0;
		this.down = false;
		this.moved = false;
		this.color = [30, 0, 300];
		this.velocityX = 0;
		this.velocityY = 0;
		this.lastTimestamp = 0;
		this.points = [];
	}

	let pointers = [];
	let splatStack = [];
	let dye;
	let velocity;
	let divergence;
	let pressure;

	pointers.push(new pointerPrototype());

	const { gl, ext } = getWebGLContext(canvas);

	if (isMobile()) {
		config.DYE_RESOLUTION = 512;
	}
	if (!ext.supportLinearFiltering) {
		config.DYE_RESOLUTION = 512;
	}

	startGUI();

	function getWebGLContext(canvas) {
		const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

		let gl = canvas.getContext('webgl2', params);
		const isWebGL2 = !!gl;
		if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

		let halfFloat;
		let supportLinearFiltering;
		if (isWebGL2) {
			gl.getExtension('EXT_color_buffer_float');
			supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
		} else {
			halfFloat = gl.getExtension('OES_texture_half_float');
			supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
		}

		gl.clearColor(0.0, 0.0, 0.0, 1.0);

		const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
		let formatRGBA;
		let formatRG;
		let formatR;

		if (isWebGL2) {
			formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
			formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
			formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
		} else {
			formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
			formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
			formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
		}

		return {
			gl,
			ext: {
				formatRGBA,
				formatRG,
				formatR,
				halfFloatTexType,
				supportLinearFiltering,
			},
		};
	}

	function getSupportedFormat(gl, internalFormat, format, type) {
		if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
			switch (internalFormat) {
				case gl.R16F:
					return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
				case gl.RG16F:
					return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
				default:
					return null;
			}
		}

		return {
			internalFormat,
			format,
		};
	}

	function supportRenderTextureFormat(gl, internalFormat, format, type) {
		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

		let fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

		let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		return status == gl.FRAMEBUFFER_COMPLETE;
	}

	function startGUI() {
		// Initialize framebuffers with the hardcoded config
		initFramebuffers();
	}

	function isMobile() {
		return /Mobi|Android/i.test(navigator.userAgent);
	}

	function captureScreenshot() {
		let res = getResolution(config.CAPTURE_RESOLUTION);
		let target = createFBO(res.width, res.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
		render(target);

		let texture = framebufferToTexture(target);
		texture = normalizeTexture(texture, target.width, target.height);

		let captureCanvas = textureToCanvas(texture, target.width, target.height);
		let datauri = captureCanvas.toDataURL();
		downloadURI('fluid.png', datauri);
		URL.revokeObjectURL(datauri);
	}

	function framebufferToTexture(target) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		let length = target.width * target.height * 4;
		let texture = new Float32Array(length);
		gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
		return texture;
	}

	function normalizeTexture(texture, width, height) {
		let result = new Uint8Array(texture.length);
		let id = 0;
		for (let i = height - 1; i >= 0; i--) {
			for (let j = 0; j < width; j++) {
				let nid = i * width * 4 + j * 4;
				result[nid + 0] = clamp01(texture[id + 0]) * 255;
				result[nid + 1] = clamp01(texture[id + 1]) * 255;
				result[nid + 2] = clamp01(texture[id + 2]) * 255;
				result[nid + 3] = clamp01(texture[id + 3]) * 255;
				id += 4;
			}
		}
		return result;
	}

	function clamp01(input) {
		return Math.min(Math.max(input, 0), 1);
	}

	function textureToCanvas(texture, width, height) {
		let captureCanvas = document.createElement('canvas');
		let ctx = captureCanvas.getContext('2d');
		captureCanvas.width = width;
		captureCanvas.height = height;

		let imageData = ctx.createImageData(width, height);
		imageData.data.set(texture);
		ctx.putImageData(imageData, 0, 0);

		return captureCanvas;
	}

	function downloadURI(filename, uri) {
		let link = document.createElement('a');
		link.download = filename;
		link.href = uri;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	class Material {
		constructor(vertexShader, fragmentShaderSource) {
			this.vertexShader = vertexShader;
			this.fragmentShaderSource = fragmentShaderSource;
			this.programs = [];
			this.activeProgram = null;
			this.uniforms = [];
		}

		setKeywords(keywords) {
			let hash = 0;
			for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);

			let program = this.programs[hash];
			if (program == null) {
				let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
				program = createProgram(this.vertexShader, fragmentShader);
				this.programs[hash] = program;
			}

			if (program == this.activeProgram) return;

			this.uniforms = getUniforms(program);
			this.activeProgram = program;
		}

		bind() {
			gl.useProgram(this.activeProgram);
		}
	}

	class Program {
		constructor(vertexShader, fragmentShader) {
			this.uniforms = {};
			this.program = createProgram(vertexShader, fragmentShader);
			this.uniforms = getUniforms(this.program);
		}

		bind() {
			gl.useProgram(this.program);
		}
	}

	function createProgram(vertexShader, fragmentShader) {
		let program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(program));

		return program;
	}

	function getUniforms(program) {
		let uniforms = [];
		let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		for (let i = 0; i < uniformCount; i++) {
			let uniformName = gl.getActiveUniform(program, i).name;
			uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
		}
		return uniforms;
	}

	function compileShader(type, source, keywords) {
		source = addKeywords(source, keywords);

		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(shader));

		return shader;
	}

	function addKeywords(source, keywords) {
		if (keywords == null) return source;
		let keywordsString = '';
		keywords.forEach((keyword) => {
			keywordsString += '#define ' + keyword + '\n';
		});
		return keywordsString + source;
	}

	const baseVertexShader = compileShader(
		gl.VERTEX_SHADER,
		`
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`,
	);

	const copyShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`,
	);

	const clearShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`,
	);

	const colorShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;

    uniform vec4 topColor;
    uniform vec4 bottomColor;
    varying vec2 vUv;

    void main () {
        gl_FragColor = mix(bottomColor, topColor, vUv.y);
    }
`,
	);

	const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;

	const splatShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`,
	);

	const advectionShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;

        vec2 iuv = floor(st);
        vec2 fuv = fract(st);

        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
    }`,
		ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'],
	);

	const divergenceShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`,
	);

	const pressureShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`,
	);

	const gradientSubtractShader = compileShader(
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`,
	);

	const blit = (() => {
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(0);

		return (target, clear = false) => {
			if (target == null) {
				gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			} else {
				gl.viewport(0, 0, target.width, target.height);
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			}
			if (clear) {
				gl.clearColor(0.0, 0.0, 0.0, 1.0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
			// CHECK_FRAMEBUFFER_STATUS();
			gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		};
	})();

	function CHECK_FRAMEBUFFER_STATUS() {
		let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (status != gl.FRAMEBUFFER_COMPLETE) console.trace('Framebuffer error: ' + status);
	}

	const copyProgram = new Program(baseVertexShader, copyShader);
	const clearProgram = new Program(baseVertexShader, clearShader);
	const colorProgram = new Program(baseVertexShader, colorShader);
	const splatProgram = new Program(baseVertexShader, splatShader);
	const advectionProgram = new Program(baseVertexShader, advectionShader);
	const divergenceProgram = new Program(baseVertexShader, divergenceShader);
	const pressureProgram = new Program(baseVertexShader, pressureShader);
	const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);

	const displayMaterial = new Material(baseVertexShader, displayShaderSource);

	function initFramebuffers() {
		let simRes = getResolution(config.SIM_RESOLUTION);
		let dyeRes = getResolution(config.DYE_RESOLUTION);

		const texType = ext.halfFloatTexType;
		const rgba = ext.formatRGBA;
		const rg = ext.formatRG;
		const r = ext.formatR;
		const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		gl.disable(gl.BLEND);

		if (dye == null) dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
		else dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

		if (velocity == null) velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
		else velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

		divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
		pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
	}

	function createFBO(w, h, internalFormat, format, type, param) {
		gl.activeTexture(gl.TEXTURE0);
		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

		let fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.viewport(0, 0, w, h);
		gl.clear(gl.COLOR_BUFFER_BIT);

		let texelSizeX = 1.0 / w;
		let texelSizeY = 1.0 / h;

		return {
			texture,
			fbo,
			width: w,
			height: h,
			texelSizeX,
			texelSizeY,
			attach(id) {
				gl.activeTexture(gl.TEXTURE0 + id);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				return id;
			},
		};
	}

	function createDoubleFBO(w, h, internalFormat, format, type, param) {
		let fbo1 = createFBO(w, h, internalFormat, format, type, param);
		let fbo2 = createFBO(w, h, internalFormat, format, type, param);

		return {
			width: w,
			height: h,
			texelSizeX: fbo1.texelSizeX,
			texelSizeY: fbo1.texelSizeY,
			get read() {
				return fbo1;
			},
			set read(value) {
				fbo1 = value;
			},
			get write() {
				return fbo2;
			},
			set write(value) {
				fbo2 = value;
			},
			swap() {
				let temp = fbo1;
				fbo1 = fbo2;
				fbo2 = temp;
			},
		};
	}

	function resizeFBO(target, w, h, internalFormat, format, type, param) {
		let newFBO = createFBO(w, h, internalFormat, format, type, param);
		copyProgram.bind();
		gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
		blit(newFBO);
		return newFBO;
	}

	function resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
		if (target.width == w && target.height == h) return target;
		target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
		target.write = createFBO(w, h, internalFormat, format, type, param);
		target.width = w;
		target.height = h;
		target.texelSizeX = 1.0 / w;
		target.texelSizeY = 1.0 / h;
		return target;
	}

	function createTextureAsync(url) {
		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

		let obj = {
			texture,
			width: 1,
			height: 1,
			attach(id) {
				gl.activeTexture(gl.TEXTURE0 + id);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				return id;
			},
		};

		let image = new Image();
		image.onload = () => {
			obj.width = image.width;
			obj.height = image.height;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
		};
		image.src = url;

		return obj;
	}

	function updateKeywords() {
		let displayKeywords = [];
		displayMaterial.setKeywords(displayKeywords);
	}

	updateKeywords();
	initFramebuffers();

	let lastUpdateTime = Date.now();
	let colorUpdateTimer = 0.0;
	let animationFrameId;
	update();

	function update() {
		const dt = calcDeltaTime();
		if (resizeCanvas()) initFramebuffers();
		updateColors(dt);
		applyInputs();
		if (!config.PAUSED) step(dt);
		render(null);
		animationFrameId = requestAnimationFrame(update);
	}

	function calcDeltaTime() {
		let now = Date.now();
		let dt = (now - lastUpdateTime) / 1000;
		dt = Math.min(dt, 0.016666);
		lastUpdateTime = now;
		return dt;
	}

	function resizeCanvas() {
		let width = scaleByPixelRatio(canvas.clientWidth);
		let height = scaleByPixelRatio(canvas.clientHeight);
		if (canvas.width != width || canvas.height != height) {
			canvas.width = width;
			canvas.height = height;
			return true;
		}
		return false;
	}

	function updateColors(dt) {
		if (!config.COLORFUL) return;

		colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
		if (colorUpdateTimer >= 1) {
			colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
			pointers.forEach((p) => {
				p.color = generateColor();
			});
		}
	}

	function applyInputs() {
		if (splatStack.length > 0) multipleSplats(splatStack.pop());

		pointers.forEach((p) => {
			if (p.moved) {
				p.moved = false;
				splatPointer(p);
			}
		});
	}

	function step(dt) {
		gl.disable(gl.BLEND);

		divergenceProgram.bind();
		gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
		gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
		blit(divergence);

		clearProgram.bind();
		gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
		gl.uniform1f(clearProgram.uniforms.value, 0);
		blit(pressure.write);
		pressure.swap();

		pressureProgram.bind();
		gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
		gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
		for (let i = 0; i < 20; i++) {
			gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
			blit(pressure.write);
			pressure.swap();
		}

		gradienSubtractProgram.bind();
		gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
		gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
		gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
		blit(velocity.write);
		velocity.swap();

		advectionProgram.bind();
		gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
		if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
		let velocityId = velocity.read.attach(0);
		gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
		gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
		gl.uniform1f(advectionProgram.uniforms.dt, dt);
		gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
		blit(velocity.write);
		velocity.swap();

		if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
		gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
		gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
		gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
		blit(dye.write);
		dye.swap();
	}

	function render(target) {
		// Clear background to transparent and skip gradient fill
		if (target == null) {
			// Clear the default framebuffer to transparent so page background shows through
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(0.0, 0.0, 0.0, 0.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.enable(gl.BLEND);
		} else {
			// Clear offscreen targets as well to transparent
			gl.disable(gl.BLEND);
			gl.viewport(0, 0, target.width, target.height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			gl.clearColor(0.0, 0.0, 0.0, 0.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}

		// Draw only the dye texture
		drawDisplay(target);
	}

	function drawColor(target, gradientTop, gradientBottom) {
		colorProgram.bind();
		gl.uniform4f(colorProgram.uniforms.topColor, gradientTop.r, gradientTop.g, gradientTop.b, 1);
		gl.uniform4f(colorProgram.uniforms.bottomColor, gradientBottom.r, gradientBottom.g, gradientBottom.b, 1);
		blit(target);
	}

	function drawCheckerboard(target) {
		checkerboardProgram.bind();
		gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
		blit(target);
	}

	function drawDisplay(target) {
		let width = target == null ? gl.drawingBufferWidth : target.width;
		let height = target == null ? gl.drawingBufferHeight : target.height;

		displayMaterial.bind();
		gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
		blit(target);
	}

	function splatPointer(pointer) {
		const velocityMagnitude = Math.hypot(pointer.velocityX, pointer.velocityY);
		const velocityScale = Math.min(velocityMagnitude * 0.0001, 1);

		let dx = pointer.deltaX * config.SPLAT_FORCE * (1 + velocityScale);
		let dy = pointer.deltaY * config.SPLAT_FORCE * (1 + velocityScale);

		const radiusScale = 1 + velocityScale * 0.5;
		const radius = correctRadius(config.SPLAT_RADIUS / 100.0) * radiusScale;

		splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color, radius);
	}

	function splat(x, y, dx, dy, color, radius) {
		splatProgram.bind();
		gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
		gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
		gl.uniform2f(splatProgram.uniforms.point, x, y);
		gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
		gl.uniform1f(splatProgram.uniforms.radius, radius);
		blit(velocity.write);
		velocity.swap();

		gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
		gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
		blit(dye.write);
		dye.swap();
	}

	function correctRadius(radius) {
		let aspectRatio = canvas.width / canvas.height;
		if (aspectRatio > 1) radius *= aspectRatio;
		return radius;
	}

	// Event handling for both canvas and hero text container
	function handlePointerEvent(e) {
		const rect = canvas.getBoundingClientRect();
		const posX = scaleByPixelRatio(e.clientX - rect.left);
		const posY = scaleByPixelRatio(e.clientY - rect.top);
		const pointer = pointers[0];

		if (e.type === 'mousedown') {
			updatePointerDownData(pointer, -1, posX, posY);
		} else if (e.type === 'mousemove') {
			if (!pointer.down) {
				updatePointerDownData(pointer, -1, posX, posY);
			}
			updatePointerMoveData(pointer, posX, posY);
		} else if (e.type === 'mouseup' || e.type === 'mouseout') {
			updatePointerUpData(pointer);
		}
	}

	// Handle touch events for both canvas and hero text container
	function handleTouchEvent(e) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const touches = e.targetTouches;

		while (touches.length >= pointers.length) pointers.push(new pointerPrototype());

		for (let i = 0; i < touches.length; i++) {
			const posX = scaleByPixelRatio(touches[i].clientX - rect.left);
			const posY = scaleByPixelRatio(touches[i].clientY - rect.top);

			if (e.type === 'touchstart') {
				updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
			} else if (e.type === 'touchmove') {
				const pointer = pointers[i + 1];
				if (!pointer.down) continue;
				updatePointerMoveData(pointer, posX, posY);
			}
		}

		if (e.type === 'touchend') {
			const touches = e.changedTouches;
			for (let i = 0; i < touches.length; i++) {
				const pointer = pointers.find((p) => p.id == touches[i].identifier);
				if (pointer == null) continue;
				updatePointerUpData(pointer);
			}
		}
	}

	// Add event listeners only to canvas (decoupled from text/letters)
	function initializeEventListeners() {
		// Mouse events
		['mousedown', 'mousemove', 'mouseup', 'mouseout'].forEach((eventType) => {
			canvas.addEventListener(eventType, handlePointerEvent);
		});

		// Touch events
		['touchstart', 'touchmove', 'touchend'].forEach((eventType) => {
			canvas.addEventListener(eventType, handleTouchEvent, { passive: false });
		});

		// Window events
		window.addEventListener('keydown', handleKeyDown);
	}

	// Handle keydown events
	function handleKeyDown(e) {
		if (e.code === 'KeyP') config.PAUSED = !config.PAUSED;
		if (e.key === ' ') splatStack.push(parseInt(Math.random() * 20) + 5);
	}

	// Initialize event listeners after canvas setup
	initializeEventListeners();

	// Remove old event listeners
	canvas.removeEventListener('mousedown', () => {});
	canvas.removeEventListener('mousemove', () => {});
	canvas.removeEventListener('touchstart', () => {});
	canvas.removeEventListener('touchmove', () => {});
	window.removeEventListener('mouseout', () => {});
	window.removeEventListener('touchend', () => {});

	function updatePointerDownData(pointer, id, posX, posY) {
		pointer.id = id;
		pointer.down = true;
		pointer.moved = false;
		pointer.texcoordX = posX / canvas.width;
		pointer.texcoordY = 1.0 - posY / canvas.height;
		pointer.prevTexcoordX = pointer.texcoordX;
		pointer.prevTexcoordY = pointer.texcoordY;
		pointer.deltaX = 0;
		pointer.deltaY = 0;
		pointer.color = generateColor();
		// Reset velocity tracking
		pointer.velocityX = 0;
		pointer.velocityY = 0;
		pointer.lastTimestamp = performance.now();
		pointer.points = [];
		addPointerPoint(pointer, posX, posY, pointer.lastTimestamp);
	}

	function updatePointerMoveData(pointer, posX, posY) {
		const currentTimestamp = performance.now();
		const interpolatedPoints = handleFastMovement(pointer, posX, posY, currentTimestamp);

		interpolatedPoints.forEach((point) => {
			// Add point to history
			addPointerPoint(pointer, point.x, point.y, currentTimestamp);

			// Calculate velocity
			const velocity = calculateVelocity(pointer.points, currentTimestamp);

			// Smooth velocity
			pointer.velocityX += (velocity.vx - pointer.velocityX) * velocityConfig.velocitySmoothing;
			pointer.velocityY += (velocity.vy - pointer.velocityY) * velocityConfig.velocitySmoothing;

			// Update pointer coordinates
			pointer.prevTexcoordX = pointer.texcoordX;
			pointer.prevTexcoordY = pointer.texcoordY;
			pointer.texcoordX = point.x / canvas.width;
			pointer.texcoordY = 1.0 - point.y / canvas.height;

			// Use velocity-influenced delta
			const velocityScale = Math.min(Math.hypot(pointer.velocityX, pointer.velocityY) * 0.0001, 1);
			pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX) * (1 + velocityScale);
			pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY) * (1 + velocityScale);

			// Apply the fluid effect for each interpolated point
			if (Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0) {
				pointer.moved = true;
				splatPointer(pointer);
			}
		});

		pointer.lastTimestamp = currentTimestamp;
	}

	function updatePointerUpData(pointer) {
		pointer.down = false;
		// Clear velocity tracking
		pointer.velocityX = 0;
		pointer.velocityY = 0;
		pointer.points = [];
	}

	function correctDeltaX(delta) {
		let aspectRatio = canvas.width / canvas.height;
		if (aspectRatio < 1) delta *= aspectRatio;
		return delta;
	}

	function correctDeltaY(delta) {
		let aspectRatio = canvas.width / canvas.height;
		if (aspectRatio > 1) delta /= aspectRatio;
		return delta;
	}

	function generateColor() {
		return {
			r: Math.min((200 / 255) * 0.02),
			g: Math.min((200 / 255) * 0.02),
			b: Math.min((200 / 255) * 0.02),
		};
	}

	function HSVtoRGB(h, s, v) {
		let r, g, b, i, f, p, q, t;
		i = Math.floor(h * 6);
		f = h * 6 - i;
		p = v * (1 - s);
		q = v * (1 - f * s);
		t = v * (1 - (1 - f) * s);

		switch (i % 6) {
			case 0:
				((r = v), (g = t), (b = p));
				break;
			case 1:
				((r = q), (g = v), (b = p));
				break;
			case 2:
				((r = p), (g = v), (b = t));
				break;
			case 3:
				((r = p), (g = q), (b = v));
				break;
			case 4:
				((r = t), (g = p), (b = v));
				break;
			case 5:
				((r = v), (g = p), (b = q));
				break;
		}

		return {
			r,
			g,
			b,
		};
	}

	function normalizeColor(input) {
		let output = {
			r: input.r / 255,
			g: input.g / 255,
			b: input.b / 255,
		};
		return output;
	}

	function wrap(value, min, max) {
		let range = max - min;
		if (range == 0) return min;
		return ((value - min) % range) + min;
	}

	function getResolution(resolution) {
		let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
		if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

		let min = Math.round(resolution);
		let max = Math.round(resolution * aspectRatio);

		if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
		else return { width: min, height: max };
	}

	function getTextureScale(texture, width, height) {
		return {
			x: width / texture.width,
			y: height / texture.height,
		};
	}

	function scaleByPixelRatio(input) {
		let pixelRatio = window.devicePixelRatio || 1;
		return Math.floor(input * pixelRatio);
	}

	function hashCode(s) {
		if (s.length == 0) return 0;
		let hash = 0;
		for (let i = 0; i < s.length; i++) {
			hash = (hash << 5) - hash + s.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}
		return hash;
	}

	// Cleanup function to remove event listeners and cancel animation frame
	function cleanupFluidSimulation() {
		if (!canvas) return;

		//console.log('Running fluid simulation cleanup');

		// Reset canvas initialization state
		canvas.dataset.fluidInitialized = 'false';

		// Cancel animation frame
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}

		// Remove event listeners from canvas
		['mousedown', 'mousemove', 'mouseup', 'mouseout'].forEach((eventType) => {
			canvas.removeEventListener(eventType, handlePointerEvent);
		});

		// Remove touch event listeners
		['touchstart', 'touchmove', 'touchend'].forEach((eventType) => {
			canvas.removeEventListener(eventType, handleTouchEvent);
		});

		// Remove window event listeners
		window.removeEventListener('keydown', handleKeyDown);

		// Clear WebGL context if possible
		try {
			// Only attempt to get WebGL context if canvas is in the document
			if (canvas.isConnected) {
				const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
				const gl = canvas.getContext('webgl2', params) || canvas.getContext('webgl', params);

				if (gl && typeof gl.getExtension === 'function') {
					const loseContext = gl.getExtension('WEBGL_lose_context');
					if (loseContext) loseContext.loseContext();
				}
			}
		} catch (e) {
			console.log('Error cleaning up WebGL context:', e);
		}

		//console.log('Fluid simulation cleanup complete');
	}

	// Return cleanup function
	return cleanupFluidSimulation;
}

// Store the cleanup function
let cleanupFunction = null;
let isInitialized = false;

// Initialize when DOM is ready and handle Astro page transitions
document.addEventListener('astro:page-load', () => {
	// Only initialize if not already initialized
	if (!isInitialized) {
		// Clean up previous instance if it exists
		if (cleanupFunction) {
			try {
				cleanupFunction();
			} catch (e) {
				console.log('Error during cleanup:', e);
			}
			cleanupFunction = null;
		}

		// Initialize new instance
		try {
			// Check if the canvas exists before initializing
			const canvas = document.getElementById('fluidCanvas');
			if (canvas) {
				//console.log('Initializing fluid simulation');
				cleanupFunction = initFluidSimulation();
				isInitialized = true;
			}
		} catch (e) {
			console.log('Error initializing fluid simulation:', e);
			cleanupFunction = null;
			isInitialized = false;
		}
	}
});

// Clean up when navigating away
document.addEventListener('astro:before-preparation', () => {
	if (cleanupFunction) {
		try {
			//console.log('Cleaning up fluid simulation');
			cleanupFunction();
		} catch (e) {
			console.log('Error during cleanup:', e);
		}
		cleanupFunction = null;
		isInitialized = false;
	}
});

// Export the initialization and cleanup functions
export { initFluidSimulation };

// Also initialize directly when the script is loaded
// This handles the case when the page is loaded directly (not via view transition)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
	setTimeout(() => {
		const canvas = document.getElementById('fluidCanvas');
		if (canvas && !canvas.dataset.fluidInitialized) {
			//console.log('Direct initialization of fluid simulation');
			cleanupFunction = initFluidSimulation();
			isInitialized = true;
		}
	}, 0);
}
