import * as THREE from './vendor/three.module.min.js';

const WIDTH = 9.54;
const DEPTH = 6.36;

function roundedShape(width, depth, radius) {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -depth / 2;
  const top = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

function slab(width, depth, radius, height, y, material, bevel) {
  const geo = new THREE.ExtrudeGeometry(roundedShape(width, depth, radius), {
    depth: height, bevelEnabled: bevel > 0, bevelSegments: 3, bevelSize: bevel,
    bevelThickness: bevel * .64, steps: 1, curveSegments: 10,
  });
  const positions = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let index = 0; index < positions.count; index++) {
    uv.setXY(index, positions.getX(index) / width + .5, positions.getY(index) / depth + .5);
  }
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function textureFrom(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function woodGrain() {
  const tile = document.createElement('canvas');
  tile.width = 1024;
  tile.height = 512;
  const ctx = tile.getContext('2d');
  const image = ctx.createImageData(tile.width, tile.height);
  let state = 96581;
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const offset = y + 14 * Math.sin(x * .006) + 3 * Math.sin(x * .024 + y * .035);
      const stripe = 6 * Math.sin(offset * .21) + 2.1 * Math.sin(offset * 1.75) + 2.2 * Math.sin(offset * .048);
      const noise = ((state >>> 26) - 32) * .09;
      const index = (y * tile.width + x) * 4;
      image.data[index] = 58 + stripe + noise;
      image.data[index + 1] = 34 + stripe * .67 + noise;
      image.data[index + 2] = 31 + stripe * .5 + noise;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image,0,0);
  return textureFrom(tile);
}

function engrave(ctx, width, depth) {
  for (const [margin, color, line] of [[24,'#c9a674a8',2.3],[32,'#d8b78572',1.1],[39,'#ceb08335',1]]) {
    ctx.beginPath();
    ctx.roundRect(margin, margin, width - margin * 2, depth - margin * 2, 26);
    ctx.strokeStyle = color;
    ctx.lineWidth = line;
    ctx.stroke();
  }
  for (const [x,y,sx,sy] of [[46,47,1,1],[width-46,47,-1,1],[46,depth-47,1,-1],[width-46,depth-47,-1,-1]]) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(sx,sy);
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = '#debb807d';
    ctx.beginPath();
    ctx.moveTo(0,43);
    ctx.bezierCurveTo(0,15,18,0,48,0);
    ctx.moveTo(6,42);
    ctx.bezierCurveTo(11,23,20,19,42,8);
    ctx.moveTo(11,26);
    ctx.quadraticCurveTo(9,10,26,10);
    ctx.moveTo(23,16);
    ctx.quadraticCurveTo(39,17,39,9);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(width / 2, depth * .526);
  for (const [radius, alpha] of [[96,.11],[181,.16],[188,.10],[240,.07]]) {
    ctx.beginPath();
    ctx.arc(0,0,radius,0,Math.PI*2);
    ctx.strokeStyle = 'rgba(204,170,126,' + alpha + ')';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.strokeStyle = '#c5a47635';
  for (let index = 0; index < 72; index++) {
    const theta = index * Math.PI / 36;
    const outer = index % 6 === 0 ? 205 : 195;
    ctx.beginPath();
    ctx.moveTo(Math.cos(theta) * 192, Math.sin(theta) * 192);
    ctx.lineTo(Math.cos(theta) * outer, Math.sin(theta) * outer);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d2b27b34';
  ctx.beginPath();
  ctx.moveTo(0,-55);
  ctx.quadraticCurveTo(8,-9,52,0);
  ctx.quadraticCurveTo(8,9,0,55);
  ctx.quadraticCurveTo(-8,9,-52,0);
  ctx.quadraticCurveTo(-8,-9,0,-55);
  ctx.stroke();
  ctx.restore();
}

function clothedFelt(redraw) {
  const tile = document.createElement('canvas');
  tile.width = 1300;
  tile.height = 900;
  const ctx = tile.getContext('2d');
  const base = textureFrom(tile);
  function paint(photo) {
    ctx.fillStyle = '#33223d';
    ctx.fillRect(0,0,tile.width,tile.height);
    if (photo) {
      ctx.drawImage(photo,0,0,tile.width,tile.height);
      ctx.fillStyle = '#22132718';
      ctx.fillRect(0,0,tile.width,tile.height);
    }
    const nap = ctx.createLinearGradient(15,51,1230,870);
    nap.addColorStop(0,'#bfa1c727');
    nap.addColorStop(.32,'#a482b022');
    nap.addColorStop(.72,'#180b203a');
    nap.addColorStop(1,'#10091b37');
    ctx.fillStyle = nap;
    ctx.fillRect(0,0,tile.width,tile.height);
    // A soft window-shaped wash gives the fabric a directional sheen.
    ctx.save();
    ctx.translate(242,252);
    ctx.rotate(.49);
    ctx.scale(1.25,.55);
    const sweep = ctx.createRadialGradient(0,0,22,0,0,322);
    sweep.addColorStop(0,'#c5b5f245');
    sweep.addColorStop(.62,'#a99bdb24');
    sweep.addColorStop(1,'#aa9add00');
    ctx.fillStyle = sweep;
    ctx.fillRect(-350,-350,700,700);
    ctx.restore();
    engrave(ctx,tile.width,tile.height);
    base.needsUpdate = true;
  }
  paint();
  const photo = new Image();
  photo.onload = () => { paint(photo); redraw(); };
  photo.src = './velvet.webp';
  return base;
}

function candleAt(scene, x, z) {
  const stand = new THREE.Group();
  stand.position.set(x,0,z);
  const metal = new THREE.MeshStandardMaterial({ color:'#9c7149', roughness:.48, metalness:.7 });
  const wax = new THREE.MeshStandardMaterial({ color:'#d6c2a1', roughness:.94, emissive:'#70452f', emissiveIntensity:.37 });
  function cylinder(top,bottom,height,y,mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,28),mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    stand.add(mesh);
    return mesh;
  }
  cylinder(.28,.34,.045,.02,metal);
  cylinder(.12,.18,.18,.127,metal);
  cylinder(.21,.10,.075,.24,metal);
  cylinder(.115,.128,.34,.444,wax);
  const wick = cylinder(.012,.019,.068,.631,new THREE.MeshStandardMaterial({ color:'#34221f' }));
  wick.rotation.z = .17;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({ color:'#ffe3a7', toneMapped:false }));
  flame.scale.set(.047,.092,.046);
  flame.position.set(.013,.72,0);
  flame.rotation.z = -.2;
  stand.add(flame);
  const tile = document.createElement('canvas');
  tile.width = tile.height = 64;
  const ctx = tile.getContext('2d');
  const light = ctx.createRadialGradient(32,32,0,32,32,31);
  light.addColorStop(0,'#ffe4a3c8');
  light.addColorStop(.27,'#fbb36978');
  light.addColorStop(1,'#ff814400');
  ctx.fillStyle = light;
  ctx.fillRect(0,0,64,64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:textureFrom(tile), transparent:true, depthWrite:false, toneMapped:false }));
  glow.position.copy(flame.position);
  glow.scale.set(.62,.62,1);
  stand.add(glow);
  const point = new THREE.PointLight('#ffc183',3.4,4,2);
  point.position.set(0,.89,.06);
  stand.add(point);
  scene.add(stand);
  return stand;
}

