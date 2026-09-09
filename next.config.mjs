/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        // El "dashboard" tradicional se reemplazo por el Tablero Ejecutivo.
        source: '/dashboard',
        destination: '/executive-board',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
