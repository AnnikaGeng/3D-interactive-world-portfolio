import * as THREE from 'three';

export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const smooth = (a: number, b: number, n: number) => { const t = clamp((n-a)/(b-a)); return t*t*(3-2*t); };
export function hash(x: number, y: number) { const n = Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); }
export function noise(x: number, y: number) {
  const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
}
export function fbm(x:number,y:number) { return noise(x,y)*.58 + noise(x*2.1+4,y*2.1)*.27 + noise(x*4.3,y*4.3+7)*.1 + noise(x*8.7,y*8.7)*.05; }
const valleyPath = new THREE.SplineCurve([
 new THREE.Vector2(-240,-150),new THREE.Vector2(-140,-110),new THREE.Vector2(-90,-50),
 new THREE.Vector2(-40,24),new THREE.Vector2(10,83),new THREE.Vector2(58,64),
 new THREE.Vector2(105,12),new THREE.Vector2(150,-12),new THREE.Vector2(190,12),
 new THREE.Vector2(225,-9),new THREE.Vector2(260,8),new THREE.Vector2(305,-5),
 new THREE.Vector2(350,4),new THREE.Vector2(410,0),new THREE.Vector2(460,0),
]);
export function pathX(s:number) {
 const original=Math.sin(s*.013)*13 + Math.sin(s*.027+.6)*7;
 if(s>=460)return original;
 // Explicit bends establish the reference composition before the climb begins.
 const knots=valleyPath.points;let i=0;while(i<knots.length-2&&s>knots[i+1].x)i++;
 const t=smooth(knots[i].x,knots[i+1].x,s);
 const x=THREE.MathUtils.lerp(knots[i].y,knots[i+1].y,t);
 return THREE.MathUtils.lerp(x,original,smooth(330,460,s));
}
export function trailWidth(s:number) {return THREE.MathUtils.lerp(10,2.3,smooth(-130,160,s));}
// The ascent opening (31% travel) places the traveler at s ≈ 430.
export const CLIMB_ROPE={start:430,full:470,release:755,end:815};
export function climbRopeBlend(s:number){return smooth(CLIMB_ROPE.start,CLIMB_ROPE.full,s)*(1-smooth(CLIMB_ROPE.release,CLIMB_ROPE.end,s));}
/** Distance to the curved painted stroke, including neighbouring bends. */
export function nearTrail(x:number,s:number,padding=0){
 const reach=12+padding;
 for(let t=s-reach;t<=s+reach;t+=1){
  if(Math.hypot(x-pathX(t),s-t)<trailWidth(t)+padding)return true;
 }
 return false;
}
function valleyHeight(x:number,s:number) {
 const mound=(cx:number,cs:number,wx:number,ws:number,h:number)=>h*Math.exp(-Math.pow((x-cx)/wx,2)-Math.pow((s-cs)/ws,2));
 const left=mound(-220,-20,105,130,112)+mound(-190,180,85,95,88)+mound(-265,345,130,100,102);
 const right=mound(250,70,110,150,143)+mound(170,260,85,100,105)+mound(300,380,140,110,119);
 const folds=(fbm(x*.024,s*.021)-.4)*.19;
 const front=mound(150,-63,108,78,63)+mound(-185,-170,100,65,34);
 const distant=mound(-90,355,70,80,37)+mound(92,430,110,76,55)+mound(-100,220,75,43,32)+mound(100,315,82,48,44);
 return 3+(left+right)*(1+folds)+front+distant;
}
export function elevation(s:number) { return 155*smooth(330,730,s) - 155*smooth(885,1280,s); }
/** The sea plane's height, and the stretch of the route it covers. */
export const SEA_LEVEL = -0.3;
export const SEA_FROM = 1040;
/** True where ground is under water — nothing should be planted there. */
export function underwater(x:number,s:number) {
  if (lakeMask(x,s) > .02) return true;
  return s > SEA_FROM && terrainHeight(x,s) < SEA_LEVEL + 1.4;
}

