import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'Ascent — A journey through perspective',
 description: 'Follow the coral trail through a valley, a climb, a summit and the open sea — a journey you can look around inside.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="en"><body>{children}</body></html>;
}
