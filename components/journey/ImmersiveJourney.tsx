'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cameraAt, chapters, clamp, terrainHeight } from '@/lib/terrain';
import { PALETTE, SKY, setAtmosphere } from '@/lib/artDirection';
import World, { DEFAULT_FOREGROUND, type ForegroundSettings, landmarkPosition } from './World';
import PortfolioNote from './PortfolioNote';

type JourneyState={target:number,current:number,yaw:number,pitch:number,dragging:boolean,reduced:boolean,focus:number|null};
type FrameProps={state:React.RefObject<JourneyState>,onProgress:(p:number)=>void,marker:React.RefObject<HTMLButtonElement|null>,copy:React.RefObject<HTMLElement|null>,onReady:()=>void};
function CameraJourney({state,onProgress,marker,copy,onReady}:FrameProps){
 const {camera,scene,size}=useThree();
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
  fog.color.set(SKY.dayHaze).lerp(new THREE.Color(SKY.duskHaze),clamp((s.current-.52)/.42));
  if(marker.current){
   v.point.copy(landmarkPosition(active));const distance=camera.position.distanceTo(v.point);v.point.project(camera);
   // Keep the projected landmark out of the entire copy block, including its
   // CTA. The fixed Explore action remains available when a marker is occluded.
   const text=copy.current?.getBoundingClientRect(),left=(v.point.x*.5+.5)*size.width-30,top=(-v.point.y*.5+.5)*size.height-30;
   const overlapsCopy=!!text&&left<text.right+18&&left+marker.current.offsetWidth>text.left-18&&top<text.bottom+18&&top+marker.current.offsetHeight>text.top-18;
   const visible=active!==2&&v.point.z<1 && v.point.z>-1 && Math.abs(v.point.x)<.88 && Math.abs(v.point.y)<.78 && distance<420 && s.focus===null&&!overlapsCopy;
   marker.current.style.left=`${(v.point.x*.5+.5)*100}%`;marker.current.style.top=`${(-v.point.y*.5+.5)*100}%`;
   marker.current.style.visibility=visible?'visible':'hidden';marker.current.tabIndex=visible?0:-1;
  }
  if(Math.abs(s.current-v.last)>.001 || v.last===-1){onProgress(s.current);v.last=s.current;}
  if(!v.ready){v.ready=true;onReady();}
 });
 return null;
}
const skyColour = (hex: string) => new THREE.Color(hex);
const DAY = { top: skyColour(SKY.dayTop), mid: skyColour(SKY.dayMid), horizon: skyColour(SKY.dayHorizon) };
const DUSK = { top: skyColour(SKY.duskTop), mid: skyColour(SKY.duskMid), horizon: skyColour(SKY.duskHorizon) };

/**
 * Morning in the valley, dusk by the sea. Three stops rather than two: a
 * two-stop ramp cannot hold the warm band just above the horizon that makes
 * dusk read as dusk.
 */
function Sky({state}:{state:React.RefObject<JourneyState>}){
 const uniforms=useRef({
   top:{value:DAY.top.clone()}, mid:{value:DAY.mid.clone()}, horizon:{value:DAY.horizon.clone()},
 });
 useFrame(()=>{
  const t=clamp((state.current.current-0.52)/0.42);
  uniforms.current.top.value.copy(DAY.top).lerp(DUSK.top,t);
  uniforms.current.mid.value.copy(DAY.mid).lerp(DUSK.mid,t);
  uniforms.current.horizon.value.copy(DAY.horizon).lerp(DUSK.horizon,t);
  setAtmosphere(state.current.current);
 });
 return <mesh scale={6000}><sphereGeometry args={[1,48,24]}/><shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms.current}
  vertexShader={'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
  fragmentShader={'uniform vec3 top;uniform vec3 mid;uniform vec3 horizon;varying vec3 vDirection;float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){float h=normalize(vDirection).y;vec3 c=mix(horizon,mid,smoothstep(-.07,.10,h));c=mix(c,top,smoothstep(.05,.42,h));c*=.985+grain(gl_FragCoord.xy)*.03;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'} /></mesh>;
}

