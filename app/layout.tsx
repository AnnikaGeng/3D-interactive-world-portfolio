import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'Ascent — A journey through perspective',
 description: '循着珊瑚色的小径，走过山谷、攀登、山顶与海洋。一段可以环顾与探索的山海旅程。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="zh-CN"><body>{children}</body></html>;
}
