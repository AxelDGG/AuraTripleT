// Cabeceras de seguridad y CORS.

// CORS abierto: la app móvil (Expo en dispositivo/emulador y expo web) y el
// widget consumen esta API desde otro origen.
export function corsForClients(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Authorization viaja en toda petición con sesión: sin él en esta lista el
  // preflight de la app móvil y del widget falla antes de salir.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "script-src 'self' https://elevenlabs.io https://cdn.elevenlabs.io blob: data:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https://*.elevenlabs.io https://storage.googleapis.com; " +
  "connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io https://api.us.elevenlabs.io wss://api.us.elevenlabs.io wss://livekit.rtc.elevenlabs.io; " +
  "media-src 'self' blob: https://api.elevenlabs.io; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
}
