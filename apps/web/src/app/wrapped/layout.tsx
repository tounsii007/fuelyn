import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Tank-Jahresrückblick',
  description:
    'Dein Jahr in Zahlen: gefahrene Kilometer, getanktes Volumen und wie viel du mit Fuelyn gespart hast.',
  path: '/wrapped',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
