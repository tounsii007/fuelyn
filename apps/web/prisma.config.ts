import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    // CLI default (db push / generate / studio). Real deploys set
    // DATABASE_URL; this localhost fallback matches the Postgres in
    // docker-compose.dev.yml so `npm run db:push` works out of the box.
    url:
      process.env.DATABASE_URL ??
      'postgresql://fuelyn:fuelyn@localhost:25432/fuelyn_web',
  },
});
