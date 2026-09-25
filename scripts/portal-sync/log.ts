const PREFIX = '[portal-sync]';

function stamp(): string {
  return new Date().toISOString();
}

export const log = {
  info: (...args: unknown[]) => console.log(stamp(), PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(stamp(), PREFIX, 'WARN', ...args),
  error: (...args: unknown[]) => console.error(stamp(), PREFIX, 'ERROR', ...args),
};

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1000 ? `${message.slice(0, 1000)}...` : message;
}
