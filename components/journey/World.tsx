'use client';

import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAKE, CLIMB_ROPE, climbRopeBlend, clamp, elevation, hash, noise, nearTrail, lakeMask, lakeShore, makeLakeSurface, makeTerrain, makeTrail, makeTrailPigment, trailWidth, cameraAt, surfaceHeight, pathX, smooth, terrainHeight, underwater } from '@/lib/terrain';
import { PALETTE, SEA, bandedMaterial, flatMaterial } from '@/lib/artDirection';
import Traveler from './Traveler';

// Figures and props are near-silhouettes in the reference art, so they share
// one unlit material per colour rather than carrying their own.
const flats = new Map<string, THREE.ShaderMaterial>();
export type ForegroundSettings={height:number;width:number;relief:number;offset:number};
export const DEFAULT_FOREGROUND:ForegroundSettings={height:.5,width:1,relief:.35,offset:-78};
const ForegroundContext=createContext(DEFAULT_FOREGROUND);
const flat = (tint: string, lightMix = 0) =>
  flats.get(tint + lightMix) ?? (() => { const m = flatMaterial(tint, { lightMix }); flats.set(tint + lightMix, m); return m; })();

export const landmarks = [
  { x:LAKE.x+LAKE.rx*.75, s:LAKE.s-18, lift:5 },
  { x:pathX(535)+4, s:535, lift:7 },
  { x:pathX(795)-8, s:795, lift:4 },
  { x:pathX(1290), s:1290, lift:12 },
];
export function landmarkPosition(i:number) { const a=landmarks[i];return new THREE.Vector3(a.x,terrainHeight(a.x,a.s)+a.lift,-a.s); }

function Terrain() {
 const geometries=useMemo(()=>Array.from({length:8},(_,i)=>makeTerrain(-240+i*220,-20+i*220)),[]);
 const pigment=useMemo(makeTrailPigment,[]);
 const deckTrail=useMemo(()=>makeTrail(1274,1307),[]);
 const material=useMemo(()=>{
  // Fixed world-space light keeps the tonal pattern stable while scrolling.
  // Smoothed world normals keep those folds broad and painterly instead of
  // exposing every triangle in the terrain grid.
  return new THREE.ShaderMaterial({
   uniforms:{
    uTrailPigment:{value:pigment},
    uClimbSpan:{value:new THREE.Vector4(CLIMB_ROPE.start,CLIMB_ROPE.full,CLIMB_ROPE.release,CLIMB_ROPE.end)},
    uTrailNear:{value:new THREE.Color('#f27665')},
    uTrailMiddle:{value:new THREE.Color('#e98b76')},
    uTrailFar:{value:new THREE.Color('#c98273')},
    uEarth:{value:new THREE.Color('#e1c4a7')},
    uCoralEarth:{value:new THREE.Color('#f08268')}
   },
   vertexColors:true,
   vertexShader:`
    varying vec3 vTerrainColor;
    varying vec3 vWorldNormal;
    varying vec2 vLand;
    void main(){
      vTerrainColor=color;
      vWorldNormal=normalize(mat3(modelMatrix)*normal);
      vLand=vec2(position.x,-position.z);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }
   `,
   fragmentShader:`
    uniform sampler2D uTrailPigment;
    uniform vec4 uClimbSpan;
    uniform vec3 uTrailNear;
    uniform vec3 uTrailMiddle;
    uniform vec3 uTrailFar;
    uniform vec3 uEarth;
    uniform vec3 uCoralEarth;
    varying vec3 vTerrainColor;
    varying vec3 vWorldNormal;
    varying vec2 vLand;
    float openingPath(float s){
     if(s< -140.0)return mix(-150.0,-110.0,smoothstep(-240.0,-140.0,s));
     if(s< -90.0)return mix(-110.0,-50.0,smoothstep(-140.0,-90.0,s));
     if(s< -40.0)return mix(-50.0,24.0,smoothstep(-90.0,-40.0,s));
     if(s<10.0)return mix(24.0,83.0,smoothstep(-40.0,10.0,s));
     if(s<58.0)return mix(83.0,64.0,smoothstep(10.0,58.0,s));
     return mix(64.0,12.0,smoothstep(58.0,105.0,s));
    }
    void main(){
      vec3 sun=normalize(vec3(-0.52,0.78,0.34));
      float facing=max(dot(normalize(vWorldNormal),sun),0.0);
      float stepped=floor(facing*4.0+0.5)/4.0;
      vec3 daylight=vec3(0.77,0.81,0.81);
      vec3 shaded=vTerrainColor*(0.56+stepped*0.44);
      shaded=mix(shaded,daylight,smoothstep(0.55,1.0,stepped)*0.12);
      if(vLand.y<65.0){
       float rel=vLand.x-openingPath(vLand.y);
       float contour=rel+sin(vLand.y*.04)*8.0+sin(vLand.x*.11+vLand.y*.074)*1.2;
       float edge=max(fwidth(contour)*1.3,.2);
       float strata=smoothstep(48.0-edge,48.0+edge,contour)*(1.0-smoothstep(83.0-edge,83.0+edge,contour));
       float shoulder=smoothstep(8.0-edge,8.0+edge,rel)*(1.0-smoothstep(141.0-edge,141.0+edge,rel))*(1.0-smoothstep(46.0,61.0,vLand.y));
       vec3 earth=mix(uEarth,uCoralEarth,strata);
       float etching=sin(vLand.x*6.7+sin(vLand.y*.9)*2.0)*sin(vLand.y*11.3);
       earth*=.95+facing*.05+etching*.012;
       shaded=mix(shaded,earth,shoulder);
      }
      vec2 pigmentUv=(vLand-vec2(-450.0,-240.0))/vec2(900.0,1760.0);
      float coverage=texture2D(uTrailPigment,pigmentUv).r;
      float inkEdge=max(fwidth(coverage),.045);
      coverage=smoothstep(.5-inkEdge,.5+inkEdge,coverage);
      float ropeBlend=smoothstep(uClimbSpan.x,uClimbSpan.y,vLand.y)*(1.0-smoothstep(uClimbSpan.z,uClimbSpan.w,vLand.y));
      coverage*=1.0-ropeBlend;
      // Fade only the road that is far from the viewer. Using route position
      // kept later chapters permanently dusty, even underneath the camera.
      float trailDistance=distance(cameraPosition.xz,vec2(vLand.x,-vLand.y));
      float trailDepth=smoothstep(90.0,570.0,trailDistance);
      vec3 trailColor=mix(uTrailNear,uTrailMiddle,smoothstep(0.0,0.52,trailDepth));
      trailColor=mix(trailColor,uTrailFar,smoothstep(0.48,1.0,trailDepth));
      float wash=0.5+0.5*sin(vLand.x*0.085+vLand.y*0.033);
      trailColor=mix(trailColor,uTrailMiddle,wash*0.18);
      trailColor=mix(trailColor,uTrailNear,coverage*0.10);
      vec3 finalColor=mix(shaded,trailColor,coverage*0.98);
      float grain=fract(sin(dot(floor(vLand*95.0),vec2(12.9898,78.233)))*43758.5453)-0.5;
      finalColor*=1.0+grain*(0.085+coverage*0.075);
      gl_FragColor=vec4(finalColor,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
   `
  });
 },[pigment]);
 useEffect(()=>()=>{geometries.forEach(g=>g.dispose());deckTrail.dispose();pigment.dispose();material.dispose();},[geometries,deckTrail,pigment,material]);
 return <>{geometries.map((g,i)=><mesh key={i} geometry={g} material={material}/>)}
  <mesh geometry={deckTrail}><meshBasicMaterial color="#f27665" fog={false}/></mesh>
 </>;
}

