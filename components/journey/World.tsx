'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, makeTerrain, makeTrail, pathX, terrainHeight } from '@/lib/terrain';
import { PALETTE, bandedMaterial, flatMaterial } from '@/lib/artDirection';

// Figures and props are near-silhouettes in the reference art, so they share
// one unlit material per colour rather than carrying their own.
const flats = new Map<string, THREE.ShaderMaterial>();
const flat = (tint: string, lightMix = 0) =>
  flats.get(tint + lightMix) ?? (() => { const m = flatMaterial(tint, { lightMix }); flats.set(tint + lightMix, m); return m; })();

export const landmarks = [
  { x:pathX(110)+7, s:110, lift:2 },
  { x:pathX(535)+4, s:535, lift:7 },
  { x:pathX(795)-8, s:795, lift:4 },
  { x:pathX(1290), s:1290, lift:12 },
];
export function landmarkPosition(i:number) { const a=landmarks[i];return new THREE.Vector3(a.x,terrainHeight(a.x,a.s)+a.lift,-a.s); }

function Terrain() {
 const geometries=useMemo(()=>Array.from({length:8},(_,i)=>makeTerrain(-240+i*220,-20+i*220)),[]);
 const trail=useMemo(()=>makeTrail(),[]);
 const rockMaterial=useMemo(()=>bandedMaterial({
   vertexColors:true, lit:PALETTE.cream, shade:PALETTE.deep,
   lightSteps:3,          // three flat steps of light, the way the art prints it
   hazeSteps:7,           // distance in stacked layers, not a gradient
   hazeNear:260, hazeFar:1700, grain:.075,
 }),[]);
 useEffect(()=>()=>{geometries.forEach(g=>g.dispose());trail.dispose();rockMaterial.dispose();},[geometries,trail,rockMaterial]);
 return <>
  {geometries.map((g,i)=><mesh key={i} geometry={g} material={rockMaterial}/>)}
  <mesh geometry={trail} material={flat(PALETTE.coral)}/>
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
 const treeMaterial=useMemo(()=>bandedMaterial({lightMix:.18,hazeSteps:7,hazeNear:300,hazeFar:1700,side:THREE.DoubleSide}),[]);
 const trees=useMemo(()=>Array.from({length:660},(_,i)=>{
  const s=hash(i,6)*630-200;
  const cluster=Math.sin(s*.037)*18;
  const side=i%2===0?-1:1;
  const x=pathX(s)+side*(26+hash(i,8)*115)+cluster;
  const scale=.52+hash(i,9)*1.25;
  return {x,s,scale};
 }).filter(t=>Math.abs(t.x-pathX(t.s))>8 && terrainHeight(t.x,t.s)<72),[]);
 useEffect(()=>{
  if(!mesh.current)return;const m=new THREE.Object3D();
  trees.forEach((t,i)=>{m.position.set(t.x,terrainHeight(t.x,t.s)-.4,-t.s);m.rotation.y=hash(i,1)*Math.PI*2;m.scale.setScalar(t.scale);m.updateMatrix();mesh.current!.setMatrixAt(i,m.matrix);mesh.current!.setColorAt(i,new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.deep),hash(i,3)*.85));});
  mesh.current.instanceMatrix.needsUpdate=true;
  if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;
  return ()=>geometry.dispose();
 },[trees,geometry]);
 return <instancedMesh ref={mesh} args={[geometry,undefined,trees.length]} material={treeMaterial}/>;
}
function Rocks() {
 const ref=useRef<THREE.InstancedMesh>(null);
 const rockMaterial=useMemo(()=>bandedMaterial({lightSteps:2,hazeSteps:7,hazeNear:300,hazeFar:1700}),[]);
 const geometry=useMemo(()=>{const g=new THREE.DodecahedronGeometry(1,1);const p=g.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);v.multiplyScalar(.85+hash(Math.round(v.x*30),Math.round(v.y*30+v.z*19))*.3);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;},[]);
 useEffect(()=>{if(!ref.current)return;const o=new THREE.Object3D();for(let i=0;i<350;i++){
  const s=hash(i,18)*1420-140;const x=pathX(s)+(hash(i,20)>.5?1:-1)*(22+hash(i,22)*95);const size=.8+Math.pow(hash(i,31),3)*6;
  o.position.set(x,terrainHeight(x,s)+size*.15,-s);o.scale.set(size*1.3,size*.8,size);o.rotation.set(hash(i,7)*.6,hash(i,9)*6,hash(i,11)*.8);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix);ref.current.setColorAt(i,new THREE.Color(PALETTE.deep).lerp(new THREE.Color(PALETTE.slate),hash(i,12)*.75));
 }ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;return ()=>geometry.dispose();},[geometry]);
 return <instancedMesh ref={ref} args={[geometry,undefined,350]} material={rockMaterial}/>;
}
function Water() {
 const ref=useRef<THREE.Mesh>(null);
 const material=useMemo(()=>new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uSky:{value:new THREE.Color(PALETTE.haze)},uDeep:{value:new THREE.Color(PALETTE.navy)},uGlint:{value:new THREE.Color(PALETTE.cream)}},vertexShader:`
  uniform float uTime;varying vec3 vWorld;varying float vWave;
  void main(){vec3 p=position;float w=sin(p.x*.13+uTime*.6)*.12+sin(p.y*.08+uTime*.45)*.15+sin(p.x*.041+p.y*.064+uTime*.35)*.23;p.z+=w;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
 `,fragmentShader:`
  uniform float uTime;uniform vec3 uSky;uniform vec3 uDeep;uniform vec3 uGlint;varying vec3 vWorld;varying float vWave;
  float bands(float x,float steps){return floor(x*steps)/steps + smoothstep(.82,1.,fract(x*steps))/steps;}
  void main(){
   vec3 view=normalize(cameraPosition-vWorld);
   // The artwork draws water as a few flat tonal bands with hard glints on top,
   // so the fresnel and the haze are quantised rather than smooth.
   float fresnel=bands(pow(1.-max(view.y,0.),3.),5.);
   float ripples=sin(vWorld.z*2.5+sin(vWorld.x*.55+uTime*.4)*2.+uTime*.7);
   float sparkle=step(.72,pow(max(0.,ripples),20.)*.4+.5)*.55;
   float light=exp(-pow((vWorld.x-15.)/max(12.,abs(vWorld.z+1200.)*.4),2.));
   vec3 c=mix(uDeep,uSky,fresnel*.5);
   c=mix(c,uGlint,sparkle*light);
   c+=vWave*.04;
   float fog=bands(1.-exp(-distance(cameraPosition,vWorld)*.0018),6.);
   c=mix(c,uSky,fog*.55);
   gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }
 `}),[]);
 useFrame((_,delta)=>{material.uniforms.uTime.value+=Math.min(delta,.05);});
 useEffect(()=>()=>material.dispose(),[material]);
 return <>
  <mesh ref={ref} rotation={[-Math.PI/2,0,0]} position={[0,-.3,-2150]} material={material}><planeGeometry args={[8000,2200,240,150]}/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[-19,1.3,-82]} scale={[1,1.7,1]}><circleGeometry args={[12,80]}/><meshBasicMaterial color={PALETTE.slate}/></mesh>
 </>;
}
function Limb({a,b,r=.1,color=PALETTE.ink}:{a:[number,number,number],b:[number,number,number],r?:number,color?:string}){
 const transform=useMemo(()=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av);return {position:av.add(bv).multiplyScalar(.5),quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()),length:dir.length()};},[a,b]);
 return <mesh position={transform.position} quaternion={transform.quaternion} material={flat(color)}><cylinderGeometry args={[r*.7,r,transform.length,6]}/></mesh>;
}
function Deer(){
 const loc=landmarks[0],head=useRef<THREE.Group>(null);
 useFrame(({clock})=>{if(head.current)head.current.rotation.y=Math.sin(clock.elapsedTime*.5)*.25;});
 return <group position={[loc.x,terrainHeight(loc.x,loc.s),-loc.s]} rotation={[0,-.6,0]} scale={1.3}>
  <mesh position={[0,1.22,0]} scale={[.42,.55,.9]} material={flat(PALETTE.rose,.35)}><icosahedronGeometry args={[1,1]}/></mesh>
  {[-1,1].flatMap(x=>[-1,1].map(z=><Limb key={`${x}${z}`} a={[x*.25,1.2,z*.52]} b={[x*.27,0,z*.65]} r={.075} color={PALETTE.ink}/>))}
  <group ref={head} position={[0,1.55,-.65]}><Limb a={[0,0,0]} b={[0,.65,-.2]} r={.2} color={PALETTE.rose}/>
   <mesh position={[0,.65,-.36]} scale={[.2,.2,.4]} material={flat(PALETTE.rose,.35)}><icosahedronGeometry args={[1,1]}/></mesh>
   {[-1,1].map(s=><group key={s}><Limb a={[s*.1,.8,-.22]} b={[s*.22,1.45,-.16]} r={.038} color={PALETTE.ink}/><Limb a={[s*.17,1.16,-.19]} b={[s*.45,1.4,-.28]} r={.025} color={PALETTE.ink}/></group>)}
  </group>
 </group>;
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
export default function World(){return <><Terrain/><Vegetation/><Rocks/><Water/><Deer/><Flags/><Summit/><CoastalRocks/><Portal/><Birds/><LandmarkRings/></>;}
