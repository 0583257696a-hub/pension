import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  // Every academy page is rendered per request (session-dependent), so no incremental cache is needed.
  ...defineCloudflareConfig({}),
  // `npm run build` runs the OpenNext build (so Cloudflare Workers Builds produces the Worker bundle);
  // OpenNext itself must therefore call Next.js directly, not `npm run build`.
  buildCommand: "npx next build",
};
