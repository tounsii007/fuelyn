import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Erfolge & Trophäen',
  description:
    'Sammle Trophäen fürs clevere Tanken: Streaks, Sparziele und Meilensteine auf deinem Weg zu günstigerem Sprit.',
  path: '/achievements',
});

export const metadata = seg.metadata;
export default seg.Layout;