function archedWindow(scene, redraw) {
  const group = new THREE.Group();
  group.position.set(-4.27, -.53, -5.05);
  group.scale.set(.83,.68,1);
  const shape = new THREE.Shape();
  shape.moveTo(-1.38,-1.5);
  shape.lineTo(1.38,-1.5);
  shape.lineTo(1.38,1.8);
  shape.quadraticCurveTo(1.38,3.15,0,3.67);
  shape.quadraticCurveTo(-1.38,3.15,-1.38,1.8);
  shape.closePath();
  const glass = new THREE.ShapeGeometry(shape,16);
  for (let i=0; i<glass.attributes.uv.count; i++) {
    glass.attributes.uv.setXY(i,.5 + glass.attributes.position.getX(i) * .27,(glass.attributes.position.getY(i)+1.5)/5.17);
  }
  const sky = new THREE.TextureLoader().load('./night-window.webp', redraw);
  sky.colorSpace = THREE.SRGBColorSpace;
  const pane = new THREE.Mesh(glass,new THREE.MeshBasicMaterial({ map:sky, color:'#ad9aba' }));
  group.add(pane);
  const frameMat = new THREE.MeshStandardMaterial({ color:'#34293b', roughness:.85 });
  const outline = shape.getSpacedPoints(62).map(pt => new THREE.Vector3(pt.x,pt.y,.038));
  const outlineCurve = new THREE.CatmullRomCurve3(outline);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(outlineCurve,62,.063,5,false),frameMat));
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(.052,5.1,.09),frameMat);
  pillar.position.set(0,1.05,.08);
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(2.8,.052,.088),frameMat);
  mullion.position.set(0,1.05,.08);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(3.1,.16,.35),frameMat);
  sill.position.set(0,-1.48,.13);
  group.add(pillar,mullion,sill);
  scene.add(group);
}

