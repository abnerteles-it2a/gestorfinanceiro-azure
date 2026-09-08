export class ServiceConfigurationError extends Error {
  constructor(message = 'service_misconfigured') {
    super(message);
    this.name = 'ServiceConfigurationError';
  }
}

export const requireJwtSecret = (): string => {
  const secret = String(process.env.NEON_AUTH_SECRET || process.env.STACK_SECRET_SERVER_KEY || '').trim();
  if (secret.length < 32) {
    throw new ServiceConfigurationError();
  }
  return secret;
};
