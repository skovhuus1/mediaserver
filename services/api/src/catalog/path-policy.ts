import { posix } from 'node:path';

export function resolveLibraryPath(mountRoot: string, requestedPath: string): string | null {
  const root = posix.resolve('/', mountRoot);
  const candidate = posix.resolve(root, requestedPath.startsWith('/') ? `.${requestedPath}` : requestedPath);
  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : null;
}
