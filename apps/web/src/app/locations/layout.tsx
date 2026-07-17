import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Gespeicherte Orte',
  description:
    'Verwalte deine gespeicherten Tank-Orte und Standort-Lesezeichen — schneller Zugriff auf Zuhause, Arbeit und häufige Routen.',
  path: '/locations',
  type: 'CollectionPage',
});

export const metadata = seg.metadata;
export default seg.Layout;
