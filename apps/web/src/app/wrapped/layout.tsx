import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Tank-Jahresrückblick',
  description:
    'Dein Jahr in Zahlen: gefahrene Kilometer, getanktes Volumen und wie viel du mit Fuelyn gespart hast.',
  path: '/wrapped',
});

export const metadata = seg.metadata;
export default seg.Layout;