function treeGeometry() {
 const gs:THREE.BufferGeometry[]=[];
 gs.push(new THREE.CylinderGeometry(.055,.15,7.8,5).translate(0,3.9,0).toNonIndexed());
 for(let l=0;l<13;l++) {
  const y=.7+l*.52, radius=(1-l/14)*1.55;
  const vertices=[];
  for(let b=0;b<22;b++){
   const a=b/22*Math.PI*2+l*1.7, aa=(b+1)/22*Math.PI*2+l*1.7;
   const r=radius*(.65+hash(l,b)*.55),rr=radius*(.65+hash(l,b+1)*.55);
   vertices.push(0,y+.92,0,Math.cos(a)*r,y+hash(l,b+4)*.27,Math.sin(a)*r,Math.cos(aa)*rr,y+hash(l,b+5)*.27,Math.sin(aa)*rr);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();gs.push(g);
 }
 gs.forEach(g=>g.deleteAttribute('uv'));
 const merged=mergeGeometries(gs);gs.forEach(g=>g.dispose());return merged;
}
function Vegetation() {
 const mesh=useRef<THREE.InstancedMesh>(null);const geometry=useMemo(treeGeometry,[]);
 const treeMaterial=useMemo(()=>bandedMaterial({lightMix:.18,hazeSteps:7,hazeNear:430,hazeFar:1750,side:THREE.DoubleSide}),[]);
 // Candidates are spread over the whole route, not just the valley, and the
 // treeline does the editing: below it everything stands, above it nothing
 // does, and in between the odds fall off. Most candidates are discarded.
 const trees=useMemo(()=>Array.from({length:2600},(_,i)=>{
  const s=hash(i,6)*1720-210;
  const cluster=Math.sin(s*.037)*18;
  const side=i%2===0?-1:1;
  const x=pathX(s)+side*(26+hash(i,8)*115)+cluster;
  const scale=.52+hash(i,9)*1.25;
  return {x,s,scale};
 }).filter(t=>{
  if(Math.abs(t.x-pathX(t.s))<trailWidth(t.s)+15) return false;
  if(t.s<0 || (t.s>280&&t.s<540))return false;
  if(t.s<360){const grove=Math.exp(-Math.pow((t.x+120)/36,2)-Math.pow((t.s+100)/65,2))+Math.exp(-Math.pow((t.x-115)/33,2)-Math.pow((t.s+70)/57,2))+Math.exp(-Math.pow((t.x+65)/24,2)-Math.pow((t.s-155)/55,2));if(hash(t.x,t.s+91)>grove*.9)return false;}
  if(underwater(t.x,t.s)) return false;          // nothing grows in the sea
  // Trees belong on the valley sides, climbing from about knee height on the
  // slope. The floor is the lightest thing in the frame and the headline sits
  // on it — scattering trees across it muddies the picture and eats the type.
  const above=terrainHeight(t.x,t.s)-elevation(t.s);
  const onlyInValley=1-smooth(420,760,t.s);
  const keep=Math.min(1,smooth(12,58,above)*.8+(1-onlyInValley));
  if(hash(t.x*3.1,t.s*2.7) > keep) return false;
  return hash(t.s,t.x) > smooth(48,104,terrainHeight(t.x,t.s));
 }),[]);
 useEffect(()=>{
  if(!mesh.current)return;const m=new THREE.Object3D();
  trees.forEach((t,i)=>{m.position.set(t.x,terrainHeight(t.x,t.s)-.4,-t.s);m.rotation.y=hash(i,1)*Math.PI*2;m.scale.setScalar(t.scale);m.updateMatrix();mesh.current!.setMatrixAt(i,m.matrix);mesh.current!.setColorAt(i,new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.deep),hash(i,3)*.85));});
  mesh.current.instanceMatrix.needsUpdate=true;
  if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;
  // Without this the bounds stay at whatever three computed on the first frame,
  // before any of these matrices existed — a tiny sphere at the origin. The
  // whole forest then gets frustum-culled the moment the camera leaves it.
  mesh.current.computeBoundingSphere();
  return ()=>geometry.dispose();
 },[trees,geometry]);
 return <instancedMesh ref={mesh} args={[geometry,undefined,trees.length]} material={treeMaterial}/>;
}
function ForegroundGroves(){
 const settings=useContext(ForegroundContext);
 const texture=useLoader(THREE.TextureLoader,'/scenes/foreground-tree-painted-v1.png');
 const material=useMemo(()=>{
  // The generated source has a neutral matte. Key it by chroma in the
  // material, preserving the blue leaf edges without a pale fringe.
  texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.18,fog:false,toneMapped:false});
  m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float leaf = smoothstep(.16, .38, (sampledDiffuseColor.b - sampledDiffuseColor.r) / max(sampledDiffuseColor.b, .001));
   diffuseColor.a *= leaf;
   float pigment = smoothstep(.02, .20, sampledDiffuseColor.b);
   diffuseColor.rgb = mix(vec3(.003, .014, .023), vec3(.031, .078, .110), pigment);
  `);};
  return m;
 },[texture]);
 const geometry=useMemo(()=>new THREE.PlaneGeometry(1,1).translate(0,.452,0),[]);
 const group=useRef<THREE.Group>(null);
 useFrame(({camera})=>{group.current?.children.forEach(tree=>{tree.rotation.y=Math.atan2(camera.position.x-tree.position.x,camera.position.z-tree.position.z);});});
 useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
 // Deliberate groups with breathing room; shorter trees at the group edges.
 const trees=[[-100,-65,18],[-89,-59,12],[-113,-40,23],[-97,-30,15],[-120,-16,14],
  [103,-8,25],[116,2,31],[130,8,22],[109,20,16],[91,-22,12],
  [78,103,11],[90,112,16],[102,138,13],[-72,157,12],[-83,169,9],
  [44,settings.offset-33,9],[58,settings.offset-39,13],[104,settings.offset-19,16]];
 return <group ref={group}>{trees.map(([rawX,s,h],i)=>{
  const x=i>=15?74+(rawX-74)*settings.width:rawX;
  if(underwater(x,s)||nearTrail(x,s,h*.26+5)||(i>=15&&foregroundRise(x,s,settings)<.3))return null;
  return <mesh key={i} geometry={geometry} material={material}
   position={[x,foregroundGround(x,s,settings)-.25,-s]} scale={[h*(.55+hash(i,14)*.12),h,1]}/>;
 })}</group>;
}

// One continuous foothill surface. All plants share it so roots never float
// above it or disappear into the added ridges.
function foregroundBend(x:number){return -28-.36*Math.max(0,x-70)+19*Math.sin((x-8)*.040)+7*Math.sin(x*.083);}
function foregroundRise(x:number,s:number,settings:ForegroundSettings){
 const xx=74+(x-74)/settings.width;
 const bend=foregroundBend(xx);
 const ss=s-settings.offset-(settings.height-.5)*28-bend;
 if(xx<-48||xx>240||ss<-240||ss>4||settings.height===0)return 0;
 let clearance=40;
 for(let t=s-30;t<=s+30;t+=2)clearance=Math.min(clearance,Math.hypot(x-pathX(t),s-t)-trailWidth(t));
 const border=smooth(-48,18,xx)*(1-smooth(186,240,xx))*smooth(-240,-200,ss)*(1-smooth(-36,4,ss))*smooth(8,20,clearance);
 const ridge=(cx:number,cs:number,rx:number,rz:number,h:number)=>h*Math.exp(-Math.pow((xx-cx)/rx,2)-Math.pow((ss-cs)/rz,2));
 const base=ridge(74,-100,92,78,16);
 // Long, overlapping folds run obliquely into the frame, not isolated domes.
 const fold=(center:number,width:number,height:number)=>height*Math.exp(-Math.pow((ss-center-xx*.21-5*Math.sin(xx*.037))/width,2))*Math.exp(-Math.pow((xx-84)/125,2));
 const peaks=fold(-55,18,13)+fold(-98,23,15)+fold(-151,31,12);
 return border*(base*(1-settings.relief)+peaks*settings.relief)*settings.height;
}
function foregroundGround(x:number,s:number,settings:ForegroundSettings){
 return surfaceHeight(x,s)+foregroundRise(x,s,settings);
}

function ForegroundRidges(){
 const settings=useContext(ForegroundContext);
 const geometry=useMemo(()=>{
  // Match the main terrain's 6 × 4 grid, including its diagonal orientation.
  const g=new THREE.PlaneGeometry(432,360,144,180);
  g.rotateX(-Math.PI/2);g.translate(96,0,180);
  const p=g.attributes.position,colors:number[]=[];
  const ink=new THREE.Color('#102936'),blue=new THREE.Color('#345468');
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),s=-p.getZ(i),rise=foregroundRise(x,s,settings);
   p.setY(i,surfaceHeight(x,s)+rise-.12);
   const light=smooth(-.7,.6,(foregroundRise(x-3,s,settings)-foregroundRise(x+3,s,settings))/6);
   const fold=smooth(-.12,.20,Math.sin((s-settings.offset-x*.21-5*Math.sin(x*.037))*.10));
   const grain=(hash(x*39,s*51)-.5)*.055;
   const c=ink.clone().lerp(blue,clamp(light*.25+fold*.58+grain,0,1));
   colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
 },[settings]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry}><meshBasicMaterial vertexColors fog={false}/></mesh>;
}

function MeadowDetails(){
 const settings=useContext(ForegroundContext);
 const geometry=useMemo(()=>{
  const vertices:number[]=[],colors:number[]=[];
  const dark=new THREE.Color('#27495a'),light=new THREE.Color('#506e7c');
  for(let i=0;i<84000;i++){
   const x=hash(i,72)*360-180;
   const edge=settings.offset+(settings.height-.5)*28+foregroundBend(74+(x-74)/settings.width)-12;
   const s=i<38000?edge+(hash(i,73)-.5)*19:hash(i,73)*330-190;
   // Keep the complete painted road and its pale banks free of vegetation.
   if(underwater(x,s)||nearTrail(x,s,7))continue;
   const patches=[[-93,-54,30,42],[113,47,29,45],[-66,146,28,35],[12,-89,40,22],[43,-54,22,18],[84,-32,25,18],[122,-24,18,25],[42,settings.offset-34,20,14],[93,settings.offset-24,25,16]];
   const patch=Math.max(...patches.map(([cx,cs,rx,rz])=>Math.exp(-Math.pow((x-cx)/rx,2)-Math.pow((s-cs)/rz,2))));
   const ribbon=Math.exp(-Math.pow((s-edge)/8,2))*smooth(2,25,x)*(1-smooth(125,160,x))*Math.min(1,settings.height*2);
   const leftBank=Math.exp(-Math.pow((s+55+(x+75)*.3)/12,2))*(1-smooth(-55,-25,x));
   if(hash(i,74)>Math.max(patch*.14,ribbon*.96,leftBank*.86))continue;
   const y=foregroundGround(x,s,settings)-.2;
   const h=.35+hash(i,75)*1.15,w=.024+hash(i,76)*.038;
   const color=dark.clone().lerp(light,hash(i,77)*(foregroundRise(x,s,settings)>.3?.55:.25));
   for(let blade=0;blade<3;blade++){
    const angle=blade*Math.PI/3+hash(i,78)*Math.PI;
    const dx=Math.cos(angle)*w,dz=Math.sin(angle)*w;
    vertices.push(x-dx,y,-s-dz,x+dx,y,-s+dz,x+dx*2,y+h*(1-blade*.14),-s+dz*2);
    for(let v=0;v<3;v++)colors.push(color.r,color.g,color.b);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
 },[settings]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry}><meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false}/></mesh>;
}
function Rocks() {
 const ref=useRef<THREE.InstancedMesh>(null);
 const rockMaterial=useMemo(()=>bandedMaterial({lightSteps:2,hazeSteps:7,hazeNear:430,hazeFar:1750}),[]);
 const geometry=useMemo(()=>{const g=new THREE.DodecahedronGeometry(1,1);const p=g.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);v.multiplyScalar(.85+hash(Math.round(v.x*30),Math.round(v.y*30+v.z*19))*.3);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;},[]);
 useEffect(()=>{if(!ref.current)return;const o=new THREE.Object3D();let n=0;for(let i=0;i<350;i++){
  const s=hash(i,18)*1700-200;const x=pathX(s)+(hash(i,20)>.5?1:-1)*(22+hash(i,22)*95);const size=.8+Math.pow(hash(i,31),3)*6;
  if((s<540 && (s>-90 || Math.abs(x)<100)) || underwater(x,s)){o.scale.setScalar(0);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix);continue;}
  n++;
  o.position.set(x,terrainHeight(x,s)+size*.15,-s);o.scale.set(size*1.3,size*.8,size);o.rotation.set(hash(i,7)*.6,hash(i,9)*6,hash(i,11)*.8);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix);ref.current.setColorAt(i,new THREE.Color(PALETTE.deep).lerp(new THREE.Color(PALETTE.slate),hash(i,12)*.75));
 }ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;
  ref.current.computeBoundingSphere();   // same culling trap as the trees
  return ()=>geometry.dispose();},[geometry]);
 return <instancedMesh ref={ref} args={[geometry,undefined,350]} material={rockMaterial}/>;
}
function Water() {
 const lake=useMemo(makeLakeSurface,[]);
 const lakeMaterial=useMemo(()=>new THREE.ShaderMaterial({uniforms:{
   uTime:{value:0},
   uWater:{value:new THREE.Color('#63788c')},
   uDeep:{value:new THREE.Color('#4a6076')},
   uGlint:{value:new THREE.Color('#d6dee0')},
   uRipples:{value:Array.from({length:10},()=>new THREE.Vector3(0,0,-1))},
 },vertexShader:`
  varying vec3 vWorld;
  void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}
 `,fragmentShader:`
  #define RIPPLE_SLOTS 10
  #define RIPPLE_LIFE 2.6
  #define RIPPLE_REACH 17.0

  uniform float uTime;uniform vec3 uWater,uDeep,uGlint;
  uniform vec3 uRipples[RIPPLE_SLOTS];   // x, z, the moment it was struck
  varying vec3 vWorld;
  float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}


  void main(){
   float far=smoothstep(20.,150.,-vWorld.z);
   vec3 col=mix(uDeep,uWater,far*.8+.2);

   // Cut the surface into rows of ripples, each with its own phase and drift,
   // and light only some of them. Short bright dashes that blink in and out is
   // what glitter looks like when it is drawn rather than rendered — a smooth
   // specular highlight would be the one soft thing in a hard-edged picture.
   // Long and thin: roughly 4 units across and under one deep. Square dashes
   // read as floating debris; it is the elongation that says water.
   float row=floor(-vWorld.z*1.25);
   float speed=.45+hash(vec2(row,7.))*.6;
   float wave=sin(vWorld.x*.32+hash(vec2(row,0.))*6.28+uTime*speed);
   float glint=smoothstep(.76,1.,wave)*step(.62,hash(vec2(row,3.)));

   // A sparser, slower pass at another scale, so the whole surface does not
   // blink on one beat.
   float row2=floor(-vWorld.z*.55+3.);
   float wave2=sin(vWorld.x*.17-hash(vec2(row2,11.))*6.28-uTime*.3);
   glint+=smoothstep(.88,1.,wave2)*step(.78,hash(vec2(row2,5.)))*.8;

   // Rings raised wherever the pointer touched the water. The lake is
   // otherwise still: the contrast is the point, since a surface already
   // rippling on its own would swallow the response.
   vec2 p=vWorld.xz;
   float rings=0.;
   for(int i=0;i<RIPPLE_SLOTS;i++){
    float age=uTime-uRipples[i].z;
    float alive=step(0.,uRipples[i].z)*step(0.,age)*step(age,RIPPLE_LIFE);
    float t=age/RIPPLE_LIFE;
    float ring=smoothstep(1.7,.35,abs(distance(p,uRipples[i].xy)-t*RIPPLE_REACH));
    rings+=ring*(1.-t)*(1.-t)*alive;
   }
   glint=glint*.15+rings*1.15;

   // Fade toward the far shore, where the surface compresses to nothing on
   // screen and anything fine enough to see up close turns into noise.
   col=mix(col,uGlint,clamp(glint,0.,1.)*(1.-far*.5)*.42);
   gl_FragColor=vec4(col,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }
 `}),[]);
 const material=useMemo(()=>new THREE.ShaderMaterial({uniforms:{
   uTime:{value:0},
   uNear:{value:new THREE.Color(SEA.near)},
   uMid:{value:new THREE.Color(SEA.mid)},
   uBright:{value:new THREE.Color(SEA.bright)},
   uGlint:{value:new THREE.Color(SEA.glint)},
   uHorizon:{value:new THREE.Color(SEA.horizon)},
 },vertexShader:`
  uniform float uTime;varying vec3 vWorld;varying float vWave;
  void main(){vec3 p=position;float w=sin(p.x*.13+uTime*.6)*.12+sin(p.y*.08+uTime*.45)*.15+sin(p.x*.041+p.y*.064+uTime*.35)*.23;p.z+=w;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
 `,fragmentShader:`
  uniform float uTime;uniform vec3 uNear,uMid,uBright,uGlint,uHorizon;
  varying vec3 vWorld;varying float vWave;
  float bands(float x,float steps){return floor(x*steps)/steps + smoothstep(.82,1.,fract(x*steps))/steps;}
  void main(){
   // Banded by distance out to sea, which draws as horizontal strips the way
   // the reference does. Banding fresnel instead — the obvious choice — varies
   // far too slowly across a plane this wide and prints contour rings.
   float d=clamp((-vWorld.z-1180.)/2150.,0.,1.);
   float ripple=(sin(vWorld.x*.02+vWorld.z*.05+uTime*.25)*.5+.5)*.06;

   vec3 c=mix(uNear,uMid,bands(smoothstep(0.,.6,d)+ripple,5.));
   // The lit band short of the horizon is what makes it read as sea.
   c=mix(c,uBright,bands(smoothstep(.52,.9,d),3.)*.8);
   // Open water is at its lightest where it meets the sky, not darkest — the
   // previous ramp put a dark strip along the horizon against a pale sky.
   c=mix(c,uHorizon,smoothstep(.82,1.,d));

   // Glints sit in the middle distance and fade before the horizon. Close to
   // the horizon the water compresses to almost nothing on screen, so anything
   // with detail shimmers there; the clean bright band is what should carry it.
   // Low frequency: at a grazing angle the far water compresses to almost
   // nothing on screen, and anything finer prints as corduroy.
   float streak=sin(vWorld.z*.075+sin(vWorld.x*.012+uTime*.3)*2.5-uTime*.4);
   float where=smoothstep(.12,.45,d)*(1.-smoothstep(.68,.9,d));
   c=mix(c,uGlint,smoothstep(.86,1.,streak)*where*.32);
   c+=vWave*.03;

   gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }
 `}),[]);
 // Where the pointer meets the water, and the last few places it did.
 const {gl,camera}=useThree();
 const touch=useMemo(()=>({
   raycaster:new THREE.Raycaster(),
   plane:new THREE.Plane(new THREE.Vector3(0,1,0),-LAKE.surface),
   ndc:new THREE.Vector2(), hit:new THREE.Vector3(),
   last:new THREE.Vector3(1e4,0,1e4), slot:0, at:-1e3,
 }),[]);

 // A DOM listener rather than sampling state.pointer once per frame: it reacts
 // to the movement itself, and it keeps working when the browser throttles the
 // frame loop — a hidden tab, a background window, reduced motion.
 useEffect(()=>{
  const el=gl.domElement;
  const onMove=(e:PointerEvent)=>{
   const r=el.getBoundingClientRect();
   touch.ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
   touch.raycaster.setFromCamera(touch.ndc,camera);
   if(!touch.raycaster.ray.intersectPlane(touch.plane,touch.hit))return;
   if(lakeMask(touch.hit.x,-touch.hit.z)<=0)return;         // only on the water

   // Spaced in both time and distance: without the distance test a resting
   // pointer drills rings into one spot, and without the time one a fast sweep
   // lays down a solid stripe.
   const now=lakeMaterial.uniforms.uTime.value as number;
   if(now-touch.at<.1 || touch.hit.distanceTo(touch.last)<1.1)return;
   touch.at=now; touch.last.copy(touch.hit);

   const slots=lakeMaterial.uniforms.uRipples.value as THREE.Vector3[];
   slots[touch.slot].set(touch.hit.x,touch.hit.z,now);
   touch.slot=(touch.slot+1)%slots.length;                  // oldest is overwritten
  };
  window.addEventListener('pointermove',onMove,{passive:true});
  return ()=>window.removeEventListener('pointermove',onMove);
 },[gl,camera,touch,lakeMaterial]);

 useFrame((_,delta)=>{
  const step=Math.min(delta,.05);
  material.uniforms.uTime.value+=step;
  lakeMaterial.uniforms.uTime.value+=step;
 });

 useEffect(()=>()=>{material.dispose();lakeMaterial.dispose();lake.dispose();},[material,lakeMaterial,lake]);
 return <>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.3,-2150]} material={material}><planeGeometry args={[8000,2200,240,150]}/></mesh>
  <mesh geometry={lake} material={lakeMaterial}/>
 </>;
}
function Limb({a,b,r=.1,color=PALETTE.ink}:{a:[number,number,number],b:[number,number,number],r?:number,color?:string}){
 const transform=useMemo(()=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av);return {position:av.add(bv).multiplyScalar(.5),quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()),length:dir.length()};},[a,b]);
 return <mesh position={transform.position} quaternion={transform.quaternion} material={flat(color)}><cylinderGeometry args={[r*.7,r,transform.length,6]}/></mesh>;
}
/** One leg: thigh and shank as nested groups, so both can swing. */
function Leg({at,phase,legs}:{at:[number,number,number],phase:number,legs:React.RefObject<Gait[]>}) {
 const thigh=useRef<THREE.Group>(null), shank=useRef<THREE.Group>(null);
 useEffect(()=>{
  const g={thigh:thigh.current!,shank:shank.current!,phase};
  legs.current.push(g);
  return ()=>{const i=legs.current.indexOf(g); if(i>=0)legs.current.splice(i,1);};
 },[legs,phase]);
 return <group ref={thigh} position={at}>
  <Limb a={[0,0,0]} b={[0,-.52,0]} r={.062} color={PALETTE.ink}/>
  <group ref={shank} position={[0,-.52,0]}>
   <Limb a={[0,0,0]} b={[0,-.5,.07]} r={.045} color={PALETTE.ink}/>
   <mesh position={[0,-.53,.09]} scale={[.055,.05,.075]} material={flat(PALETTE.ink)}>
    <icosahedronGeometry args={[1,0]}/>
   </mesh>
  </group>
 </group>;
}
type Gait={thigh:THREE.Group,shank:THREE.Group,phase:number};

/**
 * A deer walking the shore.
 *
 * The old one was a body blob with four straight pins and a head that swivelled
 * on the spot. This has a chest and a rump rather than one lump, a neck that
 * rises to a head with a muzzle and ears, and legs that bend at the knee.
 */
function Deer(){
 const group=useRef<THREE.Group>(null);
 const body=useRef<THREE.Group>(null);
 const neck=useRef<THREE.Group>(null);
 const legs=useRef<Gait[]>([]);
 const path=useMemo(()=>({at:new THREE.Vector3(),ahead:new THREE.Vector3()}),[]);

 useFrame(({clock})=>{
  if(!group.current)return;
  const t=clock.elapsedTime;
  const a=t*.036;                                  // roughly three minutes a lap

  lakeShore(a,path.at); lakeShore(a+.02,path.ahead);
  group.current.position.copy(path.at);
  // The model faces -z, so the heading is measured against that.
  group.current.rotation.y=Math.atan2(-(path.ahead.x-path.at.x),-(path.ahead.z-path.at.z));

  const stride=t*4.4;
  for(const leg of legs.current){
   leg.thigh.rotation.x=Math.sin(stride+leg.phase)*.42;
   // The knee only folds one way, and only on the swing.
   leg.shank.rotation.x=Math.max(0,Math.sin(stride+leg.phase-1.1))*.65;
  }
  // Body rises twice per stride, at the top of each pair of steps.
  if(body.current) body.current.position.y=1.05+Math.abs(Math.sin(stride))*.035;
  if(neck.current) neck.current.rotation.x=-.12+Math.sin(stride*.5)*.05;
 });

 return <group ref={group} scale={1.25}>
  <group ref={body} position={[0,1.05,0]}>
   {/* chest and rump, rather than one lump */}
   <mesh position={[0,.02,-.34]} scale={[.30,.33,.42]} material={flat(PALETTE.rose,.4)}>
    <icosahedronGeometry args={[1,1]}/></mesh>
   <mesh position={[0,0,.34]} scale={[.31,.34,.46]} material={flat(PALETTE.rose,.4)}>
    <icosahedronGeometry args={[1,1]}/></mesh>
   <mesh position={[0,.01,0]} scale={[.28,.30,.42]} material={flat(PALETTE.rose,.4)}>
    <icosahedronGeometry args={[1,0]}/></mesh>
   <Limb a={[0,.12,.44]} b={[0,.3,.66]} r={.05} color={PALETTE.ink}/>

   <group ref={neck} position={[0,.16,-.5]}>
    <Limb a={[0,0,0]} b={[0,.52,-.24]} r={.105} color={PALETTE.rose}/>
    <group position={[0,.54,-.26]}>
     <mesh scale={[.115,.115,.20]} material={flat(PALETTE.rose,.4)}>
      <icosahedronGeometry args={[1,1]}/></mesh>
     <mesh position={[0,-.03,-.2]} scale={[.075,.07,.11]} material={flat(PALETTE.ink)}>
      <icosahedronGeometry args={[1,0]}/></mesh>
     {[-1,1].map(side=><mesh key={side} position={[side*.09,.09,.02]} rotation={[0,0,side*.5]}
        scale={[.035,.09,.06]} material={flat(PALETTE.ink)}>
       <icosahedronGeometry args={[1,0]}/></mesh>)}
     {[-1,1].map(side=><group key={side}>
       <Limb a={[side*.06,.09,.02]} b={[side*.15,.42,-.02]} r={.022} color={PALETTE.ink}/>
       <Limb a={[side*.11,.26,0]} b={[side*.28,.4,-.12]} r={.016} color={PALETTE.ink}/>
       <Limb a={[side*.14,.38,-.02]} b={[side*.2,.56,.06]} r={.014} color={PALETTE.ink}/>
     </group>)}
    </group>
   </group>
  </group>

  {/* diagonal gait: each front leg swings with the opposite hind one */}
  <Leg at={[-.19,1.06,-.34]} phase={0} legs={legs}/>
  <Leg at={[ .19,1.06,-.34]} phase={Math.PI} legs={legs}/>
  <Leg at={[-.2,1.04,.36]} phase={Math.PI} legs={legs}/>
  <Leg at={[ .2,1.04,.36]} phase={0} legs={legs}/>
 </group>;
}

/** Small, quiet groups on the banks, with every foot sampled from the terrain. */
function ValleyAnimals(){
 const settings=useContext(ForegroundContext);
 const flock=[[-40,-49,1.65,2],[-49,-53,1.5,1.7],[-55,-44,1.2,2.4],
  [63,-49,1.65,-1.95],[71,-55,1.5,-2.3],[77,-43,1.2,-1.8]];
 return <>{flock.map(([x,s,size,yaw],i)=>!underwater(x,s)&&!nearTrail(x,s,5)&&
  <Sheep key={i} x={x} s={s} size={size} yaw={yaw} phase={i*1.8} settings={settings}/>)}
  <ValleyCat x={35} s={-95} yaw={-.8} color="#bd8061" settings={settings}/>
  <ValleyCat x={32} s={-61} yaw={1.2} color="#294553" settings={settings}/>
 </>;
}

function Sheep({x,s,size,yaw,phase,settings}:{x:number;s:number;size:number;yaw:number;phase:number;settings:ForegroundSettings}){
 const group=useRef<THREE.Group>(null),body=useRef<THREE.Mesh>(null);
 const head=useRef<THREE.Group>(null);
 const shins=useRef<(THREE.Mesh|null)[]>([]),hooves=useRef<(THREE.Mesh|null)[]>([]);
 const motion=useRef({time:phase,angle:phase,stride:phase,walk:0,x,s,heading:yaw});
 const rig=useMemo(()=>({up:new THREE.Vector3(0,1,0),hip:new THREE.Vector3(),foot:new THREE.Vector3(),direction:new THREE.Vector3()}),[]);
 const reduced=useRef(false);
 useEffect(()=>{const q=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{reduced.current=q.matches;};update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 useFrame((_,delta)=>{
  if(!group.current)return;
  const m=motion.current,dt=Math.min(delta,.05);
  if(!reduced.current)m.time+=dt;
  // Each sheep grazes in its own small patch, with staggered pauses.
  const cycle=m.time%19;
  const pace=reduced.current?0:smooth(0,1,cycle)*(1-smooth(12,14,cycle));
  const angle=m.angle+dt*.31*pace;
  const nextX=x+3.8*(Math.cos(angle)-Math.cos(phase));
  const nextS=s+2.3*(Math.sin(angle)-Math.sin(phase));
  const safe=!underwater(nextX,nextS)&&!nearTrail(nextX,nextS,7);
  const distance=safe?Math.hypot(nextX-m.x,nextS-m.s):0;
  if(safe&&distance>.00001){
   const heading=Math.atan2(-(nextX-m.x),nextS-m.s);
   const turn=Math.atan2(Math.sin(heading-m.heading),Math.cos(heading-m.heading));
   m.heading+=turn*(1-Math.exp(-dt*5));
   m.x=nextX;m.s=nextS;m.stride+=distance*5/size;
  }
  // Advance the patrol even at a boundary so it can turn back into its patch.
  m.angle=angle;
  m.walk=THREE.MathUtils.damp(m.walk,distance>.00001?pace:0,9,dt);
  const base=foregroundGround(m.x,m.s,settings);
  group.current.position.set(m.x,base,-m.s);
  group.current.rotation.y=m.heading;
  const bob=Math.abs(Math.sin(m.stride*2))*.045*m.walk;
  if(body.current)body.current.position.y=bob;
  if(head.current){
   head.current.rotation.x=THREE.MathUtils.lerp(-.48+Math.sin(m.time*1.6)*.12,.05,m.walk);
   head.current.position.y=1.15+bob;
  }
  // Opposite legs step together. Hoof height is sampled at its moving world
  // position, so walking and foreground-slider changes use the same surface.
  for(let i=0;i<4;i++){
   const shin=shins.current[i],hoof=hooves.current[i];if(!shin||!hoof)continue;
   const side=i<2?-1:1,end=i%2===0?-1:1;
   const legPhase=m.stride+(side===end?0:Math.PI);
   const lx=side*.31,lz=end*.48;
   const step=Math.sin(legPhase)*.25*m.walk;
   const fz=lz+step;
   const wx=m.x+size*(Math.cos(m.heading)*lx+Math.sin(m.heading)*fz);
   const ws=m.s-size*(-Math.sin(m.heading)*lx+Math.cos(m.heading)*fz);
   const floor=(foregroundGround(wx,ws,settings)-base)/size;
   const lift=Math.max(0,Math.cos(legPhase))*.18*m.walk;
   rig.hip.set(lx,.88+bob,lz);rig.foot.set(lx,floor+.08+lift,fz);
   rig.direction.subVectors(rig.hip,rig.foot);
   shin.position.copy(rig.hip).add(rig.foot).multiplyScalar(.5);
   shin.scale.set(1,rig.direction.length(),1);
   shin.quaternion.setFromUnitVectors(rig.up,rig.direction.normalize());
   hoof.position.copy(rig.foot);hoof.position.z-=.02;
  }
 });
 const wool=useMemo(()=>{
  const pieces:THREE.BufferGeometry[]=[];
  pieces.push(new THREE.IcosahedronGeometry(1,2).scale(.51,.5,.79).translate(0,1.02,0));
  for(let i=0;i<30;i++){
   const angle=i*2.39996,v=1-2*(i+.5)/30,r=Math.sqrt(1-v*v);
   pieces.push(new THREE.IcosahedronGeometry(.19+hash(i,31)*.07,1)
    .translate(Math.cos(angle)*r*.44,1.04+v*.42,Math.sin(angle)*r*.69));
  }
  const g=mergeGeometries(pieces);pieces.forEach(p=>p.dispose());return g;
 },[]);
 useEffect(()=>()=>wool.dispose(),[wool]);
 const base=foregroundGround(x,s,settings),dark='#30434a';
 return <group ref={group} position={[x,base,-s]} rotation={[0,yaw,0]} scale={size}>
  <mesh ref={body} geometry={wool} material={flat('#dfd3bd',.25)}/>
  {Array.from({length:4},(_,i)=><group key={i}>
   <mesh ref={node=>{shins.current[i]=node;}} material={flat(dark)}><cylinderGeometry args={[.052,.075,1,6]}/></mesh>
   <mesh ref={node=>{hooves.current[i]=node;}} scale={[.085,.08,.12]} material={flat(dark)}><icosahedronGeometry args={[1,1]}/></mesh>
  </group>)}
  <group ref={head} position={[0,1.15,-.7]}>
   <mesh position={[0,-.03,-.16]} scale={[.24,.31,.31]} material={flat(dark,.15)}><icosahedronGeometry args={[1,2]}/></mesh>
   <mesh position={[0,.18,-.05]} scale={[.27,.2,.25]} material={flat('#dfd3bd',.25)}><icosahedronGeometry args={[1,1]}/></mesh>
   {[-1,1].map(side=><mesh key={side} position={[side*.3,.08,-.1]} rotation={[0,0,side*.25]} scale={[.21,.07,.11]} material={flat(dark)}><icosahedronGeometry args={[1,1]}/></mesh>)}
  </group>
  <mesh position={[0,1.05,.83]} rotation={[.3,0,0]} scale={[.12,.24,.15]} material={flat('#d5c8b1',.2)}><icosahedronGeometry args={[1,1]}/></mesh>
 </group>;
}

function ValleyCat({x,s,yaw,color,settings}:{x:number;s:number;yaw:number;color:string;settings:ForegroundSettings}){
 const group=useRef<THREE.Group>(null),tail=useRef<THREE.Group>(null),head=useRef<THREE.Group>(null);
 const rump=useRef<THREE.Mesh>(null),chest=useRef<THREE.Mesh>(null);
 const legs=useRef<(THREE.Mesh|null)[]>([]),paws=useRef<(THREE.Mesh|null)[]>([]);
 const phase=x*.17;
 const motion=useRef({time:x*.2,angle:phase,stride:phase,walk:0,x,s,heading:yaw});
 const rig=useMemo(()=>({up:new THREE.Vector3(0,1,0),hip:new THREE.Vector3(),foot:new THREE.Vector3(),direction:new THREE.Vector3()}),[]);
 const reduced=useRef(false);
 useEffect(()=>{const q=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{reduced.current=q.matches;};update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 useFrame((_,delta)=>{
  if(!group.current)return;
  const m=motion.current,dt=Math.min(delta,.05),size=1.8;
  if(!reduced.current)m.time+=dt;
  const cycle=m.time%21;
  const pace=reduced.current?0:smooth(0,1.4,cycle)*(1-smooth(11,13,cycle));
  const angle=m.angle+dt*.38*pace;
  const nx=x+3*(Math.cos(angle)-Math.cos(phase)),ns=s+1.7*(Math.sin(angle)-Math.sin(phase));
  const safe=!underwater(nx,ns)&&!nearTrail(nx,ns,5);
  const distance=safe?Math.hypot(nx-m.x,ns-m.s):0;
  if(safe&&distance>.00001){
   const heading=Math.atan2(-(nx-m.x),ns-m.s);
   m.heading+=Math.atan2(Math.sin(heading-m.heading),Math.cos(heading-m.heading))*(1-Math.exp(-dt*5));
   m.x=nx;m.s=ns;m.stride+=distance*6/size;
  }
  m.angle=angle;m.walk=THREE.MathUtils.damp(m.walk,distance>.00001?pace:0,7,dt);
  const w=m.walk,base=foregroundGround(m.x,m.s,settings),bob=Math.sin(m.stride*2)*.025*w;
  group.current.position.set(m.x,base,-m.s);group.current.rotation.y=m.heading;
  // Unfold the seated silhouette into a four-legged walking pose.
  if(rump.current){rump.current.position.y=.45+w*.2+bob;rump.current.scale.set(.3,.46-w*.19,.34+w*.12);}
  if(chest.current){chest.current.position.set(0,.75-w*.08+bob,-.07-w*.23);chest.current.scale.set(.23,.4-w*.13,.23+w*.14);}
  if(head.current){head.current.position.set(0,1.13-w*.18+bob,-.14-w*.48);head.current.rotation.y=Math.sin(m.time*.9)*.22*(1-w);}
  if(tail.current){tail.current.position.set(0,.12+w*.5,.33+w*.12);tail.current.rotation.set(-w*.75,Math.sin(m.time*1.4)*(.18+w*.2),0);}
  for(let i=0;i<4;i++){
   const leg=legs.current[i],paw=paws.current[i];if(!leg||!paw)continue;
   const side=i<2?-1:1,front=i%2===0;
   const lx=side*(front?.15:.23),lz=front?-.22-w*.28:.22+w*.2;
   const stride=m.stride+((side===-1)===front?0:Math.PI);
   const fz=lz+Math.sin(stride)*.23*w-(front?.08:0);
   const wx=m.x+size*(Math.cos(m.heading)*lx+Math.sin(m.heading)*fz);
   const ws=m.s-size*(-Math.sin(m.heading)*lx+Math.cos(m.heading)*fz);
   const ground=(foregroundGround(wx,ws,settings)-base)/size;
   rig.hip.set(lx,front?.71+bob:.39+w*.26+bob,lz);
   rig.foot.set(lx,ground+.07+Math.max(0,Math.cos(stride))*.16*w,fz);
   rig.direction.subVectors(rig.hip,rig.foot);
   leg.position.copy(rig.hip).add(rig.foot).multiplyScalar(.5);
   leg.scale.set(1,rig.direction.length(),1);leg.quaternion.setFromUnitVectors(rig.up,rig.direction.normalize());
   paw.position.copy(rig.foot);paw.position.z-=.03;
  }
 });
 const tailGeometry=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,0,0),new THREE.Vector3(.28,.03,.35),new THREE.Vector3(.65,.12,.28),new THREE.Vector3(.74,.24,-.08),new THREE.Vector3(.62,.32,-.2)
 ]),18,.055,6,false),[]);
 useEffect(()=>()=>tailGeometry.dispose(),[tailGeometry]);
 if(underwater(x,s)||nearTrail(x,s,4))return null;
 return <group ref={group} position={[x,foregroundGround(x,s,settings),-s]} rotation={[0,yaw,0]} scale={1.8}>
  <mesh ref={rump} position={[0,.45,.12]} scale={[.3,.46,.34]} material={flat(color,.2)}><icosahedronGeometry args={[1,2]}/></mesh>
  <mesh ref={chest} position={[0,.75,-.07]} scale={[.23,.4,.23]} material={flat(color,.2)}><icosahedronGeometry args={[1,2]}/></mesh>
  <group ref={head} position={[0,1.13,-.14]}>
   <mesh scale={[.26,.24,.23]} material={flat(color,.2)}><icosahedronGeometry args={[1,2]}/></mesh>
   {[-1,1].map(side=><group key={side}>
    <mesh position={[side*.16,.24,.02]} rotation={[0,0,-side*.2]} scale={[.13,.29,.13]} material={flat(color,.2)}><coneGeometry args={[1,1,3]}/></mesh>
    <mesh position={[side*.11,.04,-.206]} scale={[.036,.025,.012]} material={flat('#dfc998')}><sphereGeometry args={[1,6,4]}/></mesh>
   </group>)}
   <mesh position={[0,-.07,-.225]} scale={[.055,.04,.045]} material={flat('#203844')}><icosahedronGeometry args={[1,0]}/></mesh>
  </group>
  {Array.from({length:4},(_,i)=><group key={i}>
   <mesh ref={node=>{legs.current[i]=node;}} material={flat(color)}><cylinderGeometry args={[.045,.065,1,6]}/></mesh>
   <mesh ref={node=>{paws.current[i]=node;}} scale={[.09,.07,.14]} material={flat('#ded0b9')}><icosahedronGeometry args={[1,1]}/></mesh>
  </group>)}
  <group ref={tail} position={[0,.12,.33]}><mesh geometry={tailGeometry} material={flat(color,.2)}/></group>
 </group>;
}

type TravelProgress={readonly current:{current:number}};
function Walker({progress}:{progress:TravelProgress}){
 const body=useRef<THREE.Group>(null);
 const grip=useRef<THREE.Group>(null);
 const leftGrip=useRef<THREE.Group>(null);
 const motion=useRef({lastS:-25,phase:0,walk:0,climb:0,heading:0,pos:new THREE.Vector3(),look:new THREE.Vector3()});
 useFrame((_,dt)=>{
  if(!body.current)return;
  const m=motion.current,p=progress.current.current;
  cameraAt(p,m.pos,m.look);
  const s=Math.min(1310,-m.pos.z+THREE.MathUtils.lerp(155,82,smooth(0,.15,p)));
  const x=pathX(s)-trailWidth(s)*.28,delta=s-m.lastS;
  m.climb=climbRopeBlend(s);
  const moving=Math.abs(delta)>.0005;
  m.walk=THREE.MathUtils.damp(m.walk,moving?1:0,12,Math.min(dt,.05));
  m.phase+=delta*.9;
  if(moving){const tangent=(pathX(s+.3)-pathX(s-.3))/.6;m.heading=-Math.atan(tangent)+(delta<0?Math.PI:0);}
  body.current.position.set(x,surfaceHeight(x,s),-s);
  const diff=THREE.MathUtils.euclideanModulo(m.heading-body.current.rotation.y+Math.PI,Math.PI*2)-Math.PI;
  body.current.rotation.y+=diff*Math.min(1,dt*10);
  m.lastS=s;
 },-2);
 return <><group ref={body} scale={2.4}><Traveler gait={motion} grip={grip} leftGrip={leftGrip} groundHeight={surfaceHeight}/></group><ClimbingRope grip={grip} leftGrip={leftGrip} motion={motion}/></>;
}

function ClimbingRope({grip,leftGrip,motion}:{grip:React.RefObject<THREE.Group|null>;leftGrip:React.RefObject<THREE.Group|null>;motion:React.RefObject<{climb:number;lastS:number}>}){
 const segments=360,sides=8,radius=.085;
 const data=useMemo(()=>{
  const points=Array.from({length:segments+1},(_,i)=>{
   const s=THREE.MathUtils.lerp(CLIMB_ROPE.start,CLIMB_ROPE.end,i/segments),x=pathX(s);
   return new THREE.Vector3(x,surfaceHeight(x,s)+radius,-s);
  });
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array((segments+1)*sides*3),uv=new Float32Array((segments+1)*sides*2),opacity=new Float32Array((segments+1)*sides),indices:number[]=[];
  for(let i=0;i<=segments;i++)for(let j=0;j<sides;j++){
   const n=i*sides+j;uv[n*2]=i/segments;uv[n*2+1]=j/sides;opacity[n]=climbRopeBlend(-points[i].z);
   if(i<segments){const a=n,b=i*sides+(j+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('opacity',new THREE.BufferAttribute(opacity,1));geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{color:{value:new THREE.Color('#f27665')}},vertexShader:`
   attribute float opacity;varying vec2 vUv;varying float vOpacity;
   void main(){vUv=uv;vOpacity=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
   uniform vec3 color;varying vec2 vUv;varying float vOpacity;
   void main(){float braid=.5+.5*sin(vUv.x*2900.+vUv.y*25.1327);
    gl_FragColor=vec4(color*(.84+.16*braid),vOpacity);
    #include <colorspace_fragment>
   }
  `});
  return {geometry,material,points,live:points.map(p=>p.clone()),hand:new THREE.Vector3(),leftHand:new THREE.Vector3(),tangent:new THREE.Vector3(),side:new THREE.Vector3(),normal:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)};
 },[]);
 useEffect(()=>()=>{data.geometry.dispose();data.material.dispose();},[data]);
 useFrame(()=>{
  const {points,live,hand,leftHand,tangent,side,normal,up,geometry}=data;
  const holding=motion.current.climb;
  if(grip.current){grip.current.updateWorldMatrix(true,false);grip.current.getWorldPosition(hand);}
  if(leftGrip.current){leftGrip.current.updateWorldMatrix(true,false);leftGrip.current.getWorldPosition(leftHand);}
  const first=hand.z>leftHand.z?hand:leftHand,last=first===hand?leftHand:hand;
  const a=-first.z,b=-last.z,span=CLIMB_ROPE.end-CLIMB_ROPE.start;
  const active=holding>.001&&a>CLIMB_ROPE.start&&b<CLIMB_ROPE.end;
  const firstIndex=THREE.MathUtils.clamp(Math.round((a-CLIMB_ROPE.start)/span*segments),1,segments-2);
  const lastIndex=THREE.MathUtils.clamp(Math.round((b-CLIMB_ROPE.start)/span*segments),firstIndex+1,segments-1);
  const rear=Math.max(CLIMB_ROPE.start,a-24),front=Math.min(CLIMB_ROPE.end,b+32);
  for(let i=0;i<=segments;i++){
   // Reserve a vertex for each hand even when they are closer than a terrain sample.
   const s=!active?-points[i].z:i<=firstIndex?THREE.MathUtils.lerp(CLIMB_ROPE.start,a,i/firstIndex):i<=lastIndex?THREE.MathUtils.lerp(a,b,(i-firstIndex)/(lastIndex-firstIndex)):THREE.MathUtils.lerp(b,CLIMB_ROPE.end,(i-lastIndex)/(segments-lastIndex));
   const point=live[i];point.set(pathX(s),surfaceHeight(pathX(s),s)+radius,-s);
   if(active&&s>rear&&s<front){
    if(s>=a&&s<=b){
     const t=(s-a)/Math.max(.00001,b-a);
     point.lerpVectors(first,last,t);
    }else{
     const contact=s<a?first:last,anchor=s<a?rear:front;
     const t=s<a?(s-rear)/(a-rear):(front-s)/(front-b);
     const x=THREE.MathUtils.lerp(pathX(s),contact.x,smooth(0,1,t));
     const ground=surfaceHeight(x,s)+radius,anchorY=surfaceHeight(pathX(anchor),anchor)+radius;
     // Tension runs from the ground contact to the hands without overshooting
     // their height. Only the nearby span is lifted; distant rope stays grounded.
     const taut=THREE.MathUtils.lerp(anchorY,contact.y,t);
     point.set(x,Math.max(ground,THREE.MathUtils.lerp(ground,taut,smooth(0,.22,t))),-s);
    }
    point.x=THREE.MathUtils.lerp(pathX(s),point.x,holding);
    point.y=THREE.MathUtils.lerp(surfaceHeight(point.x,s)+radius,point.y,holding);
   }
   for(let j=0;j<sides;j++)geometry.attributes.opacity.setX(i*sides+j,climbRopeBlend(s));
  }
  geometry.attributes.opacity.needsUpdate=true;
  const p=geometry.attributes.position;
  for(let i=0;i<=segments;i++){
   tangent.subVectors(live[Math.min(segments,i+1)],live[Math.max(0,i-1)]).normalize();
   side.crossVectors(tangent,up).normalize();normal.crossVectors(side,tangent).normalize();
   for(let j=0;j<sides;j++){
    const a=j/sides*Math.PI*2,c=Math.cos(a)*radius,s=Math.sin(a)*radius;
    p.setXYZ(i*sides+j,live[i].x+side.x*c+normal.x*s,live[i].y+side.y*c+normal.y*s,live[i].z+side.z*c+normal.z*s);
   }
  }
  p.needsUpdate=true;
 });
 return <mesh geometry={data.geometry} material={data.material} frustumCulled={false}/>;
}

function Flags(){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,-.6,0,0,-1.2,0],3));g.computeVertexNormals();return g;},[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <>{[425,475,535,590,655,730].map(s=>{const x=pathX(s)+3.4;return <group key={s} position={[x,terrainHeight(x,s),-s]}><Limb a={[0,0,0]} b={[0,5,0]} r={.065} color={PALETTE.deep}/><mesh geometry={geometry} position={[0,5,0]} material={flat(PALETTE.coral)}/></group>;})}</>;
}
function Summit(){
 const loc=landmarks[2];return <group position={[loc.x,terrainHeight(loc.x,loc.s),-loc.s]}>
  {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i)*.13,.35+i*.5,0]} scale={[1-i*.13,.45,1-i*.14]} rotation={[0,i*2,0]}><dodecahedronGeometry args={[1,0]}/><meshBasicMaterial color={i%2?PALETTE.slate:PALETTE.cream}/></mesh>)}
 </group>;
}
function CoastalRocks(){
 return <>{Array.from({length:32},(_,i)=>{
  const s=1210+hash(i,81)*190,x=-38-hash(i,82)*48,size=4+hash(i,83)*11;
  return <mesh key={i} position={[x,terrainHeight(x,s)+size*.12,-s]} rotation={[hash(i,4)*.3,hash(i,8)*3,hash(i,5)*.3]} scale={[size*.8,size*(i<6?1.8:.8),size*1.3]}><icosahedronGeometry args={[1,2]}/><meshBasicMaterial color={i%3?PALETTE.deep:PALETTE.navy}/></mesh>;
 })}</>;
}
function Portal(){
 const loc=landmarks[3],y=terrainHeight(loc.x,loc.s);
 return <group position={[loc.x,y,-loc.s]}>
  {[-1,1].map(s=><mesh key={s} position={[s*7,10,0]}><boxGeometry args={[2,20,2.6]}/><meshBasicMaterial color={s===-1?PALETTE.cream:PALETTE.deep}/></mesh>)}
  <mesh position={[0,20,0]}><boxGeometry args={[16,2,2.6]}/><meshBasicMaterial color={PALETTE.navy}/></mesh>
  <mesh position={[-5.96,10,.1]}><boxGeometry args={[.07,19.5,2.7]}/><meshBasicMaterial color={PALETTE.paper}/></mesh>
  <mesh position={[0,-.1,0]}><boxGeometry args={[17,.6,14]}/><meshBasicMaterial color={PALETTE.sand}/></mesh>
 </group>;
}
function Birds(){
 const ref=useRef<THREE.Group>(null);const wings=useRef<THREE.Group[]>([]);
 useFrame(({clock})=>{if(!ref.current)return;const t=clock.elapsedTime*.12;ref.current.position.set(Math.sin(t)*38,210+Math.sin(t*.3)*8,-835+Math.cos(t)*38);ref.current.rotation.y=-t;wings.current.forEach((g,i)=>{if(g)g.rotation.z=Math.sin(clock.elapsedTime*2+i)*.15;});});
 return <group ref={ref}>{Array.from({length:8},(_,i)=><group key={i} position={[i*5,Math.sin(i*2)*3,i*3]} ref={e=>{if(e)wings.current[i]=e;}}><Limb a={[-1.6,.45,0]} b={[0,0,0]} r={.09}/><Limb a={[0,0,0]} b={[1.6,.45,0]} r={.09}/></group>)}</group>;
}
function LandmarkRings(){const refs=useRef<THREE.Mesh[]>([]);useFrame(({clock})=>refs.current.forEach((m,i)=>{if(m){m.rotation.y=clock.elapsedTime*.3;m.scale.setScalar(1+Math.sin(clock.elapsedTime*1.4+i)*.07);}}));return <>{landmarks.map((_,i)=><mesh key={i} ref={e=>{if(e)refs.current[i]=e;}} position={landmarkPosition(i)}><torusGeometry args={[i===3?2:.75,.025,6,36]}/><meshBasicMaterial color={PALETTE.coral} transparent opacity={.75}/></mesh>)}</>;}
export default function World({progress,foreground=DEFAULT_FOREGROUND}:{progress:TravelProgress;foreground?:ForegroundSettings}){return <ForegroundContext.Provider value={foreground}><Terrain/><ForegroundRidges/><Vegetation/><ForegroundGroves/><MeadowDetails/><Rocks/><Water/><Deer/><ValleyAnimals/><Walker progress={progress}/><Flags/><Summit/><CoastalRocks/><Portal/><Birds/><LandmarkRings/></ForegroundContext.Provider>;}
