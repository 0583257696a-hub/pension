import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every academy page is rendered per request (session-dependent), so no incremental cache is needed.
export default defineCloudflareConfig({});
