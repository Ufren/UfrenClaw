/**
 * Use Electron's network stack when available so requests honor
 * session.defaultSession.setProxy(...). Fall back to the Node global fetch
 * for non-Electron test environments.
 */

export async function proxyAwareFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (process.versions.electron) {
    try {
      const { net } = await import("electron");
      const netInput = input instanceof URL ? input.toString() : input;
      return await net.fetch(netInput, init);
    } catch {
      // Fall through to the global fetch.
    }
  }

  return await fetch(input, init);
}
