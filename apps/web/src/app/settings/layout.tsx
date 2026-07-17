import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Einstellungen',
  description: 'Passe Fuelyn an: Kraftstoffart, Radius, Benachrichtigungen und mehr.',
  path: '/settings',
  index: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
