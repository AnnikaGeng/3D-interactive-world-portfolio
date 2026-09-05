'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cameraAt, chapters, clamp, terrainHeight } from '@/lib/terrain';
import { PALETTE } from '@/lib/artDirection';
import World, { landmarkPosition } from './World';

type JourneyState={target:number,current:number,yaw:number,pitch:number,dragging:boolean,reduced:boolean,focus:number|null};
type FrameProps={state:React.RefObject<JourneyState>,onProgress:(p:number)=>void,marker:React.RefObject<HTMLButtonElement|null>,onReady:()=>void};
function CameraJourney({state,onProgress,marker,onReady}:FrameProps){
 const {camera,scene}=useThree();
 const values=useRef({pos:new THREE.Vector3(),look:new THREE.Vector3(),focusPos:new THREE.Vector3(),focusLook:new THREE.Vector3(),base:new THREE.Quaternion(),offset:new THREE.Quaternion(),point:new THREE.Vector3(),last:-1,focusMix:0,ready:false});
 useFrame((_,dt)=>{
  const v=values.current,s=state.current,delta=Math.min(dt,.05);
  s.current=THREE.MathUtils.damp(s.current,s.target,s.reduced?100:5,delta);
  cameraAt(s.current,v.pos,v.look);
  const active=s.current<.285?0:s.current<.535?1:s.current<.805?2:3;
  v.focusMix=THREE.MathUtils.damp(v.focusMix,s.focus===null?0:1,5,delta);
  if(s.focus!==null){
   v.focusLook.copy(landmarkPosition(s.focus));
   const offsets=[[8,3,11],[12,2,20],[6,10,16],[0,-5,32]];
   v.focusPos.copy(v.focusLook).add(new THREE.Vector3(...offsets[s.focus] as [number,number,number]));
   v.focusPos.y=Math.max(v.focusPos.y,terrainHeight(v.focusPos.x,-v.focusPos.z)+3);
   if(s.focus===2)v.focusLook.set(-80,174,-1080);
  }
  v.pos.lerp(v.focusPos,v.focusMix);v.look.lerp(v.focusLook,v.focusMix);
  camera.position.copy(v.pos);camera.lookAt(v.look);v.base.copy(camera.quaternion);
  v.offset.setFromEuler(new THREE.Euler(s.pitch,s.yaw,0,'YXZ'));
  camera.quaternion.copy(v.base).multiply(v.offset);
  const fog=scene.fog as THREE.FogExp2;
  fog.density=THREE.MathUtils.lerp(.0025,.00165,clamp((s.current-.5)*2));
  if(marker.current){
   v.point.copy(landmarkPosition(active));const distance=camera.position.distanceTo(v.point);v.point.project(camera);
   const visible=v.point.z<1 && v.point.z>-1 && Math.abs(v.point.x)<.88 && Math.abs(v.point.y)<.78 && distance<420 && s.focus===null;
   marker.current.style.left=`${(v.point.x*.5+.5)*100}%`;marker.current.style.top=`${(-v.point.y*.5+.5)*100}%`;
   marker.current.style.visibility=visible?'visible':'hidden';marker.current.tabIndex=visible?0:-1;
  }
  if(Math.abs(s.current-v.last)>.001 || v.last===-1){onProgress(s.current);v.last=s.current;}
  if(!v.ready){v.ready=true;onReady();}
 });
 return null;
}
function Sky(){
 const uniforms=useRef({top:{value:new THREE.Color(PALETTE.paperCool)},bottom:{value:new THREE.Color(PALETTE.paper)}});
 return <mesh scale={6000}><sphereGeometry args={[1,32,16]}/><shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms.current}
  vertexShader={'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
  fragmentShader={'uniform vec3 top;uniform vec3 bottom;varying vec3 vDirection;float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){float h=normalize(vDirection).y;vec3 c=mix(bottom,top,smoothstep(-.1,.95,h));c*=.985+grain(gl_FragCoord.xy)*.03;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'} /></mesh>;
}

