import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'KI-Tankberater',
  description:
    'Frag den KI-Tankberater: beste Tankstelle, Preisprognose und Spartipps — im Dialog, in Echtzeit.',
  path: '/ai-chat',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
