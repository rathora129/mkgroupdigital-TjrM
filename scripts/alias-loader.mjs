import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const srcRoot = pathToFileURL(`${path.join(projectRoot, 'src')}${path.sep}`).href;

// Production ESM loader for the background worker: resolves Next.js "@/"
// aliases and extensionless imports under src/ when running directly in Node.
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(
      new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href,
      context,
    );
  }

  if (specifier.startsWith('next/') && !path.extname(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }

  if (
    context.parentURL?.startsWith(srcRoot) &&
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !path.extname(specifier)
  ) {
    return nextResolve(`${specifier}.js`, context);
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.startsWith(srcRoot)) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
