import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Gespeicherte Orte',
  description:
    'Verwalte deine gespeicherten Tank-Orte und Standort-Lesezeichen — schneller Zugriff auf Zuhause, Arbeit und häufige Routen.',
  path: '/locations',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
