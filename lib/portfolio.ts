// Content transcribed and edited for the web from Yi Geng's supplied CV.
export const profile = {
 name: 'Yi Geng', role: 'Full-Stack Developer', location: 'Salzburg, Austria · CET',
 email: 'yigeng77@gmail.com', github: 'https://github.com/AnnikaGeng',
 cv: '/Yi-Geng-CV.pdf',
 intro: 'I build features from database schema to responsive interface — and stay with them after release.',
 bio: 'I’m a full-stack developer and former product manager based in Salzburg. On the Enox.share core team at Salzburg AG, I build the software behind energy communities: self-service interfaces, billing workflows and Java microservices. Product thinking helps me connect what people need with how the system works.',
 availability: 'Remote · Full overlap with European working hours',
 workPermit: 'Unrestricted access to the Austrian labour market; no sponsorship required in Austria.',
 languages: 'English — fluent · German — fluent · Mandarin — native',
};

export const experience = [
 { company: 'Salzburg AG', product: 'Enox.share', role: 'Software Developer', dates: 'Dec 2023 – Present', location: 'Salzburg, Austria',
   summary: 'Core-team developer on a production energy communities platform serving 143 communities and 3,000+ metering points.',
   points: [
    'Build SvelteKit and TypeScript interfaces for community management, billing, data visualisation and invoice generation. Keep complex tables responsive with reusable components and client-side caching.',
    'Build Java/Micronaut REST APIs on PostgreSQL, with JPA/Hibernate and Liquibase. Designed metering point assignments with validity periods, now used for 3,000+ metering points.',
    'Develop event-driven features on Dapr pub/sub with transactional writes and optimistic-lock retries. Migrated startup-loaded CSV reference data to PostgreSQL to support a user requirement.',
    'Contributed approximately 20% of the shared Storybook component library. Cover core flows with JUnit and Playwright, and investigate production issues through Grafana/Loki and OpenTelemetry.',
    'Deliver through written specs, PR reviews and CI/CD to Docker services on Azure Container Apps, working with billing and sales stakeholders.',
   ], tags: ['Java / Micronaut', 'TypeScript / SvelteKit', 'PostgreSQL', 'Azure'],
 },
 { company: 'Medliner', product: 'Patient recovery app', role: 'Product Manager', dates: 'Jul 2020 – Dec 2021', location: 'Beijing, China',
   summary: 'Led a cross-functional agile team to deliver a patient recovery app for 100+ seed users.',
   points: ['Designed a user rewards system that improved active user retention by 10%.'], tags: ['Product delivery', 'Agile', 'User retention'],
 },
 { company: 'Modao', product: 'Online prototyping platform', role: 'Product Assistant', dates: 'Oct 2019 – Jul 2020', location: 'Beijing, China',
   summary: 'Shipped features for a top-three online prototyping platform in China, with 1.3 million users.',
   points: ['Drove iterative product improvements through structured research with 400+ users.'], tags: ['User research', 'Prototyping', 'Product iteration'],
 },
];

export const projects = [
 { name: 'Fitness Landing', type: 'React + serverless', year: '2025',
   description: 'A React landing page with a serverless contact endpoint. Input is validated before valid submissions are stored in Cloudflare KV; invalid requests receive a 400 response.',
   detail: 'Cloudflare Pages Functions on the Workers runtime, with deployment on git push.',
   tags: ['React', 'Cloudflare Workers', 'KV'], href: 'https://github.com/AnnikaGeng/fitness-frontend',
 },
 { name: 'NASA APOD Gallery', type: 'REST API + data', year: '2023',
   description: 'A Node.js and Express API that retrieves NASA’s daily image, stores the image and its metadata, and serves a paginated gallery.',
   detail: 'Separate API and database layers, parameterised SQL, LIMIT/OFFSET pagination, and distinct handling for upstream and server errors.',
   tags: ['Node.js', 'Express', 'SQL'], href: 'https://github.com/AnnikaGeng/galleryBackend',
 },
];

export const skills = [
 ['Frontend', 'TypeScript, SvelteKit, TanStack Query, Storybook, responsive and component-driven UI. React in personal projects.'],
 ['Backend & data', 'Java, Micronaut, REST APIs, OpenAPI, PostgreSQL, JPA/Hibernate, Liquibase, SQL. Node.js and Express in personal projects.'],
 ['Architecture & cloud', 'Hexagonal architecture, microservices, Dapr pub/sub, optimistic locking, Docker, Azure Container Apps, CI/CD, Cloudflare Workers and KV.'],
 ['Quality & delivery', 'JUnit, integration testing, Playwright, TDD, code review, Grafana/Loki, OpenTelemetry, written specs and remote collaboration.'],
];
export const education = [
 { degree: 'MSc Information Systems for Business Performance', institution: 'University College Cork, Ireland', dates: '2022 – 2023' },
 { degree: 'BA German Linguistics', institution: 'Southwest University, China', dates: '2015 – 2019' },
];
export const certification = 'Microsoft Certified: Azure AI Cloud Developer Associate (AI-200) · 2026';
