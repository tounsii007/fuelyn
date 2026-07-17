import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Verbrauchsstatistik',
  description:
    'Analysiere deinen Kraftstoffverbrauch: Kosten, Trends und Einsparpotenziale über die Zeit.',
  path: '/stats',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
