import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Fahrzeuge',
  description: 'Verwalte deine Fahrzeuge, Tankarten und Verbrauchsprofile.',
  path: '/vehicle',
  index: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
