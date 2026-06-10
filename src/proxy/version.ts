/**
 * Package version, read from package.json at module load.
 *
 * Using `require()` keeps this simple under the project's CommonJS-first
 * tsconfig; tsup polyfills `require` in the ESM bundle output.
 */

declare const require: NodeRequire;

interface MinimalPackageJson {
  version: string;
  name: string;
}

const pkg = require('../../package.json') as MinimalPackageJson;

export const PACKAGE_VERSION: string = pkg.version;
export const PACKAGE_NAME: string = pkg.name;
