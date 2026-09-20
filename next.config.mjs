/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 14 requires this flag for instrumentation.ts (register()) to run at all —
  // it's only stable-by-default from Next.js 15 onward. Without it, 005's pg-boss
  // worker registration silently never happens in production/dev, only in tests (whose
  // globalSetup starts its own separate worker instance).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
