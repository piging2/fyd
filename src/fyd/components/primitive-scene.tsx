"use client";

import { useEffect, useRef } from "react";

export type PrimitiveSceneConcept = "continuity" | "evidence" | "knowledge";
export type PrimitiveSceneProps = {
  concept: PrimitiveSceneConcept;
  phase: number;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
};

// Self-hosted, pinned MIT runtime. No WebGL or runtime request occurs until mounted.
// A variable import keeps the optional runtime out of the route's initial JS bundle.
const runtimePath = "/vendor/three/three.module.min.js";
const loadThree = () => import(/* webpackIgnore: true */ runtimePath);
type Three = Awaited<ReturnType<typeof loadThree>>;
type Node = InstanceType<Three["Object3D"]>;
type Geometry = InstanceType<Three["BufferGeometry"]>;
type Material = InstanceType<Three["Material"]>;
type Pose = { p: [number, number, number]; r: [number, number, number]; s: [number, number, number] };
type Actor = { node: Node; poses: [Pose, Pose, Pose] };
type Controller = { setPhase: (phase: number) => void; dispose: () => void };
const clampPhase = (phase: number) => Math.min(2, Math.max(0, Number.isFinite(phase) ? phase : 0));
const pose = (
  p: Pose["p"] = [0, 0, 0], r: Pose["r"] = [0, 0, 0], s: number | Pose["s"] = 1,
): Pose => ({ p, r, s: typeof s === "number" ? [s, s, s] : s });

/** Decorative, local teaching model. The surrounding HTML supplies its meaning. */
export function PrimitiveScene({ concept, phase, className, onReady, onError }: PrimitiveSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<Controller | null>(null);
  const latest = useRef({ phase, onReady, onError });
  latest.current = { phase, onReady, onError };

  useEffect(() => {
    let cancelled = false;
    const element = host.current;
    if (!element) return;
    element.dataset.sceneState = "loading";
    loadThree().then((THREE) => {
      if (cancelled) return;
      controller.current = createScene(THREE, element, concept, latest.current.phase, () => {
        if (!cancelled) { element.dataset.sceneState = "ready"; latest.current.onReady?.(); }
      }, () => {
        if (!cancelled) { element.dataset.sceneState = "error"; latest.current.onError?.(); }
      });
    }).catch(() => {
      if (!cancelled) { element.dataset.sceneState = "error"; latest.current.onError?.(); }
    });
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
    };
  }, [concept]);

  useEffect(() => { controller.current?.setPhase(phase); }, [phase]);

  return <div ref={host} className={className} data-primitive-scene={concept}
    aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}

