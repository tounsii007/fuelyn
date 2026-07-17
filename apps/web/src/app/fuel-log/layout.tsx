import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Tank-Logbuch',
  description: 'Erfasse deine Tankvorgänge und behalte Verbrauch und Kosten im Griff.',
  path: '/fuel-log',
  index: false,
});

export const metadata = seg.metadata;
export default seg.Layout;
