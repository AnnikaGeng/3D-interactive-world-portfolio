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
export function pathX(s:number) { return Math.sin(s*.013)*13 + Math.sin(s*.027+.6)*7; }
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
export const LAKE = {x:64, s:140, rx:46, rz:62, surface:-3};
/** Radius multiplier by bearing — a few harmonics, so the outline reads as a
 *  lake rather than as an ellipse. */
function lakeWobble(a:number) {
  return 1 + Math.sin(a*2.3+1.1)*.15 + Math.sin(a*3.7-.4)*.10 + Math.sin(a*5.1+2.2)*.05;
}

/** 1 inside the basin, falling to 0 at its shore. */
export function lakeMask(x:number,s:number) {
  const dx=(x-LAKE.x)/LAKE.rx, ds=(s-LAKE.s)/LAKE.rz;
  const w=lakeWobble(Math.atan2(ds,dx));
  return 1 - smooth(.62*w,w,Math.hypot(dx,ds));
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
    const a=i/seg*Math.PI*2, r=lakeWobble(a);
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
  const shoulder=rise*(mountain+ridge*20+detail+folds)*(1-.26*inValley);
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
  const ground=THREE.MathUtils.lerp(inland,headland,smooth(1170,1320,s));
  // Dig the basin out rather than adding a plane on top, so the shoreline is
  // wherever the ground actually meets the water.
  const basin=lakeMask(x,s);
  return basin>0 ? THREE.MathUtils.lerp(ground,Math.min(ground,elevation(s)-9),basin) : ground;
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
  const ramp=['#0a1a26','#14314a','#2e4b5f','#6e8496','#d7c1a9','#ecdfc9'].map(h=>new THREE.Color(h));
  // The single loudest thing in the reference illustrations is a large coral
  // mass on the sunlit side of the valley — roughly a quarter of the frame, not
  // just a coral trail. Without it the whole picture sits in greys and greige,
  // and no amount of contrast makes it feel like the artwork.
  // A soft blush, not a saturated coral. In the reference the slope is pale
  // dusty pink and the *trail* is the one fully saturated thing in the frame;
  // painting the hillside the same red as the path leaves it shouting with
  // nothing to say.
  const coral=new THREE.Color('#e0b0a1');
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

    // On the sunlit flank and partway up it, with the lit crest above — in the
    // reference the blush runs along the slope, not across the valley floor.
    const coralBand=smooth(6,42,x-pathX(s))*(1-smooth(62,205,x-pathX(s)));
    const lowGround=smooth(2,34,h-elevation(s))*(1-smooth(78,168,h-elevation(s)));
    const early=1-smooth(340,660,s);                 // it belongs to the valley
    // Only a light dither: the reference's coral is a clean shape with a ragged
    // edge, not a mottled field.
    c.lerp(coral,clamp(coralBand*lowGround*early*1.5+(fbm(x*.016,s*.014)-.5)*.11)*.95);

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
  const p=[],indices=[],uv=[];const n=Math.ceil((s1-s0)*1.5);
  const deckHeight=terrainHeight(pathX(1290),1290)+.31;
  for(let i=0;i<=n;i++) {
    const s=THREE.MathUtils.lerp(s0,s1,i/n),x=pathX(s);
    const w=width*(.85+.18*Math.sin(s*.04));

    // The ribbon is only two vertices wide and flat between them, while the
    // ground beneath spans several 6-unit triangles. Sampling just the two
    // edges lets any bulge in between push up through the middle of the path,
    // which is what produced the dark patches on it. Clear the highest ground
    // under the whole width instead — which also stops the path tilting
    // sideways from one edge sitting higher than the other.
    let ground=-Infinity;
    for(let k=-2;k<=2;k++) ground=Math.max(ground,surfaceHeight(x+k*w*.5,s));
    const base=ground+.22;

    const deckInfluence=1-smooth(7,16,Math.abs(s-1290));
    const y=THREE.MathUtils.lerp(base,Math.max(base,deckHeight),deckInfluence);
    for(const side of [-1,1]){p.push(x+side*w,y,-s);uv.push((side+1)/2,s*.06);}
    if(i<n){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export const chapters = [
 {id:'valley',name:'Valley',en:'The valley',kicker:'01 / THE BEGINNING',
  title:['Every journey','starts within.'],body:'Follow the light in, between the mountains.',
  at:0,until:.27,hotspot:'A visitor in the trees',
  note:'Before setting out, stop. The smallest movement in the valley is still worth noticing.',
  label:'Find the deer among the trees'},
 {id:'climb',name:'Climb',en:'The climb',kicker:'02 / THE ASCENT',
  title:['A little further.','A little higher.'],body:'Upward, along the winding path.',
  at:.31,until:.51,hotspot:'Markers along the way',
  note:'The view narrows and the pace slows. Coral markers thread together the next stretch you can actually reach.',
  label:'Approach the climbing markers'},
 {id:'summit',name:'Summit',en:'The summit',kicker:'03 / A NEW PERSPECTIVE',
  title:['Room to breathe.'],body:'The road behind you becomes the view.',
  at:.57,until:.75,hotspot:'The lookout',
  note:'Only past the ridge does the far side appear. There is no finish line here, only a wider view.',
  label:'Look out across the range'},
 {id:'ocean',name:'Open sea',en:'The open sea',kicker:'04 / BEYOND THE HORIZON',
  title:['And then,','the open sea.'],body:'Where the mountains end, the story keeps going.',
  at:.86,until:1,hotspot:'The door to the sea',
  note:'Through the stone doorway the noise of the route stays behind. Ahead is somewhere to begin again.',
  label:'Pass through the stone doorway'},
];
export const cameraKnots = [
 {p:0,pos:[28,54,125],look:[-8,45,-170]},
 {p:.13,pos:[-6,23,-72],look:[-8,25,-260]},
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
