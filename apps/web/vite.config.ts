import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Public address used for absolute link-preview URLs in index.html (%VITE_SITE_URL%). Set VITE_SITE_URL when the domain changes.
process.env.VITE_SITE_URL ||= "https://deeznote.103-253-146-20.sslip.io";

/**
 * Production Content-Security-Policy as a <meta> tag (the dev server needs inline scripts and websockets, so
 * it's build-only). Inline scripts are allowed by hash; 'wasm-unsafe-eval' is for libsodium's WebAssembly;
 * inline styles are needed for style attributes (photo widths, editor). frame-ancestors and HSTS can't be
 * set from a meta tag: they belong in the web server's headers.
 */
function contentSecurityPolicy(): Plugin {
  let apiUrl = "/api";
  return {
    name: "deeznote-csp",
    apply: "build",
    configResolved(config) {
      apiUrl = config.env.VITE_API_URL ?? "/api";
    },
    transformIndexHtml(html) {
      const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map(([, body]) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`);
      const apiOrigin = /^https?:\/\//.test(apiUrl) ? ` ${new URL(apiUrl).origin}` : "";
      const policy = [
        "default-src 'self'",
        `script-src 'self' 'wasm-unsafe-eval' ${scriptHashes.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self'${apiOrigin}`,
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; ");
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  envDir: "../..",
  // The editor (Milkdown/Crepe) ships Vue components; set Vue's build flags so it doesn't warn on every load.
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  plugins: [
    tailwindcss(),
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "DeezNote",
        short_name: "DeezNote",
        description: "End-to-end encrypted Markdown notes",
        theme_color: "#11110f",
        background_color: "#f4f1e8",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
