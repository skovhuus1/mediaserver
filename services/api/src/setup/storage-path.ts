import { posix } from 'node:path';

export function resolveStorageBrowsePath(mountRoot: string, requestedPath: string): string | null {
  const root = posix.resolve('/', mountRoot);
  const candidate = requestedPath.startsWith('/')
    ? posix.resolve('/', requestedPath)
    : posix.resolve(root, requestedPath);

  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : null;
}

export function hostDisplayPath(hostRoot: string, mountRoot: string, selectedPath: string): string {
  const relativePath = posix.relative(posix.resolve('/', mountRoot), posix.resolve('/', selectedPath));
  const normalizedHostRoot = hostRoot.replace(/\/+$/, '') || '/';
  if (!relativePath) return normalizedHostRoot;
  return normalizedHostRoot === '/' ? `/${relativePath}` : `${normalizedHostRoot}/${relativePath}`;
}
