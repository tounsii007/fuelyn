import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Routenplaner mit Tankstopps',
  description:
    'Plane deine Route mit optimalen Tankstopps — günstig tanken genau dann, wenn es sich lohnt.',
  path: '/route-planner',
});

export const metadata = seg.metadata;
export default seg.Layout;
