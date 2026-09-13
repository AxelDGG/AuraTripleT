// Cabeceras de seguridad y CORS.

// CORS abierto: la app móvil (Expo en dispositivo/emulador y expo web) y el
// widget consumen esta API desde otro origen.
export function corsForClients(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "script-src 'self' https://elevenlabs.io https://cdn.elevenlabs.io; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https://*.elevenlabs.io; " +
  "connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io; " +
  "media-src 'self' blob: https://api.elevenlabs.io; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
}
