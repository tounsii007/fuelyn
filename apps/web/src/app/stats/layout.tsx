import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Verbrauchsstatistik',
  description:
    'Analysiere deinen Kraftstoffverbrauch: Kosten, Trends und Einsparpotenziale über die Zeit.',
  path: '/stats',
});

export const metadata = seg.metadata;
export default seg.Layout;