function createScene(
  T: Three, host: HTMLDivElement, concept: PrimitiveSceneConcept, initialPhase: number,
  onReady: () => void, onError: () => void,
): Controller {
  // Register ownership as each allocation succeeds. The same idempotent ledger
  // handles partial initialization, context fallbacks, and ordinary unmounts.
  const releases: (() => void)[] = [];
  let disposed = false;
  const own = (release: () => void) => {
    let released = false;
    const once = () => { if (!released) { released = true; release(); } };
    releases.push(once);
    return once;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (let i = releases.length - 1; i >= 0; i--) {
      // One failing driver cleanup must not strand the remaining resources.
      try { releases[i](); } catch { /* Continue releasing owned resources. */ }
    }
    releases.length = 0;
  };
  try {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  own(() => renderer.domElement.remove());
  own(() => renderer.forceContextLoss());
  own(() => renderer.dispose());
  own(() => renderer.renderLists.dispose());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;opacity:1";
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(4.3, 2.7, 7.3);
  camera.lookAt(0, -0.04, 0);
  const root = new T.Group();
  scene.add(root);
  const actors: Actor[] = [];
  const geometry = (g: Geometry) => { own(() => g.dispose()); return g; };
  const material = (parameters: Record<string, unknown>) => {
    const m = new T.MeshPhysicalMaterial(parameters); own(() => m.dispose()); return m;
  };
  const obsidian = material({ color: 0x1a0e38, metalness: 0.91, roughness: 0.23, clearcoat: 1, clearcoatRoughness: 0.12 });
  const violet = material({ color: 0x7340c8, metalness: 0.79, roughness: 0.21, clearcoat: 1, clearcoatRoughness: 0.08 });
  const ink = material({ color: 0x0b0914, metalness: 0.72, roughness: 0.34, clearcoat: 0.4, envMapIntensity: 0.28 });
  const gold = material({ color: 0xe6b778, metalness: 0.95, roughness: 0.24, clearcoat: 0.4 });
  const pale = material({ color: 0xb2a1d5, metalness: 0.77, roughness: 0.22 });
  const glass = material({ color: 0x7a40db, metalness: 0.33, roughness: 0.16, transparent: true,
    opacity: 0.18, depthWrite: false, clearcoat: 1, side: T.DoubleSide });
  const glow = material({ color: 0xbf82ff, emissive: 0x7833df, emissiveIntensity: 1.1,
    metalness: 0.42, roughness: 0.27 });
  const thread = material({ color: 0xa489d4, metalness: 0.7, roughness: 0.38 });

  // A low-resolution studio light field gives actual reflected depth to the metal.
  const lightField = document.createElement("canvas");
  lightField.width = 1024; lightField.height = 512;
  const context = lightField.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const background = context.createLinearGradient(0, 0, 0, 512);
  background.addColorStop(0, "#504364"); background.addColorStop(0.46, "#110d1d"); background.addColorStop(1, "#07060c");
  context.fillStyle = background; context.fillRect(0, 0, 1024, 512);
  const softbox = (x: number, y: number, w: number, h: number, color: string) => {
    context.save(); context.shadowColor = color; context.shadowBlur = 28;
    context.fillStyle = color; context.fillRect(x, y, w, h); context.restore();
  };
  softbox(95, 80, 88, 220, "#fff2db");
  softbox(320, 100, 22, 270, "#b494fa");
  softbox(620, 50, 140, 100, "#f4e9ff");
  softbox(850, 130, 38, 210, "#a271eb");
  const fieldTexture = new T.CanvasTexture(lightField);
  const releaseFieldTexture = own(() => fieldTexture.dispose());
  fieldTexture.mapping = T.EquirectangularReflectionMapping;
  fieldTexture.colorSpace = T.SRGBColorSpace;
  const pmrem = new T.PMREMGenerator(renderer);
  const releasePmrem = own(() => pmrem.dispose());
  const environment = pmrem.fromEquirectangular(fieldTexture);
  own(() => environment.dispose());
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.1;
  releaseFieldTexture(); releasePmrem();

  scene.add(new T.HemisphereLight(0xe6d6ff, 0x130b1a, 1.2));
  const key = new T.DirectionalLight(0xffebd0, 3.5); key.position.set(-3, 5, 5); scene.add(key);
  const rim = new T.DirectionalLight(0x9955ff, 5); rim.position.set(3, 2, -3); scene.add(rim);
  const fill = new T.DirectionalLight(0xe4dbff, 2); fill.position.set(0, -1, 5); scene.add(fill);

  const mesh = (g: Geometry, m: Material, parent: Node = root) => {
    const object = new T.Mesh(g, m); parent.add(object); return object;
  };
  const torusGeometry = (r: number, tube: number, radial = 16) => geometry(new T.TorusGeometry(r, tube, radial, 112));
  const torus = (r: number, tube: number, m: Material, parent: Node = root) => mesh(torusGeometry(r, tube), m, parent);
  const animate = (node: Node, poses: Actor["poses"]) => { actors.push({ node, poses }); return node; };
  const sphere = geometry(new T.SphereGeometry(1, 24, 16));
  const box = geometry(new T.BoxGeometry(1, 1, 1));

  // The plinth remains fixed while the retained object changes its organization.
  const plinth = new T.Group(); root.add(plinth); plinth.position.y = -1.68;
  const profile = [[0, 0], [1.48, 0], [1.56, .055], [1.56, .11], [1.48, .17], [0, .17]];
  mesh(geometry(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 96)), ink, plinth);
  const lip = torus(1.47, .022, gold, plinth); lip.rotation.x = Math.PI / 2; lip.position.y = .14;
  const lowerLip = torus(1.56, .014, violet, plinth); lowerLip.rotation.x = Math.PI / 2; lowerLip.position.y = .025;
  const halo = torus(1.33, .026, glow, plinth); halo.rotation.x = Math.PI / 2; halo.position.y = .19;
  const innerHalo = torus(.89, .009, gold, plinth); innerHalo.rotation.x = Math.PI / 2; innerHalo.position.y = .18;
  // Ground contact is painted once into a tiny texture, not rendered every frame.
  const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d")!;
  const shadowGradient = shadowContext.createRadialGradient(64, 64, 7, 64, 64, 63);
  shadowGradient.addColorStop(0, "rgba(2,1,8,.8)"); shadowGradient.addColorStop(.48, "rgba(30,8,61,.3)"); shadowGradient.addColorStop(1, "rgba(2,1,8,0)");
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new T.CanvasTexture(shadowCanvas);
  own(() => shadowTexture.dispose());
  const shadowMaterial = new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  own(() => shadowMaterial.dispose());
  const shadow = mesh(geometry(new T.PlaneGeometry(6, 6)), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.7;

  const link = (a: Node, b: Node, radius: number, m: Material, parent: Node = root) => {
    const line = mesh(geometry(new T.CylinderGeometry(radius, radius, 1, 8)), m, parent);
    return () => {
      const direction = new T.Vector3().subVectors(b.position, a.position);
      line.position.copy(a.position).add(b.position).multiplyScalar(.5);
      line.scale.y = direction.length();
      line.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
    };
  };
  const updates: (() => void)[] = [];

  if (concept === "continuity") {
    for (let i = 0; i < 3; i++) {
      const ring = new T.Group(); root.add(ring);
      torus(1.02, .2, i === 1 ? violet : obsidian, ring);
      const inset = torus(.845, .032, gold, ring); inset.position.z = .085;
      const outer = torus(1.18, .015, i === 1 ? pale : gold, ring); outer.position.z = -.055;
      const seam = torus(1.075, .018, glow, ring); seam.position.z = .181;
      // Fine, physical machining lines catch the studio strip lights.
      for (let j = 0; j < 3; j++) {
        const score = torus(.99 + j * .047, .006, pale, ring); score.position.z = .2 - j * .006;
      }
      if (i === 0) animate(ring, [pose([0, .02, 0], [.08, -.24, -.16]), pose([-.37, .05, 0], [.07, -.5, -.15]), pose([0, .04, 0], [.08, -.25, -.16])]);
      if (i === 1) animate(ring, [pose([0, .02, 0], [.08, -.24, -.16], .001), pose([.49, .12, .14], [.08, .79, .14], .82), pose([0, .04, -.21], [.13, -.4, -.04], 1.1)]);
      if (i === 2) animate(ring, [pose([0, .02, 0], [.08, -.24, -.16], .001), pose([.49, .12, .14], [.08, .79, .14], .001), pose([0, .04, .24], [-.05, -.1, -.25], .89)]);
    }
  } else if (concept === "evidence") {
    const assembly = new T.Group(); root.add(assembly); assembly.rotation.y = -.25;
    const plateShape = new T.Shape();
    plateShape.moveTo(-.77, -.64); plateShape.lineTo(.77, -.64);
    plateShape.quadraticCurveTo(.82, -.64, .82, -.59); plateShape.lineTo(.82, .59);
    plateShape.quadraticCurveTo(.82, .64, .77, .64); plateShape.lineTo(-.77, .64);
    plateShape.quadraticCurveTo(-.82, .64, -.82, .59); plateShape.lineTo(-.82, -.59);
    plateShape.quadraticCurveTo(-.82, -.64, -.77, -.64);
    const plateGeometry = geometry(new T.ExtrudeGeometry(plateShape, {
      depth: .07, bevelEnabled: true, bevelSize: .014, bevelThickness: .015, bevelSegments: 2, steps: 1, curveSegments: 4,
    }));
    plateGeometry.translate(0, 0, -.035); plateGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const plate = new T.Group(); assembly.add(plate);
      mesh(plateGeometry, i % 2 ? violet : obsidian, plate);
      // Edges are actual thin strips, avoiding screen-space diagram treatment.
      for (const z of [-.64, .64]) { const bar = mesh(box, gold, plate); bar.scale.set(1.65, .018, .02); bar.position.set(0, .061, z); }
      for (const x of [-.82, .82]) { const bar = mesh(box, gold, plate); bar.scale.set(.02, .018, 1.3); bar.position.set(x, .061, 0); }
      const inscription = mesh(box, pale, plate); inscription.scale.set(.65, .005, .035); inscription.position.set(-.15, .057, -.19);
      for (let j = 0; j < 3; j++) {
        const mark = mesh(box, i === 0 ? gold : pale, plate); mark.scale.set(.9 - j * .18, .006, .018); mark.position.set(-j * .09, .057, .04 + j * .13);
      }
      animate(plate, [pose([0, .02 + i * .022, i * -.1], [1.35, 0, -.13]),
        pose([0, -.94 + i * .65, 0], [0, i * .13 - .15, 0]),
        pose([0, -.83 + i * .5, 0], [0, 0, 0])]);
    }
    const packet = mesh(geometry(new T.OctahedronGeometry(.25)), gold, assembly);
    animate(packet, [pose([0, -.23, .36], [0, 0, 0], .64), pose([0, .04, 0], [.3, .4, .1]), pose([0, -.08, 0], [.3, .4, .1])]);
    const enclosure = mesh(box, glass, assembly);
    animate(enclosure, [pose([0, -.05, 0], [0, 0, 0], .001), pose([0, -.05, 0], [0, 0, 0], .001), pose([0, -.05, 0], [0, 0, 0], [1.91, 2.0, 1.56])]);
    for (const x of [-.95, .95]) for (const z of [-.78, .78]) {
      const pillar = mesh(box, gold, assembly);
      animate(pillar, [pose([x, -.05, z], [0, 0, 0], .001), pose([x, -.05, z], [0, 0, 0], .001), pose([x, -.05, z], [0, 0, 0], [.018, 2, .018])]);
    }
  } else {
    const graph = new T.Group(); root.add(graph); graph.rotation.y = -.36;
    const nucleus = mesh(geometry(new T.IcosahedronGeometry(.39, 1)), obsidian, graph);
    const coreBand = torus(.40, .014, gold, nucleus); coreBand.rotation.x = Math.PI / 2;
    const nodes: Node[] = [];
    for (let i = 0; i < 16; i++) {
      const y = 1 - (i / 15) * 2;
      const r = Math.sqrt(1 - y * y), angle = i * Math.PI * (3 - Math.sqrt(5));
      const final: [number, number, number] = [Math.cos(angle) * r * 1.28, y * 1.28, Math.sin(angle) * r * 1.28];
      const node = mesh(sphere, i % 4 === 0 ? gold : violet, graph);
      const a = (i % 6) / 6 * Math.PI * 2;
      const start: [number, number, number] = [Math.cos(a) * 1.18, Math.sin(a) * 1.18, (i % 2 ? -.22 : .22)];
      const mid: [number, number, number] = [final[0] * 1.14, final[1], final[2] * .68];
      animate(node, [pose(start, [0, 0, 0], i < 6 ? .105 : .001), pose(mid, [0, 0, 0], .08), pose(final, [0, 0, 0], .06)]);
      nodes.push(node);
      if (i < 6) updates.push(link(nucleus, node, .014, thread, graph));
    }
    // Retain the original six spokes and add relationships around them.
    for (let i = 0; i < nodes.length; i++) {
      const connection = new T.Group(); graph.add(connection);
      updates.push(link(nodes[i], nodes[(i + 5) % nodes.length], .009, i % 4 === 0 ? gold : thread, connection));
      animate(connection, [pose([0, 0, 0], [0, 0, 0], .001), pose(), pose()]);
    }
    const globe = mesh(sphere, material({ color: 0x190c34, metalness: .58, roughness: .26,
      transparent: true, opacity: .77, depthWrite: false, clearcoat: 1 }), graph);
    animate(globe, [pose([0, 0, 0], [0, 0, 0], .001), pose([0, 0, 0], [0, 0, 0], .001), pose([0, 0, 0], [0, 0, 0], 1.23)]);
    for (let i = 0; i < 4; i++) {
      const meridian = torus(1.26, .008, i === 0 ? gold : thread, graph);
      animate(meridian, [pose([0, 0, 0], [0, i * Math.PI / 4, 0], .001), pose([0, 0, 0], [0, i * Math.PI / 4, 0], .001), pose([0, 0, 0], [0, i * Math.PI / 4, 0])]);
    }
    const orbit = torus(1.47, .012, gold, graph);
    animate(orbit, [pose([0, 0, 0], [1.15, .2, .12], .001), pose([0, 0, 0], [1.15, .2, .12], .001), pose([0, 0, 0], [1.15, .2, .12])]);
  }

  let alive = true, failed = false, ready = false, frame = 0;
  let visible = true, current = clampPhase(initialPhase), target = current;
  let from = current, started = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyPose = (phase: number) => {
    const index = Math.min(1, Math.floor(phase)), mix = phase - index;
    for (const { node, poses } of actors) {
      const a = poses[index], b = poses[index + 1];
      node.position.set(...a.p.map((value, axis) => value + (b.p[axis] - value) * mix));
      node.rotation.set(...a.r.map((value, axis) => value + (b.r[axis] - value) * mix));
      node.scale.set(...a.s.map((value, axis) => value + (b.s[axis] - value) * mix));
    }
    updates.forEach(update => update());
  };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  own(() => { alive = false; stop(); });
  const fail = () => { if (failed || !alive) return; failed = true; stop(); onError(); };
  const draw = () => {
    if (!alive || failed || !visible || document.hidden) return;
    try {
      applyPose(current); renderer.render(scene, camera);
      if (!ready) { ready = true; onReady(); }
    } catch { fail(); }
  };
  const tick = (time: number) => {
    frame = 0;
    if (!alive || failed || !visible || document.hidden) return;
    if (!started) started = time;
    const progress = Math.min(1, (time - started) / 920);
    const eased = progress * progress * (3 - 2 * progress);
    current = from + (target - from) * eased;
    draw();
    if (progress < 1 && !failed) frame = requestAnimationFrame(tick);
    else { current = target; host.dataset.sceneMotion = "settled"; }
  };
  const settle = () => { stop(); current = target; started = 0; host.dataset.sceneMotion = "settled"; draw(); };
  const resize = () => {
    if (!alive || failed) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(4.3, 2.7, 7.3).multiplyScalar(camera.aspect < 1 ? 1 / camera.aspect : 1);
    camera.lookAt(0, -.04, 0); camera.updateProjectionMatrix(); draw();
  };
  const resizeObserver = new ResizeObserver(resize);
  own(() => resizeObserver.disconnect());
  resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) stop(); else settle();
  }, { threshold: 0 });
  own(() => visibilityObserver.disconnect());
  visibilityObserver.observe(host);
  const visibilityChange = () => { if (document.hidden) stop(); else settle(); };
  const motionChange = () => { if (motion.matches) settle(); };
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  document.addEventListener("visibilitychange", visibilityChange);
  own(() => document.removeEventListener("visibilitychange", visibilityChange));
  motion.addEventListener("change", motionChange);
  own(() => motion.removeEventListener("change", motionChange));
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  own(() => renderer.domElement.removeEventListener("webglcontextlost", contextLost));
  resize();

  return {
    setPhase: (phase) => {
      target = clampPhase(phase);
      if (!alive || failed || target === current) return;
      stop();
      if (motion.matches || !visible || document.hidden) { settle(); return; }
      from = current; started = 0; host.dataset.sceneMotion = "transitioning";
      frame = requestAnimationFrame(tick);
    },
    dispose,
  };
  } catch (error) {
    dispose();
    throw error;
  }
}
