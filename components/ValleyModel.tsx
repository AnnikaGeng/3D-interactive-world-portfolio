"use client";

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// All landscape surfaces have world-space depth. No reference image is mapped onto the model.
function height(x: number, z: number) {
  const valley = 1 - Math.exp(-x*x / 34);
  return 0.15 + valley * (2.9 + 1.5*Math.sin(z*.23+x*.13) + .7*Math.cos(z*.55-x*.2))
    + .16*Math.sin(x*.7+z*.4)*Math.sin(z*.5) + Math.max(0,-z-7)*.045;
}
function trailX(z:number) { return 1.35*Math.sin(z*.39)+.5*Math.sin(z*.81)+1; }
function landscape() {
  const g = new THREE.PlaneGeometry(32, 40, 128, 160);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position; const colors=[];
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),y=height(x,z); p.setY(i,y);
    const c=new THREE.Color(x>5 && z>5 ? '#eac9ac' : '#315b6d');
    c.lerp(new THREE.Color('#102f43'), Math.min(.7,y*.085));
    colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function pathGeometry() {
  const vertices=[],indices=[];
  for(let i=0;i<=400;i++) {const z=19-i*38/400,w=.23+.32*(z+19)/38,x=trailX(z);
    for(const side of [-1,1]){const xx=x+side*w;vertices.push(xx,height(xx,z)+.045,z);}
    if(i<400){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function Controls({reset,auto}:{reset:number,auto:boolean}) {
  const {camera,gl}=useThree();
  const controls=useMemo(()=>new OrbitControls(camera,gl.domElement),[camera,gl]);
  useEffect(()=>{controls.enableDamping=true;controls.minDistance=8;controls.maxDistance=65;controls.maxPolarAngle=Math.PI*.48;return ()=>controls.dispose();},[controls]);
  useEffect(()=>{camera.position.set(24,22,31);controls.target.set(0,1,0);controls.update();},[camera,controls,reset]);
  useFrame((_,delta)=>{controls.autoRotate=auto;controls.autoRotateSpeed=.5;controls.update(delta);});return null;
}
function Tree({x,z,scale=1,wire}:{x:number,z:number,scale?:number,wire:boolean}) {
  return <group position={[x,height(x,z),z]} scale={scale}>
    <mesh position={[0,.55,0]} castShadow><cylinderGeometry args={[.07,.12,1.1,7]}/><meshStandardMaterial color="#233d43" wireframe={wire}/></mesh>
    {[0,1,2].map(i=><mesh key={i} position={[0,1+i*.4,0]} castShadow><coneGeometry args={[.65-i*.14,1.3,9]}/><meshStandardMaterial color={i===2?'#315765':'#173b4b'} roughness={1} wireframe={wire}/></mesh>)}
  </group>;
}
function World({wire}:{wire:boolean}) {
  const ground=useMemo(landscape,[]),trail=useMemo(pathGeometry,[]);
  useEffect(()=>()=>{ground.dispose();trail.dispose();},[ground,trail]);
  const trees=useMemo(()=>Array.from({length:100},(_,i)=>{const z=((i*7.319)%36)-18;const x=(i%2?1:-1)*(4+(i*2.718)%10);return {x,z,scale:.55+(i*.137)% .65};}),[]);
  const personZ=10,personX=trailX(personZ)+.7;
  return <>
    <mesh geometry={ground} receiveShadow><meshStandardMaterial vertexColors roughness={.95} wireframe={wire} side={THREE.DoubleSide}/></mesh>
    <mesh position={[0,-1.1,0]} receiveShadow><boxGeometry args={[32,2.2,40]}/><meshStandardMaterial color="#19394a" roughness={1} wireframe={wire}/></mesh>
    <mesh geometry={trail}><meshStandardMaterial color="#ff795e" roughness={.8} emissive="#b43b24" emissiveIntensity={.13} wireframe={wire} side={THREE.DoubleSide}/></mesh>
    <mesh position={[-2,.24,7]} scale={[1.8,1,1]} rotation={[-Math.PI/2,0,.15]} receiveShadow><circleGeometry args={[1.8,64]}/><meshStandardMaterial color="#8bb4bd" metalness={.35} roughness={.2} wireframe={wire}/></mesh>
    {trees.map((t,i)=><Tree key={i} {...t} wire={wire}/>)}
    <group position={[personX,height(personX,personZ),personZ]}>
      <mesh position={[0,.75,0]} castShadow><sphereGeometry args={[.12,12,12]}/><meshStandardMaterial color="#dfb49b"/></mesh>
      <mesh position={[0,.48,0]} castShadow><capsuleGeometry args={[.12,.3,4,8]}/><meshStandardMaterial color="#132d3b"/></mesh>
      {[-1,1].map(s=><mesh key={s} position={[s*.07,.16,0]}><cylinderGeometry args={[.045,.035,.32,8]}/><meshStandardMaterial color="#142a35"/></mesh>)}
    </group>
  </>;
}
export default function ValleyModel(){
 const [wire,setWire]=useState(false),[auto,setAuto]=useState(false),[reset,setReset]=useState(0);
 return <main className="model-page">
   <Canvas shadows dpr={[1,1.75]} camera={{position:[24,22,31],fov:43,near:.1,far:180}} gl={{antialias:true}}>
    <color attach="background" args={['#eee1d2']}/><fog attach="fog" args={['#eee1d2',55,110]}/>
    <hemisphereLight args={['#fff1db','#264352',2.1]}/><directionalLight position={[-12,24,10]} intensity={3} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-bias={-.0005}/>
    <World wire={wire}/><Controls reset={reset} auto={auto}/>
   </Canvas>
   <header className="model-header"><a href="/">ASCENT <span> / TERRAIN STUDY 01</span></a><a href="/illustration">原插画版本 ↗</a></header>
   <section className="model-caption"><span>THE VALLEY · 山谷</span><h1>A path through<br/>the quiet.</h1><p>依照山谷参考图重建的三维地形</p></section>
   <nav className="model-controls" aria-label="模型控制"><button onClick={()=>setReset(v=>v+1)}>重置视角</button><button aria-pressed={auto} onClick={()=>setAuto(v=>!v)}>自动旋转 {auto?'开':'关'}</button><button aria-pressed={wire} onClick={()=>setWire(v=>!v)}>线框 {wire?'开':'关'}</button></nav>
   <footer className="model-footer">拖动旋转 · 滚轮缩放 · 右键平移 <span>THREE.JS / WEBGL</span></footer>
 </main>;
}
