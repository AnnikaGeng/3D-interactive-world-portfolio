/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  devIndicators: false,
  // Keep production validation independent from the running development preview.
  distDir: process.env.ASCENT_BUILD_DIR || '.next',
};
