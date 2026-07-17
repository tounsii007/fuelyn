import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Tankkarten & Ladekarten',
  description:
    'Spare mit den passenden Tank- und Ladekarten. Vergleiche Partner-Angebote für Diesel, Benzin und E-Ladung.',
  path: '/partners',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
