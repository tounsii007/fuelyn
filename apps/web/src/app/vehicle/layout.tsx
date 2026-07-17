import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Fahrzeuge',
  description: 'Verwalte deine Fahrzeuge, Tankarten und Verbrauchsprofile.',
  path: '/vehicle',
  index: false,
});

export const metadata = seg.metadata;
export default seg.Layout;
