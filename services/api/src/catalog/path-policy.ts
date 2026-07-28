import { posix } from 'node:path';

export function resolveLibraryPath(mountRoot: string, requestedPath: string): string | null {
  const root = posix.resolve('/', mountRoot);
  const isRootPrefixed = requestedPath === root || requestedPath.startsWith(`${root}/`);
  const candidate = isRootPrefixed
    ? posix.resolve('/', requestedPath)
    : posix.resolve(root, requestedPath.startsWith('/') ? `.${requestedPath}` : requestedPath);
  const relativePath = posix.relative(root, candidate);
  return relativePath === '' || (!posix.isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith('../'))
    ? candidate
    : null;
}
