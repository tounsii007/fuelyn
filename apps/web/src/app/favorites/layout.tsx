import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Favoriten',
  description: 'Deine gespeicherten Lieblingstankstellen auf einen Blick.',
  path: '/favorites',
  index: false,
});

export const metadata = seg.metadata;
export default seg.Layout;
