import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Tankstellen vergleichen',
  description:
    'Vergleiche Tankstellen direkt: Preise, Entfernung, Öffnungszeiten und die beste Gesamtempfehlung auf einen Blick.',
  path: '/compare',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
