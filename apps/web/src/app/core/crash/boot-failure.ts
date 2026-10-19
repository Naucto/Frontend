import { crashRoute, describeError } from './crash-reporter.service';

/**
 * Reports an app that failed to start. Nothing of the app runs yet, so the address comes straight
 * from /config.json, and the server decides whether crash reports are on.
 */
export async function reportBootFailure(error: unknown): Promise<void> {
  try {
    const config = (await (await fetch('/config.json', { cache: 'no-store' })).json()) as {
      apiUrl?: string;
      release?: string;
    };
    const { name, message, stack } = describeError(error);
    await fetch(`${(config.apiUrl ?? '').replace(/\/$/, '')}/reports/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify({
        source: 'web',
        name: name.slice(0, 120),
        message: message.slice(0, 500),
        stack: stack.slice(0, 8_000),
        route: crashRoute(location.pathname),
        ...(config.release ? { appRelease: config.release } : {}),
      }),
    });
  } catch {
    // Nothing is left to tell about a report that could not be sent.
  }
}
