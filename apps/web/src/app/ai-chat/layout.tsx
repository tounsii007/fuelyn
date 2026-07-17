import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'KI-Tankberater',
  description:
    'Frag den KI-Tankberater: beste Tankstelle, Preisprognose und Spartipps — im Dialog, in Echtzeit.',
  path: '/ai-chat',
});

export const metadata = seg.metadata;
export default seg.Layout;