class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="journey-fallback"><p>The 3D scene could not start.</p><button onClick={()=>window.location.reload()}>Reload</button><a href="/resume">Read Yi Geng’s résumé</a></div>:this.props.children;}
}
export default function ImmersiveJourney(){
 const [foreground,setForeground]=useState<ForegroundSettings>(DEFAULT_FOREGROUND);
 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem('ascent.foreground.v1')||'null');
   if(saved&&['height','width','relief','offset'].every(key=>Number.isFinite(saved[key]))){
    setForeground({height:clamp(saved.height,0,1.5),width:clamp(saved.width,.6,1.4),relief:clamp(saved.relief),offset:clamp(saved.offset,-100,0)});
   }
  }catch{}
 },[]);
 const state=useRef<JourneyState>({target:0,current:0,yaw:0,pitch:0,dragging:false,reduced:false,focus:null});
 const marker=useRef<HTMLButtonElement>(null);
 const copy=useRef<HTMLElement>(null);
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
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>{state.current.reduced=media.matches;setMotionReduced(media.matches);};motion();media.addEventListener('change',motion);
  const onScroll=()=>{
   state.current.target=clamp(window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight));
   if(state.current.focus!==null){state.current.focus=null;setFocus(null);}
  };
  // ?at=0..1 opens partway along the route. Deferred, because the router
  // restores scroll after this effect runs and would undo it; and on a timer
  // rather than a frame, since a background tab stops delivering frames.
  const at=new URLSearchParams(window.location.search).get('at');
  const deepLink=()=>{
   const p=clamp(Number(at));
   const max=document.documentElement.scrollHeight-window.innerHeight;
   if(max>0)window.scrollTo({top:p*max,behavior:'instant'});
   // Land there rather than flying there: the camera damps toward its target,
   // and a deep link should not start with a several-second journey from zero.
   state.current.target=p;state.current.current=p;
  };
  const links=at!==null&&Number.isFinite(Number(at))
   ? [setTimeout(deepLink,0),setTimeout(deepLink,300)] : [];
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){returnToPath();return;}
   if(state.current.focus!==null)return;
   if((e.target as HTMLElement).closest('button,a,input'))return;
   if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
    e.preventDefault();state.current.yaw+=(e.key==='ArrowRight'?-.13:.13);setLooking(true);
   }
  };window.addEventListener('keydown',onKey);
  return ()=>{links.forEach(clearTimeout);media.removeEventListener('change',motion);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);window.removeEventListener('keydown',onKey);};
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
 const opacity=focus===null?1-clamp((titlePhase-.45)/.55)*.12:0;
 return <>
  <main className={`journey-shell ${ready?'is-ready':''} ${dragging?'is-dragging':''} chapter-${active}`} aria-label="Yi Geng — an interactive portfolio in four chapters">
   <div className="journey-world" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <SceneBoundary><Canvas dpr={[1,2]} camera={{position:[18,16,90],fov:51,near:.3,far:6500}} gl={{antialias:true,powerPreference:'high-performance',alpha:false}}
     // Flat printed colour: any tone mapping pulls the palette toward neutral.
     onCreated={({gl})=>{gl.toneMapping=THREE.NoToneMapping;}}>
     <color attach="background" args={[PALETTE.paper]}/><fogExp2 attach="fog" args={[PALETTE.haze,.0025]}/>
     {/* Every material now shades itself in flat steps, so the scene needs no lights. */}
     <Sky state={state}/><World progress={state} foreground={foreground}/><CameraJourney state={state} onProgress={updateProgress} marker={marker} copy={copy} onReady={onReady}/>
    </Canvas></SceneBoundary>
   </div>
   <div className="journey-atmosphere" aria-hidden="true"/><div className="journey-grain" aria-hidden="true"/>
   {!ready && <div className="journey-loading"><span>YI GENG</span><p>A journey through my work</p><i/><a className="loading-resume" href="/resume">Read my résumé ↗</a></div>}
   <header className="journey-header"><a href="#" onClick={e=>{e.preventDefault();navigate(0);}} aria-label="Yi Geng — back to the start">Yi Geng</a><span className="journey-header-note">FULL-STACK DEVELOPER · JAVA & TYPESCRIPT</span><div className="journey-header-actions"><a href="/resume">Résumé <span>↗</span></a><button onClick={()=>explore(active)}>{active===3?'Contact':'Explore'} <span>↗</span></button></div></header>
   <nav className="chapter-nav" aria-label="Chapters">{chapters.map((c,i)=><button key={c.id} aria-label={`${String(i+1).padStart(2,'0')} ${c.name}`} aria-current={active===i?'step':undefined} onClick={()=>navigate(c.at)}><i/><span>{c.name}</span><small>{String(i+1).padStart(2,'0')}</small></button>)}</nav>
   <section ref={copy} className="journey-copy" key={chapter.id} style={{opacity,transform:`translateY(${-titlePhase*22}px)`}} aria-live="polite"><p className="journey-eyebrow">{chapter.kicker}</p><h1>{chapter.title.map(line=><span key={line}>{line}</span>)}</h1><p className="journey-line">{chapter.body}</p><button className="journey-content-link" onClick={()=>explore(active)}>{chapter.hotspot} <span aria-hidden="true">↗</span></button></section>
   <button className="world-hotspot" ref={marker} onClick={()=>explore(active)} aria-label={chapter.label}><span className="hotspot-ring">+</span><span className="hotspot-caption" style={{opacity:titlePhase>.8?1:0}}>{chapter.hotspot}</span></button>
   {focus!==null && <PortfolioNote chapter={focus} onClose={returnToPath}/>}
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
