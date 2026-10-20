const env = process.env;

export const config = {
  port: Number(env.PORT || 8081),
  isProd: env.NODE_ENV === 'production',
  username: env.WOLF_ADMIN_USERNAME || 'admin',
  password: env.WOLF_ADMIN_PASSWORD || '',
  passwordHash: env.WOLF_ADMIN_PASSWORD_HASH || '',
  sessionSecret: env.WOLF_SESSION_SECRET || '',
  // Wolf's own data (projects, research, academics). Tables live in the "wolf" schema, so it can share a database.
  databaseUrl: env.WOLF_DATABASE_URL || 'postgres://clutch:clutch@localhost:5434/clutchx3d',
  databaseCaCert: env.WOLF_DATABASE_CA_CERT || '',
  databaseSsl: env.WOLF_DATABASE_SSL === 'true' || /sslmode=require/.test(env.WOLF_DATABASE_URL || ''),
  // Largest file that can be synced to the server. Uploads are held in memory, so keep it within the server's RAM.
  maxFileMb: Number(env.WOLF_MAX_FILE_MB) || 50,
  cookieSecure: env.WOLF_COOKIE_SECURE ? env.WOLF_COOKIE_SECURE !== 'false' : env.NODE_ENV === 'production',
};

if (!config.password && !config.passwordHash) {
  console.warn('[config] Set WOLF_ADMIN_PASSWORD or WOLF_ADMIN_PASSWORD_HASH. Login is disabled until one is set.');
}
if (config.sessionSecret.length < 24) {
  if (config.isProd) {
    console.error('[config] WOLF_SESSION_SECRET must be at least 24 characters in production.');
    process.exit(1);
  }
  config.sessionSecret = 'dev-only-session-secret-not-for-production';
}
