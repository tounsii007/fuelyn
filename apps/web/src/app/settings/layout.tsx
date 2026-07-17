import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Einstellungen',
  description: 'Passe Fuelyn an: Kraftstoffart, Radius, Benachrichtigungen und mehr.',
  path: '/settings',
  index: false,
});

export const metadata = seg.metadata;
export default seg.Layout;
