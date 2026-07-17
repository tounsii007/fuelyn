import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Preisalarme',
  description: 'Lass dich benachrichtigen, wenn der Spritpreis an deinen Tankstellen fällt.',
  path: '/alerts',
  index: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
