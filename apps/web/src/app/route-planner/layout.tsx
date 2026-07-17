import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Routenplaner mit Tankstopps',
  description:
    'Plane deine Route mit optimalen Tankstopps — günstig tanken genau dann, wenn es sich lohnt.',
  path: '/route-planner',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
