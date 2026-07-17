import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Favoriten',
  description: 'Deine gespeicherten Lieblingstankstellen auf einen Blick.',
  path: '/favorites',
  index: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
