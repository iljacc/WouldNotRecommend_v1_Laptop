import * as THREE from "three";

/**
 * Full-viewport orthographic CCTV-style overlay (scanlines, vignette, grain, corner brackets).
 * Intended to sit in a wrapper with low CSS opacity (~0.1) for a subtle composite over GSV.
 */
export function mountCctvOverlay(container: HTMLElement): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.position.z = 1;

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform float uTime;

    void main() {
      vec2 uv = vUv;
      float yPx = uv.y * uResolution.y;
      float scan = smoothstep(0.0, 0.45, mod(yPx, 4.0)) * 0.14;

      vec2 c = uv - 0.5;
      float vig = 1.0 - dot(c, c) * 1.2;
      vig = smoothstep(0.25, 1.0, vig);

      float grain = sin(uv.x * 1200.0 + uTime * 2.1) * sin(uv.y * 900.0 - uTime * 1.7) * 0.012;

      vec3 base = vec3(0.015, 0.055, 0.028) * vig;
      vec3 scanRgb = vec3(0.04, 0.1, 0.055) * scan;
      vec3 color = base + scanRgb + vec3(grain * 0.4, grain * 0.9, grain * 0.5);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const uniforms = {
    uResolution: {
      value: new THREE.Vector2(container.clientWidth, container.clientHeight),
    },
    uTime: { value: 0 },
  };

  const quadMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  scene.add(quad);

  const margin = 0.035;
  const arm = 0.065;
  const yTop = 1 - margin;
  const yBot = -1 + margin;
  const xLeft = -1 + margin;
  const xRight = 1 - margin;

  const bracketPts: THREE.Vector3[] = [
    new THREE.Vector3(xLeft, yTop, 0),
    new THREE.Vector3(xLeft + arm, yTop, 0),
    new THREE.Vector3(xLeft, yTop, 0),
    new THREE.Vector3(xLeft, yTop - arm, 0),
    new THREE.Vector3(xRight, yTop, 0),
    new THREE.Vector3(xRight - arm, yTop, 0),
    new THREE.Vector3(xRight, yTop, 0),
    new THREE.Vector3(xRight, yTop - arm, 0),
    new THREE.Vector3(xLeft, yBot, 0),
    new THREE.Vector3(xLeft + arm, yBot, 0),
    new THREE.Vector3(xLeft, yBot, 0),
    new THREE.Vector3(xLeft, yBot + arm, 0),
    new THREE.Vector3(xRight, yBot, 0),
    new THREE.Vector3(xRight - arm, yBot, 0),
    new THREE.Vector3(xRight, yBot, 0),
    new THREE.Vector3(xRight, yBot + arm, 0),
  ];

  const bracketGeom = new THREE.BufferGeometry().setFromPoints(bracketPts);
  const bracketMat = new THREE.LineBasicMaterial({
    color: 0x55cc88,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const brackets = new THREE.LineSegments(bracketGeom, bracketMat);
  scene.add(brackets);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  let raf = 0;
  const t0 = performance.now();

  function tick() {
    raf = requestAnimationFrame(tick);
    uniforms.uTime.value = (performance.now() - t0) * 0.001;
    renderer.render(scene, camera);
  }
  tick();

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    uniforms.uResolution.value.set(w, h);
  });
  ro.observe(container);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    quadMat.dispose();
    quad.geometry.dispose();
    bracketGeom.dispose();
    bracketMat.dispose();
    renderer.dispose();
    if (canvas.parentNode === container) {
      container.removeChild(canvas);
    }
  };
}
