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
export function terrainHeight(x:number,s:number) {
  const center=pathX(s),d=Math.abs(x-center);
  const canyon=1-smooth(350,730,s);
  const corridor=16 + 65*(1-smooth(170,430,s)) + 10*smooth(680,780,s);
  const rise=smooth(corridor*.35,corridor+95,d);
  const mountain=38 + 106*fbm(x*.011,s*.009) + 26*Math.sin(s*.009+x*.012);
  const ridge=1-Math.abs(noise(x*.03,s*.014)*2-1);
  const detail=(fbm(x*.055,s*.049)-.5)*16;
  const folds=Math.sin(x*.15+noise(s*.022,3)*4)*5 + (1-Math.abs(noise(x*.07,s*.031)*2-1))*9;
  const shoulder=rise*(mountain+ridge*20+detail+folds);
  const coastal=1-smooth(1010,1320,s);
  const summit=smooth(550,755,s)*(1-smooth(900,1080,s));
  const summitDrop=smooth(18,145,d)*112*summit;
  const outerPeaks=smooth(145,300,d)*70*summit;
  const coastLeft=(1-smooth(-100,8,x))*(1-smooth(1280,1580,s))*32;
  const nearRipple=(noise(x*.08,s*.065)-.5)*2.1;
  const distantPeaks=(Math.exp(-Math.pow((x+185)/85,2)-Math.pow((s-1060)/150,2))*125 + Math.exp(-Math.pow((x-205)/65,2)-Math.pow((s-1130)/120,2))*110)*(0.8+fbm(x*.035,s*.025)*.4);
  const inland=elevation(s)+shoulder*coastal*(1-.55*summit)-summitDrop+outerPeaks+coastLeft+nearRipple + canyon*Math.exp(-Math.pow((x+95)/45,2))*18+distantPeaks;
  const peninsula=Math.exp(-Math.pow((x+40)/65,2))*(1-smooth(1280,1430,s));
  const headland=-13+(38+(fbm(x*.065,s*.06)-.5)*13)*peninsula;
  return THREE.MathUtils.lerp(inland,headland,smooth(1170,1320,s));
}

export function makeTerrain(s0:number,s1:number) {
  const nx=300,nz=110,width=900;
  const geometry=new THREE.PlaneGeometry(width,s1-s0,nx,nz);
  geometry.rotateX(-Math.PI/2); geometry.translate(0,0,-(s0+s1)/2);
  const p=geometry.attributes.position;
  const colors=[];
  const navy=new THREE.Color('#244959'),slate=new THREE.Color('#5c7b87'),snow=new THREE.Color('#e9d6b9'),warm=new THREE.Color('#b8a58b');
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),s=-p.getZ(i),h=terrainHeight(x,s); p.setY(i,h);
    const slopeX=(terrainHeight(x+1,s)-terrainHeight(x-1,s))*.5;
    const slopeZ=(terrainHeight(x,s+1)-terrainHeight(x,s-1))*.5;
    const c=navy.clone().lerp(slate,clamp((h-elevation(s))/180)*.5);
    const snowRegion=smooth(375,620,s)*(1-smooth(880,1160,s));
    const snowLine=clamp(.55 + slopeX*.4 - Math.abs(slopeZ)*.14 + (fbm(x*.07,s*.06)-.5)*.6);
    c.lerp(snow,snowRegion*smooth(.25,.8,snowLine)*.82);
    const nearBank=smooth(3,24,x-pathX(s))*(1-smooth(28,62,x-pathX(s)))*(1-smooth(270,450,s));
    c.lerp(warm,nearBank*.7);
    c.multiplyScalar(.92+noise(x*.15,s*.15)*.13);colors.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
// Match the actual triangulated terrain, so a thin path cannot intersect its grid.
export function surfaceHeight(x:number,s:number) {
 const x0=Math.floor((x+450)/3)*3-450,s0=Math.floor((s+240)/2)*2-240;
 const u=(x-x0)/3,v=(s-s0)/2;
 const a=terrainHeight(x0,s0),b=terrainHeight(x0+3,s0),c=terrainHeight(x0,s0+2),d=terrainHeight(x0+3,s0+2);
 return v>u?a+(d-c)*u+(c-a)*v:a+(b-a)*u+(d-b)*v;
}
export function makeTrail(s0=-140,s1=1315,width=2.3) {
  const p=[],indices=[],uv=[];const n=Math.ceil((s1-s0)*1.5);
  for(let i=0;i<=n;i++) {
    const s=THREE.MathUtils.lerp(s0,s1,i/n),x=pathX(s);
    const w=width*(.85+.18*Math.sin(s*.04));
    for(const side of [-1,1]) {const xx=x+side*w;const deckHeight=terrainHeight(pathX(1290),1290)+.31;const deckInfluence=1-smooth(7,16,Math.abs(s-1290));const base=surfaceHeight(xx,s)+.09;const y=THREE.MathUtils.lerp(base,Math.max(base,deckHeight),deckInfluence);p.push(xx,y,-s);uv.push((side+1)/2,s*.06);}
    if(i<n){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export const chapters = [
 {id:'valley',name:'山谷',en:'The valley',kicker:'01 / THE BEGINNING',title:['Every journey','starts within.'],body:'循着微光，走入群山。',at:0,until:.27,hotspot:'林间来客',note:'在出发之前，停一下。山谷里最轻微的动静，也值得被看见。',label:'寻找林间的鹿'},
 {id:'climb',name:'攀登',en:'The climb',kicker:'02 / THE ASCENT',title:['A little further.','A little higher.'],body:'顺着蜿蜒的路，向上。',at:.31,until:.51,hotspot:'沿途的路标',note:'视野变窄，脚步变慢。珊瑚色的路标，串起岩壁之间下一段可以抵达的路。',label:'靠近攀登路标'},
 {id:'summit',name:'山顶',en:'The summit',kicker:'03 / A NEW PERSPECTIVE',title:['Room to breathe.'],body:'走过的路，在远处连成风景。',at:.57,until:.75,hotspot:'山顶观景处',note:'目光越过山脊，才看见另一侧的世界。这里没有终点，只有更宽的视野。',label:'眺望远处群山'},
 {id:'ocean',name:'海洋',en:'The open sea',kicker:'04 / BEYOND THE HORIZON',title:['And then,','the open sea.'],body:'山的尽头，故事仍在继续。',at:.86,until:1,hotspot:'通向海的门',note:'穿过石门，沿途的喧嚣留在身后。眼前是一片可以重新出发的海。',label:'穿过海边石门'},
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
