/*  Carga en Patio — service worker
    ---------------------------------------------------------------
    Está por dos razones: para que Chrome ofrezca instalar la app, y
    para que abra aunque el patio quede sin señal.

    LA DECISIÓN IMPORTANTE: LA PÁGINA VA SIEMPRE A LA RED PRIMERO.
    Lo normal en un service worker es servir de caché y actualizar
    después. Aquí no. Ya perdimos horas con versiones viejas pegadas
    en el celular, y un service worker que cachee el HTML convierte
    ese problema en permanente: el auxiliar se queda con una versión
    de hace semanas y no hay Ctrl+Shift+R que valga. Así que el HTML
    se pide a la red y la copia guardada solo entra si no hay señal.

    LO QUE SÍ SE GUARDA DE UNA VEZ es el motor de lectura de rótulos
    (Tesseract, varios MB) y los íconos: no cambian, y bajarlos con
    los datos del celular cada mañana no tiene sentido.

    LO QUE NUNCA SE GUARDA son las respuestas del Apps Script. Las
    programaciones cambian durante el día: mostrar uno viejo haría
    que el patio cargue un camión con la lista equivocada. Y esas
    peticiones llevan la clave dentro, que no debe quedar escrita.
*/

const VERSION = 'patio-v1';
const BASICOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(BASICOS))
      // si un archivo falta, la instalación NO se cae: la app sigue
      // funcionando online, solo pierde el arranque sin señal
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ns => Promise.all(ns.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Datos de la nube: nunca se tocan. Siempre a la red, sin guardar nada.
  if (url.hostname.indexOf('script.google') >= 0 ||
      url.hostname.indexOf('googleusercontent') >= 0) return;

  // La página: red primero, caché solo como red de emergencia.
  const esPagina = req.mode === 'navigate' ||
                   (req.destination === 'document') ||
                   url.pathname.endsWith('.html');
  if (esPagina) {
    ev.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(VERSION).then(c => c.put(req, copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Motor de lectura e íconos: de la caché si está, y si no se baja y se guarda.
  ev.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
        const copia = res.clone();
        caches.open(VERSION).then(c => c.put(req, copia)).catch(() => {});
      }
      return res;
    }))
  );
});
