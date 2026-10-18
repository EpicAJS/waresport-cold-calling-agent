/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (ignored by Vercel).
  output: "standalone",
  images: {
    domains: ["www.waresport.com"],
  },
};

module.exports = nextConfig;
