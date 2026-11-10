import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Pages replaced by fixed lesson assignments (spec §11). Old links keep working.
  async redirects() {
    return [
      { source: "/academy/practice", destination: "/academy/assignments", permanent: false },
      { source: "/academy/practice/:slug", destination: "/academy/lesson/:slug", permanent: false },
      { source: "/academy/exams", destination: "/academy/assignments", permanent: false },
      { source: "/academy/quiz/:id", destination: "/academy/assignments", permanent: false },
    ];
  },
};

export default nextConfig;
