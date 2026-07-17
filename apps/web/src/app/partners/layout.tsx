import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Tankkarten & Ladekarten',
  description:
    'Spare mit den passenden Tank- und Ladekarten. Vergleiche Partner-Angebote für Diesel, Benzin und E-Ladung.',
  path: '/partners',
  type: 'CollectionPage',
});

export const metadata = seg.metadata;
export default seg.Layout;
