/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Service Workerを使用するために必要
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;