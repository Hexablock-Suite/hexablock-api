// Hook for running the TypeScript sources of this repository with plain
// Node: `node --experimental-strip-types --import <this file> <script>`.
// The sources import each other with '.js' specifiers (the NodeNext form
// of the compiled files), so this hook rewrites a relative '.js' specifier
// to the '.ts' file that sits next to it, when that file exists. Bare
// package specifiers resolve as always. Test code only: the app itself
// runs from the compiled files of dist/.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.endsWith('.js') && context.parentURL !== undefined) {
        const candidate = new URL(specifier, context.parentURL);
        candidate.pathname = candidate.pathname.replace(/\.js$/, '.ts');
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      throw error;
    }
  },
});
