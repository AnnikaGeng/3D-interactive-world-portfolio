import type { Metadata } from 'next';
import { ContactContent, EducationContent, ExperienceContent, ProfileContent, ProjectsContent } from '@/components/PortfolioContent';
import { profile } from '@/lib/portfolio';

export const metadata:Metadata={title:'Résumé',description:'Yi Geng — full-stack developer. Work experience at Salzburg AG, Medliner and Modao, selected projects, skills and education.'};
export default function Resume(){return <main className="resume-page">
 <a className="resume-skip" href="#resume-experience">Skip to experience</a>
 <header className="resume-nav"><a href="/" aria-label="Yi Geng — return to the journey">Yi Geng<span>Portfolio</span></a><a href={profile.cv} download="Yi-Geng-CV.pdf">Download CV <span aria-hidden="true">↓</span></a></header>
 <section className="resume-intro"><p className="portfolio-meta">Full-stack developer · Java & TypeScript</p><h1>Yi Geng<span>Product thinking.<br/>Engineering, end to end.</span></h1><div className="resume-intro-footer"><p>{profile.location}<br/>{profile.availability}</p><a href={`mailto:${profile.email}`}>{profile.email} ↗</a></div></section>
 <nav className="resume-section-nav" aria-label="Résumé sections"><a href="#resume-about">About</a><a href="#resume-experience">Experience</a><a href="#resume-projects">Projects</a><a href="#resume-education">Education</a><a href="#resume-contact">Contact</a></nav>
 <section className="resume-section" id="resume-about"><div className="resume-section-heading"><span>01</span><h2>About & skills</h2></div><div><ProfileContent/></div></section>
 <section className="resume-section" id="resume-experience"><div className="resume-section-heading"><span>02</span><h2>Experience</h2></div><ExperienceContent/></section>
 <section className="resume-section" id="resume-projects"><div className="resume-section-heading"><span>03</span><h2>Selected projects</h2></div><ProjectsContent/></section>
 <section className="resume-section" id="resume-education"><div className="resume-section-heading"><span>04</span><h2>Education</h2></div><EducationContent/></section>
 <section className="resume-section" id="resume-contact"><div className="resume-section-heading"><span>05</span><h2>Contact</h2></div><div><ContactContent/></div></section>
 <footer className="resume-footer"><span>Yi Geng · Full-Stack Developer</span><a href="/">Back to the mountain journey ↗</a></footer>
 </main>;}
