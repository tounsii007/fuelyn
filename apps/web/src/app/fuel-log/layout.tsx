import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Tank-Logbuch',
  description: 'Erfasse deine Tankvorgänge und behalte Verbrauch und Kosten im Griff.',
  path: '/fuel-log',
  index: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
