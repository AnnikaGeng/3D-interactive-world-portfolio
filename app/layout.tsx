import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: { default: 'Yi Geng — Full-Stack Developer', template: '%s | Yi Geng' },
 description: 'Yi Geng is a full-stack developer based in Salzburg, Austria. Java, TypeScript and end-to-end product delivery. Explore her experience, selected projects and résumé.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="en"><body>{children}</body></html>;
}
