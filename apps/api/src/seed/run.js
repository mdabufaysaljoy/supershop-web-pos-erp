/* eslint-disable no-console -- CLI script: prints a one-time summary for the operator */
import { z } from 'zod';
import { validators } from '@supershop/shared';
import { config } from '../core/config.js';
import { randomToken } from '../core/crypto.js';
import { connectDb, disconnectDb } from '../core/db.js';
import { seedDefaultRoles } from '../modules/rbac/index.js';
import { ensureSuperAdmin } from '../modules/staff/index.js';

/**
 * `npm run seed` — idempotent. Safe to run on every deploy:
 * - inserts missing default roles (never overwrites admin edits)
 * - creates the first super-admin only if none exists
 *
 * Env: SEED_ADMIN_EMAIL (required), SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD.
 * Without SEED_ADMIN_PASSWORD (non-production only) a strong password is generated and printed
 * ONCE to this terminal (not to logs). Change it after first login.
 */
const env = z
  .object({
    SEED_ADMIN_EMAIL: validators.email,
    SEED_ADMIN_NAME: validators.name.default('Super Admin'),
    SEED_ADMIN_PASSWORD: validators.password().optional(),
  })
  .safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));

if (!env.success) {
  console.error('Seed configuration invalid:');
  for (const i of env.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
const { SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD } = env.data;
if (config.isProd && !SEED_ADMIN_PASSWORD) {
  console.error('SEED_ADMIN_PASSWORD is required in production.');
  process.exit(1);
}

async function main() {
  await connectDb();
  try {
    const roles = await seedDefaultRoles();
    console.info(`✔ default roles ensured (${roles})`);

    const generated = SEED_ADMIN_PASSWORD ? null : `${randomToken(12)}-9a`;
    const result = await ensureSuperAdmin({
      name: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD ?? generated,
    });
    if (!result.created) {
      console.info('✔ super-admin already exists (unchanged)');
    } else {
      console.info(`✔ super-admin created: ${SEED_ADMIN_EMAIL}`);
      if (generated)
        console.info(`  generated password (shown once, change it after login): ${generated}`);
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