/** A lake in the valley floor, placed where the reference painting has one. */
export const LAKE = {x:-52, s:22, rx:68, rz:44, surface:3.1};
/** Radius multiplier by bearing — a few harmonics, so the outline reads as a
 *  lake rather than as an ellipse. */
function lakeWobble(a:number) {
  return 1 + Math.sin(a*2.3+1.1)*.09 + Math.sin(a*3.7-.4)*.055 + Math.sin(a*5.1+2.2)*.03;
}

/** 1 inside the basin, falling to 0 at its shore. */
export function lakeMask(x:number,s:number) {
  const dx=(x-LAKE.x)/LAKE.rx, ds=(s-LAKE.s)/LAKE.rz;
  const w=lakeWobble(Math.atan2(ds,dx));
  return 1 - smooth(.8*w,1.04*w,Math.hypot(dx,ds));
}

/**
 * A point on the ring the deer walks, just outside the shore, and the ground
 * height there. Same outline as the lake so the walk follows its shape rather
 * than tracing a circle beside it.
 */
export function lakeShore(a:number, out:THREE.Vector3, spread=1.34) {
  const r=lakeWobble(a)*spread;
  const x=LAKE.x+Math.cos(a)*LAKE.rx*r, s=LAKE.s+Math.sin(a)*LAKE.rz*r;
  return out.set(x, terrainHeight(x,s), -s);
}

/**
 * The water surface, following the same irregular outline as the basin.
 *
 * Deliberately run out to the full shore radius rather than stopping at the
 * waterline: past that the ground has risen back above the surface and hides
 * the overhang, so the visible edge lands exactly where the terrain meets the
 * water without having to solve for it.
 */
