'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Ring=[number,number,number];
// Tailored rings give the hem, knees and cuffs their own silhouettes.
function cloth(rings:Ring[],neckline=false){
 const vertices:number[]=[],indices:number[]=[];const n=16;
 rings.forEach(([y,rx,rz],row)=>{
  for(let i=0;i<n;i++){
   const a=i/n*Math.PI*2,fold=1+(row===0||row===rings.length-1?0:.035)*Math.cos(a*5+row*.8);
   const neck=neckline&&row===rings.length-1?.16*Math.max(0,-Math.sin(a))*(1-Math.abs(Math.cos(a))):0;
   vertices.push(Math.cos(a)*rx*fold,y-neck,Math.sin(a)*rz*fold);
   if(row>0){const p=(row-1)*n+i,q=(row-1)*n+(i+1)%n;indices.push(p,p+n,q,q,p+n,q+n);}
  }
 });
 // Open garment ends overlap the adjoining cloth/boots; end caps would
 // create visible horizontal disks and pinched normals at animated joints.
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function ink(color:string){return new THREE.ShaderMaterial({uniforms:{tint:{value:new THREE.Color(color)}},vertexShader:`
 varying vec3 vNormal,vPoint;
 void main(){vNormal=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);vPoint=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
 `,fragmentShader:`
 uniform vec3 tint;varying vec3 vNormal,vPoint;
 void main(){float light=smoothstep(-.5,.85,dot(normalize(vNormal),normalize(vec3(-.6,.8,-.4))));
 float grain=fract(sin(dot(floor(vPoint.xy*420.+vPoint.z*27.),vec2(12.9898,78.233)))*43758.5453)-.5;
 gl_FragColor=vec4(tint*(.48+light*.52+grain*.12),1.);
 #include <colorspace_fragment>
 }`});}

/** Fully dimensional traveler, facing -Z. Front and back share one walking rig. */
export default function Traveler({gait,grip,leftGrip,groundHeight}:{gait:RefObject<{phase:number;walk:number;climb?:number}>;grip?:RefObject<THREE.Group|null>;leftGrip?:RefObject<THREE.Group|null>;groundHeight?:(x:number,s:number)=>number}){
 const thighs=useRef<(THREE.Group|null)[]>([]),knees=useRef<(THREE.Group|null)[]>([]);
 const arms=useRef<(THREE.Group|null)[]>([]),upper=useRef<THREE.Group>(null);
 const elbows=useRef<(THREE.Group|null)[]>([]);
 const root=useRef<THREE.Group>(null),head=useRef<THREE.Group>(null),feet=useRef<(THREE.Group|null)[]>([]);
 const footTarget=useMemo(()=>new THREE.Vector3(),[]);
 const armSolve=useMemo(()=>({direction:new THREE.Vector3(),bend:new THREE.Vector3(),elbow:new THREE.Vector3(),target:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0),shoulderRotation:new THREE.Quaternion(),elbowRotation:new THREE.Quaternion()}),[]);
 const materials=useMemo(()=>({coat:ink('#e4cdb0'),cuff:ink('#bea084'),fold:ink('#4c5660'),pants:ink('#303b46'),seam:ink('#927b67'),
  pack:ink('#50443f'),hair:ink('#352d2d'),strand:ink('#55423a'),skin:ink('#d8a88c'),sole:ink('#282a2d'),boot:ink('#544841'),coral:ink('#f27a64')}),[]);
 const geometry=useMemo(()=>({
  coat:cloth([[1.36,.30,.18],[1.53,.27,.17],[1.72,.235,.155],[1.96,.29,.18],[2.075,.265,.16],[2.115,.135,.115]],true),
  thigh:cloth([[-.65,.125,.14],[-.51,.15,.155],[-.1,.172,.18],[0,.16,.17]]),
  shin:cloth([[-.57,.125,.125],[-.49,.14,.135],[-.12,.13,.145],[0,.125,.14]]),
  sleeve:cloth([[-.30,.09,.10],[-.23,.115,.12],[-.08,.12,.125],[0,.105,.115]]),
  forearm:cloth([[-.36,.053,.055],[-.26,.06,.068],[0,.078,.085]]),
  pack:new RoundedBoxGeometry(.46,.64,.24,3,.07),pocket:new RoundedBoxGeometry(.35,.21,.07,2,.035),
  boot:new RoundedBoxGeometry(.235,.21,.37,3,.045),sole:new RoundedBoxGeometry(.25,.07,.39,2,.024),
  strap:new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
   new THREE.Vector3(-.225,1.71,-.155),new THREE.Vector3(-.25,1.96,-.18),new THREE.Vector3(-.24,2.10,-.10),
   new THREE.Vector3(-.225,2.13,.08),new THREE.Vector3(-.205,2.05,.28),new THREE.Vector3(-.195,1.96,.435)
  ]),24,.025,7,false),
 }),[]);
 useEffect(()=>()=>{Object.values(materials).forEach(m=>m.dispose());Object.values(geometry).forEach(g=>g.dispose());},[materials,geometry]);
 useFrame(()=>{
  const {phase,walk,climb=0}=gait.current;
  const effort=Math.sin(phase*2),hipHeight=1.62-climb*(.23+.025*effort*walk);
  if(climb>0)root.current?.updateWorldMatrix(true,false);
  for(let i=0;i<2;i++){
   const step=Math.sin(phase+i*Math.PI);
   let hip=step*.29*walk,knee=Math.max(0,-step)*.43*walk;
   if(climb>0){
    // Solve a bent leg against the actual slope; pausing keeps the braced stance.
    const forward=.34*step+(i===0?.12:-.12),lift=Math.max(0,Math.cos(phase+i*Math.PI))*.18*walk;
    footTarget.set(i===0?-.15:.15,0,-forward);
    if(groundHeight&&root.current){
     root.current.localToWorld(footTarget);
     footTarget.y=groundHeight(footTarget.x,-footTarget.z);
     root.current.worldToLocal(footTarget);
    }
    const down=Math.max(.45,hipHeight-footTarget.y-.196-lift),upperLength=.73,lowerLength=.7015;
    const reach=THREE.MathUtils.clamp(Math.hypot(down,forward),.25,upperLength+lowerLength-.012);
    const bend=Math.acos(THREE.MathUtils.clamp((reach*reach-upperLength*upperLength-lowerLength*lowerLength)/(2*upperLength*lowerLength),-1,1));
    const lean=Math.atan2(forward,down)+Math.atan2(lowerLength*Math.sin(bend),upperLength+lowerLength*Math.cos(bend));
    hip=THREE.MathUtils.lerp(hip,lean,climb);
    knee=THREE.MathUtils.lerp(knee,-bend,climb);
   }
   if(thighs.current[i]){thighs.current[i]!.position.y=hipHeight;thighs.current[i]!.rotation.x=hip;}
   if(knees.current[i])knees.current[i]!.rotation.x=knee;
   if(feet.current[i])feet.current[i]!.rotation.x=-(hip+knee)*climb;
   const arm=arms.current[i],elbow=elbows.current[i],side=i===0?-1:1;
   if(arm&&elbow){
    arm.rotation.set(-step*.20*walk-.045,0,side*.08);elbow.rotation.set(-.12,0,0);
    if(climb>0){
     // Two staggered grips in front of the hips. Solve both elbows rather
     // than swinging the free arm past the rope or stretching the forearms.
     const a=armSolve,reach=i===0?1:0,pull=.04*effort*walk;
     a.target.set(.03-side*.025,1.54+reach*.08-pull*.25,-.40-reach*.14+pull);
     a.target.sub(arm.position);const length=a.target.length(),upperLength=.30,lowerLength=.515;
     a.direction.copy(a.target).normalize();
     a.bend.set(side,0,.25).addScaledVector(a.direction,-a.direction.dot(a.bend)).normalize();
     const along=(length*length+upperLength*upperLength-lowerLength*lowerLength)/(2*length);
     a.elbow.copy(a.direction).multiplyScalar(along).addScaledVector(a.bend,Math.sqrt(Math.max(0,upperLength*upperLength-along*along)));
     a.shoulderRotation.setFromUnitVectors(a.down,a.direction.copy(a.elbow).normalize());
     a.direction.subVectors(a.target,a.elbow).normalize().applyQuaternion(a.elbowRotation.copy(a.shoulderRotation).invert());
     a.elbowRotation.setFromUnitVectors(a.down,a.direction);
     arm.quaternion.slerp(a.shoulderRotation,climb);elbow.quaternion.slerp(a.elbowRotation,climb);
    }
   }
  }
  if(upper.current){
   upper.current.position.set(0,hipHeight+Math.abs(effort)*.018*walk*(1-climb),-.07*climb);
   upper.current.rotation.set(-climb*(.34+.035*effort*walk),Math.sin(phase)*.035*walk,Math.sin(phase)*.035*walk*climb);
  }
  if(head.current)head.current.rotation.x=.04+.19*climb;
 },-1);
 return <group ref={root}>
  {[-1,1].map((side,i)=><group key={side} position={[side*.15,1.62,0]} scale={[.91,1,.96]} ref={node=>{thighs.current[i]=node;}}>
   <mesh geometry={geometry.thigh} material={materials.pants} scale={[1,1.17,1]}/>
   <group position={[0,-.73,0]} scale={[1,1.15,1]} ref={node=>{knees.current[i]=node;}}>
    <mesh geometry={geometry.shin} material={materials.pants}/>
    <mesh position={[side*.09,-.28,-.082]} rotation={[.08,0,side*.06]} scale={[.018,.23,.025]} material={materials.fold}><boxGeometry/></mesh>
    <group position={[0,-.61,0]} ref={node=>{feet.current[i]=node;}}>
     <mesh position={[0,.025,-.025]} material={materials.boot}><cylinderGeometry args={[.09,.11,.2,10]}/></mesh>
     <mesh geometry={geometry.boot} material={materials.boot} position={[0,-.05,-.075]}/>
     <mesh geometry={geometry.sole} material={materials.sole} position={[0,-.135,-.075]}/>
     {[0,1,2].map(j=><mesh key={j} position={[0,.06-j*.035,-.133-j*.025]} rotation={[-.5,0,0]} material={materials.fold}><boxGeometry args={[.13,.012,.017]}/></mesh>)}
    </group>
   </group>
  </group>)}
  <group ref={upper} position={[0,1.62,0]}>
   <group position={[0,-1.40,0]} scale={[.84,1,.9]}>
   <mesh geometry={geometry.coat} material={materials.coat}/>
   <mesh position={[0,1.66,-.167]} material={materials.cuff}><boxGeometry args={[.012,.48,.012]}/></mesh>
   {[-1,1].map(side=><mesh key={side} position={[side*.18,1.53,-.135]} rotation={[0,side*-.35,side*-.22]} material={materials.cuff}><boxGeometry args={[.12,.012,.017]}/></mesh>)}
   <mesh geometry={geometry.pack} position={[0,1.68,.30]} material={materials.pack}/>
   <mesh geometry={geometry.pocket} position={[0,1.49,.434]} material={materials.pack}/>
   <mesh position={[0,1.93,.435]} scale={[.19,.042,.028]} material={materials.strand}><sphereGeometry args={[1,12,8]}/></mesh>
   <mesh position={[0,1.66,.447]} material={materials.cuff}><boxGeometry args={[.33,.01,.01]}/></mesh>
   <mesh geometry={geometry.strap} material={materials.coral}/>
   <mesh geometry={geometry.strap} scale={[-1,1,1]} material={materials.seam}/>
   {/* Open neckline and rolled sleeves expose warm skin against the blouse. */}
   <mesh position={[0,2.045,-.035]} scale={[.138,.12,.118]} material={materials.skin}><sphereGeometry args={[1,18,12]}/></mesh>
   <mesh position={[0,2.18,.015]} material={materials.skin}><cylinderGeometry args={[.077,.087,.24,16]}/></mesh>
   <group ref={head} position={[0,2.4,-.015]} rotation={[.04,-.12,0]} scale={[.96,.86,.97]}>
    <mesh scale={[.17,.235,.175]} material={materials.skin}><sphereGeometry args={[1,20,16]}/></mesh>
    <mesh position={[0,-.095,-.044]} scale={[.128,.134,.14]} material={materials.skin}><sphereGeometry args={[1,16,12]}/></mesh>
    <mesh position={[0,-.017,-.175]} rotation={[-Math.PI/2,0,0]} material={materials.skin}><coneGeometry args={[.041,.085,4]}/></mesh>
    <mesh position={[0,.12,.016]} rotation={[.08,0,-.15]} scale={[.19,.155,.195]} material={materials.hair}><sphereGeometry args={[1,20,14]}/></mesh>
    <mesh position={[-.07,.14,-.132]} rotation={[0,0,-.35]} scale={[.065,.07,.038]} material={materials.hair}><sphereGeometry args={[1,16,12]}/></mesh>
    <mesh position={[0,-.19,.15]} rotation={[-.13,0,0]} scale={[.215,.41,.11]} material={materials.hair}><sphereGeometry args={[1,24,20]}/></mesh>
    {[-1,1].map(side=><group key={side}>
     <mesh position={[side*.157,-.023,.012]} scale={[.028,.054,.035]} material={materials.skin}><sphereGeometry args={[1,10,8]}/></mesh>
     <mesh position={[side*.178,-.22,.015]} rotation={[.04,side*.12,side*-.06]} scale={[.045,.32,.08]} material={materials.hair}><sphereGeometry args={[1,18,18]}/></mesh>
     <mesh position={[side*.073,.025,-.168]} rotation={[0,side*.2,side*.06]} material={materials.hair}><boxGeometry args={[.043,.012,.008]}/></mesh>
    </group>)}
    <mesh position={[0,-.1,-.173]} material={materials.strand}><boxGeometry args={[.053,.008,.009]}/></mesh>
    {[-2,-1,0,1,2].map(i=><mesh key={i} position={[i*.063,-.17,.254-Math.abs(i)*.008]} rotation={[.05,0,i*.045]} scale={[.0025,.27,.0025]} material={materials.strand}><sphereGeometry args={[1,6,16]}/></mesh>)}
   </group>
   {[-1,1].map((side,i)=><group key={side} position={[side*.30,2.055,0]} rotation={[0,0,side*.08]} ref={node=>{arms.current[i]=node;}}>
    <mesh position={[0,-.025,0]} scale={[.114,.095,.12]} material={materials.coat}><sphereGeometry args={[1,16,12]}/></mesh>
    <mesh geometry={geometry.sleeve} material={materials.coat}/>
    <mesh position={[0,-.28,0]} material={materials.cuff}><cylinderGeometry args={[.1,.102,.065,16]}/></mesh>
    <group position={[0,-.30,0]} rotation={[-.12,0,0]} ref={node=>{elbows.current[i]=node;}}>
     <mesh geometry={geometry.forearm} material={materials.skin} scale={[1,1.28,1]}/>
     <group position={[0,-.515,-.01]} ref={side===1?grip:leftGrip}>
      <mesh scale={[.052,.075,.045]} material={materials.skin}><sphereGeometry args={[1,12,10]}/></mesh>
      <mesh position={[-side*.043,.02,-.015]} rotation={[0,0,side*.3]} scale={[.023,.047,.023]} material={materials.skin}><sphereGeometry args={[1,8,8]}/></mesh>
     </group>
    </group>
   </group>)}
   </group>
  </group>
 </group>;
}
