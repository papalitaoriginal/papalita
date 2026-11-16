import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const layouts = {
  customer: {
    required: ['index.html', 'admin.html', 'store.html', 'manifest.webmanifest', 'sw.js', 'js/app.js'],
    optional: [
      'rider.html', 'rider.webmanifest', 'rider-sw.js', 'offline.html',
      'privacy.html', 'terms.html', 'delete-account.html', 'account-deletion.html',
      'customer-auth.css', 'customer-polish.css', 'merchant-wharf-theme.css', 'store-subscriptions.css',
      'js/customer-data.js', 'js/customer-install.js', 'js/customer-legal.js', 'js/customer-motion.js',
      'js/dropoff-payments.js', 'js/live-delivery-map.js', 'js/notifications.js', 'js/order-status.js',
      'js/partner-admin.js', 'js/product-options.js', 'js/store-subscriptions.js', 'js/supabase.js'
    ]
  },
  rider: {
    required: ['index.html', 'rider.webmanifest', 'rider-sw.js', 'js/rider-install.js'],
    optional: ['rider-trip.css', 'js/rider-trip.js', 'js/rider-trip-map.js']
  }
};
const mode = process.argv[2];
if (mode !== 'customer' && mode !== 'rider') throw new Error('Run node cloudflare-build.mjs customer or node cloudflare-build.mjs rider.');

const root = process.cwd();
const output = resolve(root, 'cloudflare-dist');
const layout = layouts[mode];
const required = [...layout.required, 'js/config.js', 'styles.css'];
const optional = [
  ...layout.optional, '404.html', '_headers', '_redirects',
  'js/data.js', 'js/images.js', 'js/live-delivery-rider.js', 'js/ops.js',
  'js/rider-install.js', 'js/rider-road-map.js'
];
const mediaExtensions = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.png', '.svg', '.webm', '.webp', '.woff', '.woff2'
]);
const selected = new Set();

function include(relativePath, requiredFile = false) {
  const stat = lstatSync(join(root, relativePath), { throwIfNoEntry: false });
  if (!stat && !requiredFile) return;
  if (!stat?.isFile()) throw new Error('Expected a regular file: ' + relativePath);
  if (stat.size > 25 * 1024 * 1024) throw new Error('File exceeds the 25 MiB Pages limit: ' + relativePath);
  selected.add(relativePath);
}

function includeMedia(directory) {
  const stat = lstatSync(join(root, directory), { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return;
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = directory + '/' + entry.name;
    if (entry.isDirectory()) includeMedia(relativePath);
    if (entry.isFile() && mediaExtensions.has(extname(entry.name).toLowerCase())) include(relativePath);
  }
}

for (const name of required) include(name, true);
for (const name of optional) include(name);
for (const directory of ['images', 'icons', 'fonts', 'assets']) includeMedia(directory);

const manifestName = mode === 'customer' ? 'manifest.webmanifest' : 'rider.webmanifest';
const manifest = JSON.parse(readFileSync(join(root, manifestName), 'utf8'));
for (const icon of manifest.icons || []) {
  const iconUrl = new URL(icon.src, 'https://build.invalid/' + manifestName);
  if (iconUrl.origin === 'https://build.invalid' && !selected.has(decodeURIComponent(iconUrl.pathname.slice(1)))) {
    throw new Error('The PWA icon is missing from the deployment: ' + icon.src);
  }
}

// Refuse to serve the customer HTML in place of a missing service worker or asset.
const notFound = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found · Papalita</title><main><h1>Page not found</h1><p><a href="/">Open Papalita</a></p></main></html>';

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of selected) {
  const destination = join(output, name);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, name), destination);
}
if (!selected.has('404.html')) writeFileSync(join(output, '404.html'), notFound);
console.log('Prepared Papalita ' + mode + ' in cloudflare-dist with ' + readdirSync(output, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length + ' public files.');