export function makeLakeSurface() {
  const seg=120, position:number[]=[LAKE.x,LAKE.surface,-LAKE.s], index:number[]=[];
  for(let i=0;i<seg;i++){
    // Past the shore radius on purpose: out there the ground has climbed back
    // above the surface and hides the overhang, so the visible edge is always
    // cut by the terrain rather than by where this polygon happens to stop.
    const a=i/seg*Math.PI*2, r=lakeWobble(a)*1.12;
    position.push(LAKE.x+Math.cos(a)*LAKE.rx*r, LAKE.surface, -(LAKE.s+Math.sin(a)*LAKE.rz*r));
    index.push(0,1+i,1+((i+1)%seg));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  g.setIndex(index); g.computeVertexNormals(); return g;
}

export function terrainHeight(x:number,s:number) {
  const center=pathX(s),d=Math.abs(x-center);
  const canyon=1-smooth(350,730,s);
  // A wider, gentler valley floor. The walls used to start climbing almost at
  // the trail's edge, which reads as oppressive from a camera down in it and
  // leaves no room for anything on the floor.
  const corridor=22 + 88*(1-smooth(170,430,s)) + 10*smooth(680,780,s);
  const rise=smooth(corridor*.62,corridor+120,d);
  const mountain=38 + 106*fbm(x*.011,s*.009) + 26*Math.sin(s*.009+x*.012);
  const ridge=1-Math.abs(noise(x*.03,s*.014)*2-1);
  const detail=(fbm(x*.055,s*.049)-.5)*16;
  const folds=Math.sin(x*.15+noise(s*.022,3)*4)*5 + (1-Math.abs(noise(x*.07,s*.031)*2-1))*9;
  // Lower the walls where the camera is down on the valley floor. Pushing them
  // back is not enough on its own — from a low viewpoint a wall this tall still
  // fills the frame and the shot reads as a corridor rather than a landscape.
  const inValley=1-smooth(300,580,s);
  const shoulder=rise*(mountain+ridge*20+detail+folds)*(1-.26*inValley)*(1-.42*(1-smooth(470,660,s)));
  const coastal=1-smooth(1010,1320,s);
  const summit=smooth(550,755,s)*(1-smooth(900,1080,s));
  const summitDrop=smooth(18,145,d)*112*summit;
  const outerPeaks=smooth(145,300,d)*70*summit;
  const coastLeft=(1-smooth(-100,8,x))*(1-smooth(1280,1580,s))*32;
  // Tuned for the old 3-unit grid. At 6 units its wavelength is barely wider
  // than a triangle, so it only tilts each face at random — which the stepped
  // lighting then reads as a checkerboard across otherwise flat ground.
  const nearRipple=(noise(x*.08,s*.065)-.5)*0.55;
  const distantPeaks=(Math.exp(-Math.pow((x+185)/85,2)-Math.pow((s-1060)/150,2))*125 + Math.exp(-Math.pow((x-205)/65,2)-Math.pow((s-1130)/120,2))*110)*(0.8+fbm(x*.035,s*.025)*.4);
  const inland=elevation(s)+shoulder*coastal*(1-.55*summit)-summitDrop+outerPeaks+coastLeft+nearRipple + canyon*Math.exp(-Math.pow((x+95)/45,2))*18+distantPeaks;
  const peninsula=Math.exp(-Math.pow((x+40)/65,2))*(1-smooth(1280,1430,s));
  const headland=-13+(38+(fbm(x*.065,s*.06)-.5)*13)*peninsula;
  const existing=THREE.MathUtils.lerp(inland,headland,smooth(1170,1320,s));
  const ground=THREE.MathUtils.lerp(valleyHeight(x,s),existing,smooth(340,500,s));
  // Dig the basin out rather than adding a plane on top, so the shoreline is
  // wherever the ground actually meets the water.
  const basin=lakeMask(x,s);
  return basin>0 ? THREE.MathUtils.lerp(ground,Math.min(ground,LAKE.surface-8),basin) : ground;
}

export function makeTerrain(s0:number,s1:number) {
  const nx=150,nz=55,width=900;
  const geometry=new THREE.PlaneGeometry(width,s1-s0,nx,nz);
  geometry.rotateX(-Math.PI/2); geometry.translate(0,0,-(s0+s1)/2);
  const p=geometry.attributes.position;
  const colors=[];
  // A poster palette, not a gradient. The reference art picks from a handful of
  // flat inks; interpolating between them is what makes procedural terrain read
  // as generic. Snapping to the nearest one gives the large single-colour
  // regions the illustrations are built from.
  // Value range sampled from the reference painting: deep blue foreground,
  // blue-grey middle distance, and restrained pale ridges. The very darkest
  // ink is reserved for props and trees so the terrain still keeps detail.
  const ramp=['#193445','#274659','#395a70','#526f83','#7890a0','#adb6b8'].map(h=>new THREE.Color(h));
  // The valley floor in the reference is near-white sand. Leaving it in the
  // dark end of the ramp is what makes the whole picture read as grey: the
  // shading and the haze then lift it only as far as a mid tone, and nothing in
  // frame is properly light.
  const sand=new THREE.Color('#f5ead8');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),s=-p.getZ(i),h=terrainHeight(x,s); p.setY(i,h);
    const slopeX=(terrainHeight(x+1,s)-terrainHeight(x-1,s))*.5;
    const slopeZ=(terrainHeight(x,s+1)-terrainHeight(x,s-1))*.5;
    const snowRegion=smooth(375,620,s)*(1-smooth(880,1160,s));
    const snowLine=clamp(.55 + slopeX*.4 - Math.abs(slopeZ)*.14 + (fbm(x*.07,s*.06)-.5)*.6);
    const nearBank=smooth(3,24,x-pathX(s))*(1-smooth(28,62,x-pathX(s)))*(1-smooth(270,450,s));

    // Height above the valley floor is what drives value: ridge crests catch
    // the light and the floor sits in mid tone. Brightening the ground beside
    // the path instead — which is what this did before — inverts the whole
    // picture and gives you a bright valley under grey peaks.
    let v = clamp((h-elevation(s))/165)*.86
          + snowRegion*smooth(.25,.8,snowLine)*.30
          - nearBank*.10;
    // Dither the thresholds so the band edges follow the rock rather than
    // cutting clean contour lines across it.
    // Flat ground sits at one value, so without a slow drift across it the
    // whole area lands on a band edge and neighbouring vertices split either
    // side of it — which quilts. A large-scale term moves it off the edge and
    // makes the bands break into coherent patches instead.
    v += (fbm(x*.007,s*.006)-.5)*.30 + (fbm(x*.028,s*.024)-.5)*.09;
    const c=ramp[Math.min(ramp.length-1,Math.max(0,Math.floor(clamp(v)*ramp.length)))].clone();

    // Keep the valley inside the same stepped mountain palette so the floor,
    // walls and ridges remain connected. The previous solid blue override
    // erased the height bands and made the whole landscape look like one slab.
    if(s<500){
      const valleyBlue=new THREE.Color('#45657a');
      c.lerp(valleyBlue,.22*(1-smooth(340,500,s)));

      // Foreground pigment is evaluated per pixel in the terrain material;
      // interpolating it across this mesh made the colour boundaries blurry.
    }

    colors.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
// Match the actual triangulated terrain, so a thin path cannot intersect its grid.
export function surfaceHeight(x:number,s:number) {
 // Must match the grid above, or the trail cuts through the terrain's triangles.
 const x0=Math.floor((x+450)/6)*6-450,s0=Math.floor((s+240)/4)*4-240;
 const u=(x-x0)/6,v=(s-s0)/4;
 const a=terrainHeight(x0,s0),b=terrainHeight(x0+6,s0),c=terrainHeight(x0,s0+4),d=terrainHeight(x0+6,s0+4);
 return v>u?a+(d-c)*u+(c-a)*v:a+(b-a)*u+(d-b)*v;
}
export function makeTrail(s0=-140,s1=1315,width=2.3) {
  const p:number[]=[],indices:number[]=[],uv:number[]=[];const n=Math.ceil((s1-s0)*1.5),across=12;
  const deckHeight=terrainHeight(pathX(1290),1290)+.31;
  for(let i=0;i<=n;i++) {
    const s=THREE.MathUtils.lerp(s0,s1,i/n),x=pathX(s);
    const w=(s<330?trailWidth(s):width)*(.97+.03*Math.sin(s*.04));
    for(let j=0;j<=across;j++){
      const derivative=(pathX(s+.1)-pathX(s-.1))/.2;
      const offset=(j/across*2-1)*w/Math.sqrt(1+derivative*derivative);
      const xx=x+offset,ss=s-offset*derivative;
      const ground=surfaceHeight(xx,ss),influence=1-smooth(7,20,Math.abs(ss-1290));
      const base=ground+.025;
      const y=THREE.MathUtils.lerp(base,Math.max(base,deckHeight),influence);
      p.push(xx,y,-ss);uv.push(j/across,s*.06);
      if(i<n&&j<across){const a=i*(across+1)+j,b=a+across+1;indices.push(a,a+1,b,a+1,b+1,b);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export const chapters = [
 {id:'valley',name:'About',en:'About me',kicker:'01 / YI GENG · FULL-STACK DEVELOPER',
  title:['Products built','from end to end.'],body:'Java & TypeScript. Product thinking. Based in Salzburg.',
  at:0,until:.27,hotspot:'Meet Yi',
  note:'Before setting out, stop. The smallest movement in the valley is still worth noticing.',
  label:'Read about Yi Geng'},
 {id:'climb',name:'Experience',en:'Experience',kicker:'02 / EXPERIENCE',
  title:['Product thinking.','Production code.'],body:'From product management to full-stack development.',
  at:.31,until:.51,hotspot:'My experience',
  note:'The view narrows and the pace slows. Coral markers thread together the next stretch you can actually reach.',
  label:'Read work experience'},
 {id:'summit',name:'Projects',en:'Selected projects',kicker:'03 / SELECTED PROJECTS',
  title:['Ideas,','made real.'],body:'Independent projects, built from curiosity.',
  at:.57,until:.75,hotspot:'Explore my projects',
  note:'Only past the ridge does the far side appear. There is no finish line here, only a wider view.',
  label:'View selected projects'},
 {id:'ocean',name:'Contact',en:'Let’s connect',kicker:'04 / WHAT’S NEXT',
  title:['Let’s build','what’s next.'],body:'Based in Austria. Working remotely across European hours.',
  at:.86,until:1,hotspot:'Get in touch',
  note:'Through the stone doorway the noise of the route stays behind. Ahead is somewhere to begin again.',
  label:'Contact Yi Geng'},
];
export const cameraKnots = [
 {p:0,pos:[0,73,180],look:[0,23,-170]},
 {p:.13,pos:[40,28,-55],look:[-3,22,-270]},
 {p:.26,pos:[-8,14,-280],look:[4,58,-442]},
 {p:.38,pos:[-12,52,-446],look:[15,143,-640]},
 {p:.49,pos:[12,132,-623],look:[-10,192,-785]},
 {p:.60,pos:[15,180,-758],look:[-50,171,-1040]},
 {p:.71,pos:[4,207,-899],look:[65,55,-1190]},
 {p:.82,pos:[38,80,-1106],look:[6,7,-1350]},
 {p:.92,pos:[8,13,-1300],look:[-2,8,-1510]},
 {p:1,pos:[-3,5,-1470],look:[20,9,-1750]},
];
const positionCurve = new THREE.CatmullRomCurve3(cameraKnots.map(k=>new THREE.Vector3(...k.pos as [number,number,number])),false,'catmullrom',.25);
const lookCurve = new THREE.CatmullRomCurve3(cameraKnots.map(k=>new THREE.Vector3(...k.look as [number,number,number])),false,'catmullrom',.25);
export function cameraAt(p:number,position:THREE.Vector3,look:THREE.Vector3) {
 let i=0;while(i<cameraKnots.length-2 && p>cameraKnots[i+1].p)i++;
 const t=clamp((p-cameraKnots[i].p)/(cameraKnots[i+1].p-cameraKnots[i].p));
 const u=(i+t)/(cameraKnots.length-1);positionCurve.getPoint(u,position);lookCurve.getPoint(u,look);
 // Keep the guided route above the actual terrain even between control points.
 position.y=Math.max(position.y,terrainHeight(position.x,-position.z)+5);
}

/** A world-space pigment mask. The path is drawn directly on the terrain,
 * so it shares every slope and cannot hover or intersect a mountain. */
export function makeTrailPigment() {
 const width=3072,height=4096,data=new Uint8Array(width*height);
 const minX=-450,minS=-240,worldWidth=900,worldDepth=1760;
 for(let s=-180;s<=1315;s+=.35){
  const x=pathX(s),r=(s<330?trailWidth(s):2.3)*THREE.MathUtils.lerp(1,.035,climbRopeBlend(s));
  const cx=(x-minX)/worldWidth*(width-1),cy=(s-minS)/worldDepth*(height-1);
  const rx=r/worldWidth*(width-1),ry=r/worldDepth*(height-1);
  for(let iy=Math.max(0,Math.floor(cy-ry-1));iy<=Math.min(height-1,Math.ceil(cy+ry+1));iy++){
   for(let ix=Math.max(0,Math.floor(cx-rx-1));ix<=Math.min(width-1,Math.ceil(cx+rx+1));ix++){
    const d=Math.hypot((ix-cx)/rx,(iy-cy)/ry);
    const pigment=Math.round((1-smooth(.76,1.04,d))*255);
    const index=iy*width+ix;if(pigment>data[index])data[index]=pigment;
   }
  }
 }
 const texture=new THREE.DataTexture(data,width,height,THREE.RedFormat);
 texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