class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="journey-fallback"><p>The 3D scene could not start.</p><button onClick={()=>window.location.reload()}>Reload</button><a href="/illustration">View the illustrated version</a></div>:this.props.children;}
}
export default function ImmersiveJourney(){
 const state=useRef<JourneyState>({target:0,current:0,yaw:0,pitch:0,dragging:false,reduced:false,focus:null});
 const marker=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const [progress,setProgress]=useState(0),[ready,setReady]=useState(false),[focus,setFocus]=useState<number|null>(null),[looking,setLooking]=useState(false),[dragging,setDragging]=useState(false);
 const active=progress<.285?0:progress<.535?1:progress<.805?2:3;
 const chapter=chapters[active];
 const [motionReduced,setMotionReduced]=useState(false);
 const onReady=useCallback(()=>setReady(true),[]);
 const updateProgress=useCallback((p:number)=>setProgress(p),[]);
 const navigate=useCallback((p:number)=>{
  state.current.yaw=0;state.current.pitch=0;state.current.focus=null;setFocus(null);setLooking(false);
  window.scrollTo({top:p*(document.documentElement.scrollHeight-window.innerHeight),behavior:state.current.reduced?'instant':'smooth'});
 },[]);
 const explore=useCallback((i:number)=>{state.current.focus=i;state.current.yaw=0;state.current.pitch=0;setFocus(i);setLooking(false);},[]);
 const returnToPath=useCallback(()=>{state.current.focus=null;state.current.yaw=0;state.current.pitch=0;setFocus(null);setLooking(false);marker.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{if(focus!==null)closeButton.current?.focus({preventScroll:true});},[focus]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>{state.current.reduced=media.matches;setMotionReduced(media.matches);};motion();media.addEventListener('change',motion);
  const onScroll=()=>{
   state.current.target=clamp(window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight));
   if(state.current.focus!==null){state.current.focus=null;setFocus(null);}
  };onScroll();window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){returnToPath();return;}
   if((e.target as HTMLElement).closest('button,a,input'))return;
   if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
    e.preventDefault();state.current.yaw+=(e.key==='ArrowRight'?-.13:.13);setLooking(true);
   }
  };window.addEventListener('keydown',onKey);
  return ()=>{media.removeEventListener('change',motion);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);window.removeEventListener('keydown',onKey);};
 },[returnToPath]);
 const pointer=useRef({x:0,y:0,started:false,touch:false});
 const startDrag=(e:React.PointerEvent<HTMLDivElement>)=>{if(e.button!==0 || (e.target as HTMLElement).closest('button,a'))return;pointer.current={x:e.clientX,y:e.clientY,started:true,touch:e.pointerType==='touch'};if(e.pointerType!=='touch')e.currentTarget.setPointerCapture(e.pointerId);};
 const moveDrag=(e:React.PointerEvent<HTMLDivElement>)=>{
  const p=pointer.current;if(!p.started)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
  if(p.touch && !state.current.dragging && Math.abs(dy)>Math.abs(dx)){p.started=false;return;}
  if(Math.abs(dx)+Math.abs(dy)<2)return;
  state.current.dragging=true;setDragging(true);setLooking(true);state.current.yaw-=dx*.003;state.current.pitch=clamp(state.current.pitch-dy*.002,-.65,.65);p.x=e.clientX;p.y=e.clientY;
 };
 const endDrag=()=>{pointer.current.started=false;state.current.dragging=false;setDragging(false);};
 const titlePhase=clamp((progress-chapter.at)/(.14));
 const opacity=focus===null?1-clamp((titlePhase-.45)/.55)*.83:0;
 return <>
  <main className={`journey-shell ${ready?'is-ready':''} ${dragging?'is-dragging':''} chapter-${active}`} aria-label="Ascent — a journey in four chapters">
   <div className="journey-world" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <SceneBoundary><Canvas dpr={[1,1.5]} camera={{position:[18,16,90],fov:51,near:.3,far:6500}} gl={{antialias:true,powerPreference:'high-performance',alpha:false}}
     // Flat printed colour: any tone mapping pulls the palette toward neutral.
     onCreated={({gl})=>{gl.toneMapping=THREE.NoToneMapping;}}>
     <color attach="background" args={[PALETTE.paper]}/><fogExp2 attach="fog" args={[PALETTE.haze,.0025]}/>
     {/* Every material now shades itself in flat steps, so the scene needs no lights. */}
     <Sky/><World/><CameraJourney state={state} onProgress={updateProgress} marker={marker} onReady={onReady}/>
    </Canvas></SceneBoundary>
   </div>
   <div className="journey-atmosphere" aria-hidden="true"/><div className="journey-grain" aria-hidden="true"/>
   {!ready && <div className="journey-loading"><span>ASCENT</span><p>Building the world</p><i/></div>}
   <header className="journey-header"><a href="#" onClick={e=>{e.preventDefault();navigate(0);}} aria-label="Ascent — back to the start">ascent</a><span className="journey-header-note">A JOURNEY THROUGH PERSPECTIVE</span><button onClick={()=>explore(active)}>Explore here <span>↗</span></button></header>
   <nav className="chapter-nav" aria-label="Chapters">{chapters.map((c,i)=><button key={c.id} aria-label={`${String(i+1).padStart(2,'0')} ${c.name}`} aria-current={active===i?'step':undefined} onClick={()=>navigate(c.at)}><i/><span>{c.name}</span><small>{String(i+1).padStart(2,'0')}</small></button>)}</nav>
   <section className="journey-copy" key={chapter.id} style={{opacity,transform:`translateY(${-titlePhase*22}px)`}} aria-live="polite"><p className="journey-eyebrow">{chapter.kicker}</p><h1>{chapter.title.map(line=><span key={line}>{line}</span>)}</h1><p className="journey-line">{chapter.body}</p></section>
   <button className="world-hotspot" ref={marker} onClick={()=>explore(active)} aria-label={chapter.label}><span className="hotspot-ring">+</span><span className="hotspot-caption" style={{opacity:titlePhase>.8?1:0}}>{chapter.hotspot}</span></button>
   {focus!==null && <aside className="exploration-note" role="dialog" aria-labelledby="note-title"><span className="journey-eyebrow">{chapters[focus].en} / FIELD NOTE</span><h2 id="note-title">{chapters[focus].hotspot}</h2><p>{chapters[focus].note}</p><button ref={closeButton} onClick={returnToPath}>Back to the path <span>↙</span></button></aside>}
   <footer className="journey-footer"><div className="journey-location"><span>{String(active+1).padStart(2,'0')}</span><p>{chapter.en}</p></div>
    <div className="journey-instruction">{focus!==null?'Scroll to continue':looking?<button onClick={returnToPath}>Look forward again ↺</button>:<><span className="scroll-stroke"/>Scroll to travel <span className="instruction-divider">/</span> Drag to look around</>}</div>
    {progress>.975?<button className="journey-next" onClick={()=>navigate(0)}>Start again <span>↺</span></button>:<button className="journey-next" onClick={()=>navigate(active<3?chapters[active+1].at:1)}>{active<3?'Next chapter':'To the sea'} <span>↓</span></button>}
   </footer>
   <div className="journey-progress" role="progressbar" aria-label="Journey progress" aria-valuenow={Math.round(progress*100)} aria-valuemin={0} aria-valuemax={100}><span style={{transform:`scaleX(${progress})`}}/></div>
   {motionReduced && <span className="reduced-note">Reduced motion</span>}
  </main>
  <div className="journey-scroll-space" aria-hidden="true"/>
 </>;
}
