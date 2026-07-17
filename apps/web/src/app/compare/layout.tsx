import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Tankstellen vergleichen',
  description:
    'Vergleiche Tankstellen direkt: Preise, Entfernung, Öffnungszeiten und die beste Gesamtempfehlung auf einen Blick.',
  path: '/compare',
});

export const metadata = seg.metadata;
export default seg.Layout;
