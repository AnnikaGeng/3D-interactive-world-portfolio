import { certification, education, experience, profile, projects, skills } from '@/lib/portfolio';

export function ProfileContent(){return <>
 <p className="portfolio-lead">{profile.intro}</p><p>{profile.bio}</p>
 <dl className="portfolio-stats"><div><dt>143</dt><dd>energy communities</dd></div><div><dt>3,000+</dt><dd>metering points</dd></div><div><dt>End to end</dt><dd>schema → API → UI → tests</dd></div></dl>
 <div className="portfolio-skills">{skills.map(([name,detail])=><div key={name}><h3>{name}</h3><p>{detail}</p></div>)}</div>
 </>;}

export function ExperienceContent(){return <div className="portfolio-timeline">{experience.map(job=><article key={job.company}>
 <div className="portfolio-meta"><span>{job.dates}</span><span>{job.location}</span></div>
 <h3>{job.company}<span>{job.role}</span></h3><p className="portfolio-project-type">{job.product}</p>
 <p>{job.summary}</p><ul>{job.points.map(point=><li key={point}>{point}</li>)}</ul>
 <div className="portfolio-tags">{job.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
 </article>)}</div>;}

export function ProjectsContent(){return <div className="portfolio-projects">{projects.map((project,i)=><article key={project.name}>
 <div className="portfolio-meta"><span>0{i+1} / {project.type}</span><span>{project.year}</span></div>
 <h3>{project.name}</h3><p>{project.description}</p><p>{project.detail}</p>
 <div className="portfolio-tags">{project.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
 <a className="portfolio-text-link" href={project.href} target="_blank" rel="noreferrer">View {project.name} on GitHub <span aria-hidden="true">↗</span></a>
 </article>)}</div>;}

export function EducationContent(){return <div className="portfolio-education">{education.map(item=><article key={item.degree}><div className="portfolio-meta">{item.dates}</div><h3>{item.degree}</h3><p>{item.institution}</p></article>)}<article><div className="portfolio-meta">Certification</div><h3>{certification}</h3></article></div>;}

export function ContactContent(){return <>
 <p className="portfolio-lead">Have a product that needs thoughtful engineering? Let’s talk.</p>
 <a className="portfolio-email" href={`mailto:${profile.email}`}>{profile.email} <span aria-hidden="true">↗</span></a>
 <p>{profile.location}<br/>{profile.availability}</p><p>{profile.workPermit}</p>
 <p>{profile.languages}</p>
 <div className="portfolio-contact-links"><a href={profile.github} target="_blank" rel="noreferrer">GitHub ↗</a><a href={profile.cv} download="Yi-Geng-CV.pdf">Download CV ↓</a></div>
 </>;}
