import { routeSegment } from '@/lib/seo/route-segment';

const seg = routeSegment({
  title: 'Preisalarme',
  description: 'Lass dich benachrichtigen, wenn der Spritpreis an deinen Tankstellen fällt.',
  path: '/alerts',
  index: false,
});

export const metadata = seg.metadata;
export default seg.Layout;
