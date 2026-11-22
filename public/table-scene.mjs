import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { addRoom } from './room.mjs';
import { cardPositions } from './table-layout.mjs';

const CARD_W = 0.93;
const CARD_H = 1.54;
const maxDpr = 1.65;

function labelFor(stage, item, index) {
  if (stage === 'cut') return '在第 ' + (index + 1) + ' 个位置切牌';
  if (stage === 'pick') return '选第 ' + (index + 1) + ' 张牌';
  if (!item.flipped) return '翻开' + item.position + '牌';
  return '查看' + item.name + '牌面';
}

export function createTable(host, controls, viewport, unavailable) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true, antialias: true, powerPreference: 'low-power', stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x170f23, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#15101e',.037);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 75);
  const world = new THREE.Group();
  scene.add(world);
  const room = addRoom(scene, requestFrame);

  function rect(w, h, color) {
    const r = .07;
    const shape = new THREE.Shape();
    shape.moveTo(-w/2+r,-h/2);
    shape.lineTo(w/2-r,-h/2);
    shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
    shape.lineTo(w/2,h/2-r);
    shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);
    shape.lineTo(-w/2+r,h/2);
    shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
    shape.lineTo(-w/2,-h/2+r);
    shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    const geometry = new THREE.BufferGeometry().setFromPoints(shape.getPoints(6).map(pt => new THREE.Vector3(pt.x,.025,pt.y)));
    return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .73 }));
  }
  const frames = Array.from({ length:10 }, () => {
    const outline = rect(1.08,1.67,'#c3a37c');
    world.add(outline);
    return outline;
  });
  const cardSize = new RoundedBoxGeometry(CARD_W, .055, CARD_H, 3, .024);
  const loader = new THREE.TextureLoader();
  const load = url => {
    const texture = loader.load(url, requestFrame, undefined, requestFrame);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const backTexture = load('./card-back.webp');
  const back = new THREE.MeshStandardMaterial({ map: backTexture, emissiveMap: backTexture, emissive: '#a597b4', emissiveIntensity: .38, roughness: .9, metalness: .03 });
  const edge = new THREE.MeshStandardMaterial({ color: '#c6a369', roughness: .63, metalness: .45 });
  const idleFace = new THREE.MeshStandardMaterial({ color: '#4d3b51', roughness: .95 });
  const known = new Map();
  const faceMaterials = new Map();
  const frameVector = new THREE.Vector3();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let previous = 0;
  let width = 0;
  let height = 0;
  let stage = 'pick';
  let targets = [];
  let hovered = '';
  let pointed = 0;
  let cameraShift = 0;
  let cameraZoom = 0;
  let compact = viewport.clientWidth / Math.max(1, viewport.clientHeight) < .83;
  let lastState;
  let running = true;
  let enabled = true;

  function materialFor(item) {
    if (!faceMaterials.has(item.id)) {
      const texture = load('./cards/' + item.id + '.jpg');
      faceMaterials.set(item.id, new THREE.MeshStandardMaterial({
        map: texture, roughness: .93, metalness: 0, emissive: '#36313c', emissiveIntensity: .08,
      }));
    }
    return faceMaterials.get(item.id);
  }

  function piece(key) {
    let node = known.get(key);
    if (node) return node;
    const base = new THREE.Group();
    const mesh = new THREE.Mesh(cardSize, [edge,edge,back,idleFace,edge,edge]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    base.add(mesh);
    world.add(base);
    base.position.set(0,.18,1.2);
    node = { base, mesh, pose: null, featured: false };
    known.set(key, node);
    return node;
  }

  function place(item, x, z, yaw, options = {}) {
    const { key = item.id, y = .045, flip = false, small = false, target, delay = 0, featured = false, scale = 1 } = options;
    const node = piece(key);
    node.base.visible = true;
    const facing = yaw + (flip && item.reversed ? Math.PI : 0);
    node.pose = { x, y, z, yaw:facing, flip: flip ? Math.PI : 0, small, scale, delay: performance.now() + delay };
    node.featured = featured;
    if (flip) {
      node.mesh.material[3] = materialFor(item);
    } else {
      node.mesh.material[3] = idleFace;
    }
    if (target) targets.push({ ...target, node, key });
    return node;
  }

  function caption(text, x, z) {
    const tag = document.createElement('span');
    tag.className = 'slot-caption';
    tag.textContent = text;
    tag.setAttribute('aria-hidden', 'true');
    controls.append(tag);
    targets.push({ tag, x, z });
  }

  function update(state) {
    lastState = state;
    stage = state.stage;
    controls.dataset.spread = state.spread;
    hovered = '';
    for (const node of known.values()) node.base.visible = false;
    targets = [];
    controls.replaceChildren();
    room.setCompact(compact);
    const slots = cardPositions(state.spread,compact);
    for (const [index, outline] of frames.entries()) {
      const slot = slots[index];
      outline.visible = Boolean(slot) && stage !== 'washing' && stage !== 'cut';
      if (slot) {
        outline.position.set(slot.x,0,slot.z);
        outline.scale.setScalar(slot.scale);
      }
    }

    if (stage === 'washing' || stage === 'cut') {
      const washing = stage === 'washing';
      for (let stack = 0; stack < 3; stack++) {
        for (let layer = 0; layer < 5; layer++) {
          const target = !washing && layer === 4 ? { action: 'cut', index: stack, label: labelFor('cut', null, stack) } : null;
          place(null, (stack - 1) * 1.58 + layer * .019, .06 + layer * .028, washing ? (stack - 1) * -.31 + layer * .12 : (stack - 1) * .035,
            { key: 'stack-' + stack + '-' + layer, y: .047 + layer * .05, target, delay: layer * 12 });
        }
        if (!washing) caption(['左叠','中叠','右叠'][stack], (stack - 1) * 1.58, 1.11);
      }
    } else {
      state.positions.forEach((position, index) => {
        const item = state.selected[index];
        const { x, z, scale } = slots[index];
        caption(position, x, z + .98 * scale);
        if (!item) return;
        const target = stage === 'pick' ? null
          : { action: item.flipped ? 'inspect' : 'flip', index, label: labelFor('slot', { ...item, position }, index) };
        place(item, x, z, 0, { flip: item.flipped, target, scale, featured: state.focus === index });
      });
      if (stage === 'pick') {
        const window = state.deck;
        window.forEach((item, index) => {
          if (state.selected.some(card => card.id === item.id)) return;
          const front = index >= 5;
          const offset = compact ? (front ? index - 6.5 : index - 2) : index - 4;
          const x = offset * (compact ? 1.11 : .81);
          const z = compact ? (front ? 2.34 : .95) + Math.abs(offset) * .09 : 1.11 + Math.abs(offset) * .11;
          place(item, x, z, -offset * (compact ? .071 : .095),
            { small: true, y: .06 + index * .008, delay: index * 15,
              target: { action: 'pick', index: item.index, order:index, label: labelFor('pick', item, item.index) } });
        });
      }
    }

    for (const info of targets) {
      if (!info.node) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'piece';
      button.dataset.action = info.action;
      button.dataset.index = info.index;
      button.setAttribute('aria-label', info.label);
      button.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') { hovered = info.key; requestFrame(); }
      });
      button.addEventListener('pointerleave', () => {
        if (hovered === info.key) { hovered = ''; requestFrame(); }
      });
      button.addEventListener('focus', () => { hovered = info.key; requestFrame(); });
      button.addEventListener('blur', () => { hovered = ''; requestFrame(); });
      info.button = button;
      controls.append(button);
    }
    requestFrame();
  }

  function requestFrame() {
    if (!frame && running && enabled) frame = requestAnimationFrame(draw);
  }

  const damp = THREE.MathUtils.damp;
  function draw(time) {
    frame = 0;
    if (!running || !enabled) return;
    const delta = Math.min(.05, Math.max((time - previous) / 1000, .012));
    previous = time;
    let moving = false;
    const still = reduceMotion.matches;
    for (const [key, node] of known) {
      if (!node.base.visible || !node.pose) continue;
      const { base, mesh, pose } = node;
      if (!still && time < pose.delay) { moving = true; continue; }
      const light = key === hovered || node.featured;
      const flipProgress = Math.abs(pose.flip - mesh.rotation.x);
      const lift = flipProgress > .025 && flipProgress < Math.PI - .025 ? .40 * Math.sin(flipProgress) : 0;
      const glide = Math.min(.56, Math.hypot(base.position.x - pose.x, base.position.z - pose.z) * .17);
      const nextY = pose.y + lift + glide + (light && pose.small ? .28 : 0);
      const smallScale = pose.small ? (compact ? .99 : .89) : pose.scale;
      const factor = light ? 1.055 * smallScale : smallScale;
      const values = [
        [base.position,'x',pose.x], [base.position,'y',nextY], [base.position,'z',pose.z],
        [base.rotation,'y',pose.yaw], [mesh.rotation,'x',pose.flip],
        [base.scale,'x',factor], [base.scale,'y',factor], [base.scale,'z',factor],
      ];
      for (const [obj, prop, dest] of values) {
        const gap = Math.abs(obj[prop] - dest);
        if (gap > .002 && !still) { obj[prop] = damp(obj[prop], dest, 11, delta); moving = true; }
        else obj[prop] = dest;
      }
    }
    const nextShift = still ? 0 : pointed;
    moving ||= Math.abs(nextShift - cameraShift) > .003;
    cameraShift = still ? 0 : damp(cameraShift, nextShift, 5, delta);
    const targetZoom = stage === 'reading' ? (compact ? .85 : .42)
      : stage === 'reveal' ? (compact ? .52 : .20) : 0;
    moving ||= !still && Math.abs(targetZoom - cameraZoom) > .002;
    cameraZoom = still ? targetZoom : damp(cameraZoom, targetZoom, 4, delta);
    camera.position.set(cameraShift, (compact ? 8.58 : 8.31) - cameraZoom, (compact ? 6.70 : 6.22) - cameraZoom * .55);
    camera.lookAt(.28 * cameraShift, 0, (compact ? .39 : .25) - cameraZoom * (compact ? 1.22 : .48));
    renderer.render(scene, camera);
    projectControls();
    if (moving) requestFrame();
  }

  function project(x, y, z) {
    frameVector.set(x,y,z).project(camera);
    return [(frameVector.x + 1) * width / 2, (1 - frameVector.y) * height / 2];
  }

  function projectControls() {
    for (const info of targets) {
      if (info.tag) {
        const [x,y] = project(info.x,.035,info.z);
        info.tag.style.left = x + 'px';
        info.tag.style.top = y + 'px';
        continue;
      }
      const { base, pose } = info.node;
      const pos = base.position;
      const [x,y] = project(pos.x,pos.y,pos.z);
      const [sx] = project(pos.x + CARD_W * (pose.small ? .33 : .51) * base.scale.x,pos.y,pos.z);
      const [,sy] = project(pos.x,pos.y,pos.z + CARD_H * .49 * base.scale.z);
      Object.assign(info.button.style, {
        left: x + 'px', top: y + 'px', width: Math.max(22, (sx-x) * 2) + 'px',
        height: Math.max(31, (sy-y) * 2) + 'px', zIndex: pose.small ? info.order + 1 : 12,
      });
    }
  }

  const observer = new ResizeObserver(([entry]) => {
    width = Math.max(1, entry.contentRect.width);
    height = Math.max(1, entry.contentRect.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const nextCompact = camera.aspect < .83;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(.27,(nextCompact ? .464 : .553) / camera.aspect)));
    camera.updateProjectionMatrix();
    if (compact !== nextCompact) {
      compact = nextCompact;
      if (lastState) update(lastState);
    }
    requestFrame();
  });
  observer.observe(viewport);
  host.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
    observer.disconnect();
    unavailable();
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reduceMotion.matches || width < 560) return;
    const bounds = viewport.getBoundingClientRect();
    pointed = ((event.clientX - bounds.left) / bounds.width - .5) * .31;
    requestFrame();
  });
  viewport.addEventListener('pointerleave', () => { pointed = 0; requestFrame(); });
  reduceMotion.addEventListener('change', requestFrame);

  return {
    update,
    setEnabled(value) {
      enabled = value;
      if (!enabled && frame) { cancelAnimationFrame(frame); frame = 0; }
      requestFrame();
    },
    setFocus(index) {
      for (const [key, node] of known) {
        const entry = targets.find(info => info.key === key);
        node.featured = entry?.action === 'inspect' && entry.index === index;
      }
      requestFrame();
    },
  };
}
