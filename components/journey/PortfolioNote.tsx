'use client';
import { useEffect, useRef } from 'react';
import { ContactContent, ExperienceContent, ProfileContent, ProjectsContent } from '@/components/PortfolioContent';

const titles=['A little about me.','The work behind the journey.','Selected projects.','Let’s connect.'];
const labels=['About','Experience','Projects','Contact'];
export default function PortfolioNote({chapter,onClose}:{chapter:number;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;node?.showModal();return ()=>node?.close();},[]);
 return <dialog ref={dialog} className="portfolio-note" aria-labelledby="portfolio-note-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><span className="portfolio-meta">0{chapter+1} / {labels[chapter]}</span><button type="button" onClick={onClose} aria-label="Close and return to the journey" autoFocus>Close <span aria-hidden="true">×</span></button></header>
  <div className="portfolio-note-body"><h2 id="portfolio-note-title">{titles[chapter]}</h2>
   {chapter===0?<ProfileContent/>:chapter===1?<ExperienceContent/>:chapter===2?<ProjectsContent/>:<ContactContent/>}
  </div>
  <footer><a href="/resume">Read the full résumé <span aria-hidden="true">↗</span></a><button type="button" onClick={onClose}>Back to the journey</button></footer>
 </dialog>;
}
