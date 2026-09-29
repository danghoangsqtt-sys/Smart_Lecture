import helmet from 'helmet';

// SmartLecture is deliberately self-contained for offline/LAN deployments.
// Keep every executable/runtime asset local and do not upgrade plain HTTP LAN
// addresses to HTTPS because many classrooms do not terminate TLS locally.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: null,
    },
  },
});
