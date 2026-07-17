import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Erfolge & Trophäen',
  description:
    'Sammle Trophäen fürs clevere Tanken: Streaks, Sparziele und Meilensteine auf deinem Weg zu günstigerem Sprit.',
  path: '/achievements',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
