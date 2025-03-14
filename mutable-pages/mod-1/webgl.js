export function setupWebGL() {
  // === Setup Canvas and Context ===
  const canvas = document.getElementById("glcanvas");
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("WebGL not supported");
    return;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);

  // === Load Background Image via API with Keyboard Navigation ===
  let bgTexture = gl.createTexture();
  let bgImageLoaded = false;
  let bgImageUrls = []; // Will be fetched from backend API
  const config = {
    imageChangeInterval: 1000 // Interval in milliseconds
  };
  let currentImageIndex = 0;

  // Function to display the background image at currentImageIndex
  function displayBackgroundImage() {
    if (bgImageUrls.length === 0) {
      console.warn("No images available to load.");
      return;
    }
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous"; // Allow cross-origin image loading
    // Retrieve the image via the backend's /images route
    bgImg.src = "http://localhost:3001/images/" + bgImageUrls[currentImageIndex];
    bgImg.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, bgTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      bgImageLoaded = true;
      console.log("Background image loaded:", bgImg.width, bgImg.height);
    };
  }

  // Function to automatically advance the image (auto-rotation)
  function autoAdvanceImage() {
    displayBackgroundImage();
    currentImageIndex = (currentImageIndex + 1) % bgImageUrls.length;
  }

  // Fetch the image list from the backend API
  function fetchImageList() {
    fetch("http://localhost:3001/list-images")
      .then(response => response.json())
      .then(data => {
        bgImageUrls = data;
        // Load the first image immediately
        displayBackgroundImage();
        // Set up auto-advance
        setInterval(autoAdvanceImage, config.imageChangeInterval);
      })
      .catch(error => {
        console.error("Error fetching image list:", error);
      });
  }
  fetchImageList();

  // --- Keyboard Navigation ---
  // Left/right arrow keys jump between images.
  // Holding Shift jumps by 50 images, otherwise by 1.
  // Wraps around at the beginning/end.
  window.addEventListener("keydown", function(event) {
    if (bgImageUrls.length === 0) return;
    const jump = event.shiftKey ? 50 : 1;
    if (event.key === "ArrowRight") {
      currentImageIndex = (currentImageIndex + jump) % bgImageUrls.length;
      displayBackgroundImage();
    } else if (event.key === "ArrowLeft") {
      currentImageIndex = (currentImageIndex - jump + bgImageUrls.length) % bgImageUrls.length;
      displayBackgroundImage();
    }
  });

  // === Shader Sources ===
  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main(){
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment shader with scrolling, rotation, Perlin noise glitch,
  // original dispersion effect (channel 2), new 3D dispersion effect (channel 5),
  // invert effect (channel 3), plus apex glitch (channel 0) and horizontal glitch (channel 4)
  // applied globally, with wrapping.
  const bgFsSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_bgTexture;
    uniform float u_time;
    uniform float u_scrollSpeed;
    uniform float u_rotation;
    uniform float u_glitchIntensity;
    // Original dispersion effect (Channel 2)
    uniform float u_dispersion;
    // New 3D dispersion effect (Channel 5)
    uniform float u_dispersion3D;
    uniform float u_invert;
    // Apex glitch (Channel 0)
    uniform float u_apexGlitch;
    // Horizontal glitch (Channel 4)
    uniform float u_horizontalGlitch;

    // Perlin noise function (inline GLSL version)
    float rand(vec2 co) {
      return fract(sin(dot(co.xy ,vec2(12.9898, 78.233))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = rand(i);
      float b = rand(i + vec2(1.0, 0.0));
      float c = rand(i + vec2(0.0, 1.0));
      float d = rand(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    vec2 rotateUV(vec2 uv, float angle) {
      float cosA = cos(angle);
      float sinA = sin(angle);
      vec2 centeredUV = uv - 0.5;
      vec2 rotated = vec2(
        centeredUV.x * cosA - centeredUV.y * sinA,
        centeredUV.x * sinA + centeredUV.y * cosA
      );
      return rotated + 0.5;
    }

    void main(){
      // Scrolling & Rotation
      float scrollOffset = mod(v_texCoord.y - u_time * u_scrollSpeed, 1.0);
      vec2 scrolledUV = vec2(v_texCoord.x, scrollOffset);
      vec2 rotatedUV = rotateUV(scrolledUV, u_rotation);

      // Perlin noise-based glitch effect (Channel 1)
      float glitchEffect = noise(v_texCoord * 10.0 + u_time * 0.1) * u_glitchIntensity;
      rotatedUV.x += glitchEffect * 0.05;
      rotatedUV.y += glitchEffect * 0.02;

      // Apply apex glitch (Channel 0) and horizontal glitch (Channel 4) globally.
      // Note: horizontal glitch is now scaled by 0.05 so that its offset is in line with apex glitch.
      float apexNoise = noise(vec2(v_texCoord.x * 50.0, u_time * 5.0)) * u_apexGlitch;
      float hGlitch = noise(vec2(v_texCoord.y * 100.0, u_time * 5.0)) * u_horizontalGlitch;
      rotatedUV.x += apexNoise * 0.05 + hGlitch * 0.05;

      // --- Original Dispersion Effect (Channel 2) ---
      vec4 origColorSample = texture2D(u_bgTexture, rotatedUV);
      vec2 keyOrig = vec2(floor(origColorSample.r * 10.0), floor(origColorSample.g * 10.0));
      vec2 dispersionOffset = vec2(
        noise(keyOrig + u_time),
        noise(vec2(floor(origColorSample.b * 10.0), floor(origColorSample.r * 10.0)) + u_time)
      );
      vec2 uvOriginal = rotatedUV + dispersionOffset * u_dispersion;

      // --- New 3D Dispersion Effect (Channel 5) modified for Black & White ---
      vec4 colorSample = texture2D(u_bgTexture, rotatedUV);
      vec2 key = vec2(floor(colorSample.r * 10.0), floor(colorSample.g * 10.0));
      vec2 baseDispersion = vec2(
        noise(key + u_time),
        noise(vec2(floor(colorSample.b * 10.0), floor(colorSample.r * 10.0)) + u_time)
      );
      vec2 centeredUV = rotatedUV - 0.5;
      float depthFactor = 1.0 + length(centeredUV);
      vec2 offset = baseDispersion * u_dispersion3D * depthFactor;
      vec4 sampleColor = texture2D(u_bgTexture, mod(rotatedUV + offset, 1.0));
      float gray = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
      vec4 disp3dColor = vec4(vec3(gray), sampleColor.a);

      // Blend the original and 3D dispersion effects based on u_dispersion3D
      vec4 finalDispersion = mix(texture2D(u_bgTexture, mod(uvOriginal, 1.0)), disp3dColor, clamp(u_dispersion3D, 0.0, 1.0));

      // Invert effect (Channel 3)
      finalDispersion.rgb = mix(finalDispersion.rgb, 1.0 - finalDispersion.rgb, clamp(u_invert, 0.0, 1.0));

      gl_FragColor = finalDispersion;
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  const bgProgram = createProgram(gl, vsSource, bgFsSource);
  if (!bgProgram) {
    console.error("Failed to create shader program.");
    return;
  }

  // === Fullscreen Quad Setup ===
  const vertices = new Float32Array([
    -1.0, -1.0,  0.0, 0.0,
     1.0, -1.0,  1.0, 0.0,
    -1.0,  1.0,  0.0, 1.0,
     1.0, -1.0,  1.0, 0.0,
     1.0,  1.0,  1.0, 1.0,
    -1.0,  1.0,  0.0, 1.0
  ]);
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  function setupAttributes(program) {
    const posLoc = gl.getAttribLocation(program, "a_position");
    const texLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
  }

  // Existing MIDI-controlled variables
  let scrollSpeed = 0.1;
  let rotationAngle = 0.0;
  let glitchIntensity = 0.0;
  // Channel 2: Original dispersion effect
  let dispersion = 0.0;
  // Channel 5: New 3D dispersion effect
  let dispersion3D = 0.0;
  // Invert effect (Channel 3)
  let invert = 0.0;
  // Apex glitch (Channel 0)
  let apexGlitch = 0.0;
  // Horizontal glitch (Channel 4)
  let horizontalGlitch = 0.0;

  function render(time) {
    if (!bgImageLoaded) {
      requestAnimationFrame(render);
      return;
    }

    const t = time * 0.001;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(bgProgram);
    setupAttributes(bgProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.uniform1i(gl.getUniformLocation(bgProgram, "u_bgTexture"), 0);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_time"), t);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_scrollSpeed"), scrollSpeed);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_rotation"), rotationAngle);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_glitchIntensity"), glitchIntensity);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_dispersion"), dispersion);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_dispersion3D"), dispersion3D);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_invert"), invert);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_apexGlitch"), apexGlitch);
    gl.uniform1f(gl.getUniformLocation(bgProgram, "u_horizontalGlitch"), horizontalGlitch);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // === MIDI Integration ===
  const ws = new WebSocket("ws://localhost:8080/midi/stream");
  ws.onmessage = (event) => {
    const message = event.data.trim();
    const match = message.match(/pitchwheel channel=(\d+) pitch=(-?\d+)/);
    if (!match) return;
    const channel = parseInt(match[1]);
    const pitch = parseInt(match[2]);
    const normalized = (pitch + 8192) / (8192 + 8064);

    // Channel mappings:
    // Channel 0: Apex Twin–style overall canvas glitch
    if (channel === 0) apexGlitch = normalized * 10.0;
    // Channel 1: Perlin noise glitch intensity (unchanged)
    if (channel === 1) glitchIntensity = normalized * 10.0;
    // Channel 2: Original dispersion effect
    if (channel === 2) dispersion = normalized * 2.5;
    // Channel 3: Invert effect
    if (channel === 3) invert = normalized;
    // Channel 4: Horizontal glitch effect
    if (channel === 4) horizontalGlitch = normalized * 50.0;
    // Channel 5: New 3D dispersion effect
    if (channel === 5) dispersion3D = normalized * 2.5;
    // Channel 6: Scroll speed (unchanged)
    if (channel === 6) scrollSpeed = normalized * 0.5;
    // Channel 7: Rotation angle (unchanged)
    if (channel === 7) rotationAngle = (normalized - 0.5) * Math.PI;
  };
}