export function addRoom(scene, redraw) {
  const woodMap = woodGrain();
  const walnut = new THREE.MeshStandardMaterial({ map:woodMap, roughness:.68, metalness:.03, bumpMap:woodMap, bumpScale:.015 });
  const trim = new THREE.MeshStandardMaterial({ color:'#987447', roughness:.55, metalness:.61 });
  const top = new THREE.MeshStandardMaterial({ map:clothedFelt(redraw), roughness:.985 });
  const tabletop = new THREE.Group();
  const base = slab(WIDTH,DEPTH,.41,.235,-.403,walnut,.069);
  const fineEdge = slab(WIDTH+.058,DEPTH+.058,.44,.019,-.139,trim,.014);
  const outer = slab(WIDTH,DEPTH,.41,.106,-.13,walnut,.039);
  const insert = slab(WIDTH-.47,DEPTH-.47,.31,.035,-.031,top,.011);
  insert.castShadow = false;
  tabletop.add(base,fineEdge,outer,insert);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.8,.95,48),walnut);
  under.position.y = -.84;
  under.castShadow = true;
  scene.add(tabletop,under);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(54,42),
    new THREE.MeshStandardMaterial({ color:'#1c1625', roughness:1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.28;
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(56,16),
    new THREE.MeshBasicMaterial({ color:'#171121',toneMapped:false }));
  wall.position.set(0,5.6,-5.34);
  scene.add(floor,wall);
  archedWindow(scene, redraw);
  const candle = candleAt(scene,3.78,-2.38);

  const light = new THREE.DirectionalLight('#dcd6ff',2.35);
  light.position.set(-5.6,6.7,-3.3);
  light.castShadow = true;
  light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{ left:-6.2,right:6.2,top:6,bottom:-6,near:.5,far:21 });
  light.shadow.normalBias = .017;
  light.shadow.bias = -.00024;
  light.shadow.radius = 2.4;
  const fill = new THREE.DirectionalLight('#cbb7d6',.61);
  fill.position.set(0,5,7);
  scene.add(light,fill,new THREE.HemisphereLight('#eee3fb','#47314b',1.1));
  return {
    setCompact(compact) {
      tabletop.scale.z = compact ? 1.76 : 1;
      candle.position.set(compact ? 3.46 : 3.78,0,compact ? -4.22 : -2.38);
    },
  };
}
