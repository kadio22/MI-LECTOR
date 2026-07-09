# Archivo — Biblioteca personal (PWA)

App instalable para guardar y leer PDF, ePub, Word (.docx) y .txt **sin conexión**, con icono en la pantalla de inicio.

## Qué incluye
- `index.html`, `app.js`, `sw.js`, `manifest.json`, `icons/` — la app completa.
- Almacenamiento con **IndexedDB** (los archivos quedan en el propio dispositivo, no se suben a ningún servidor).
- Visores integrados: PDF (pdf.js, renderizado por páginas), Word (mammoth.js → HTML), ePub (JSZip, capítulo a capítulo), y texto plano.

## Por qué no puedo instalarla directamente desde este chat
Un icono real en pantalla de inicio requiere que el **service worker** y el **manifest** se sirvan por **HTTPS** desde un dominio propio. Un artifact de Claude vive dentro de un iframe de claude.ai y el navegador no permite registrar un service worker ahí — es una restricción del navegador, no de Claude. Por eso te entrego el código listo para publicar tú mismo, igual que hiciste con "Ver Luego Pro".

## Cómo publicarla (gratis, 5 minutos) — GitHub Pages
1. Crea un repositorio nuevo en GitHub (puede ser privado o público).
2. Sube estos archivos manteniendo la estructura de carpetas (`icons/` incluida).
3. Ve a **Settings → Pages**, selecciona la rama `main` y carpeta `/root`. Guarda.
4. GitHub te dará una URL tipo `https://tuusuario.github.io/tu-repo/`.
5. Abre esa URL desde el navegador de tu móvil.
6. Android (Chrome): menú ⋮ → "Añadir a pantalla de inicio" / "Instalar app".
   iPhone (Safari): botón compartir → "Añadir a pantalla de inicio".

Alternativas igual de válidas: Netlify Drop (arrastrar la carpeta en netlify.com/drop) o Vercel — ambas gratuitas y sin configuración de servidor.

## Límites a tener en cuenta
- Los datos viven en el IndexedDB del navegador de ese dispositivo: si borras datos del navegador o desinstalas la app, se pierden. No hay sincronización entre dispositivos (se podría añadir después, p. ej. con un backend propio o Google Drive).
- Tamaño de archivo: no hay límite impuesto por la app, pero libros muy grandes (PDF de cientos de MB) pueden ir lentos en un móvil.
- El ePub se muestra capítulo a capítulo sin paginación tipo Kindle (sin control de tamaño de letra en esta versión) — funcional para lectura, no reemplaza un lector ePub dedicado.
- `.doc` antiguo (binario, no `.docx`) no está soportado por mammoth.js; si tienes archivos `.doc` viejos, conviértelos a `.docx` primero.

## Novedades de esta versión
- **Corregido el botón “+”**: antes disparaba `input.click()` por JavaScript, lo cual algunos navegadores/PWAs instaladas bloquean silenciosamente (no pasa nada, sin error visible). Ahora el botón es una etiqueta (`<label>`) nativamente asociada al input de archivo, que siempre abre el selector.
- **Carpetas**: barra superior con "Todas", tus carpetas, "Sin carpeta" y "+ Carpeta". Al añadir archivos estando dentro de una carpeta, se guardan ahí directamente. Cada libro tiene un botón 📁 para moverlo a otra carpeta en cualquier momento. Eliminar una carpeta no borra sus documentos, los deja en "Sin carpeta".

## Si "no añade archivos" y no da ningún error visible
Casi siempre es una de estas dos causas:

1. **La estás abriendo con doble clic (`file:///...`) en vez de por internet.**
   El navegador bloquea el almacenamiento local (IndexedDB) cuando la página se abre como archivo suelto, así que el selector de archivos se abre, eliges el PDF, pero nunca se guarda ni aparece error — simplemente no pasa nada. **La app tiene que servirse por `https://` (GitHub Pages, Netlify) o al menos por `http://localhost` durante pruebas.** Esta versión ya detecta este caso y te muestra un aviso abajo en pantalla si ocurre.
2. **El navegador bloqueó la ventana emergente del selector de archivos.**
   Pasa si el botón "+" no está directamente en la ruta del toque (por ejemplo, dentro de un iframe con permisos restringidos, como el propio chat de Claude). Instalada de forma normal en el móvil (fuera del chat), no debería ocurrir.

Si tras hospedarla en HTTPS sigue sin funcionar, dime en qué navegador y dispositivo la estás probando (por ejemplo: Chrome Android, Safari iPhone) para poder reproducir el fallo exacto.

## Si ya habías instalado la versión anterior
Como la app funciona offline con caché, el teléfono puede seguir sirviendo los archivos viejos. Para forzar la actualización:
1. Vuelve a subir estos archivos nuevos a tu repositorio/hosting (sobrescribiendo los anteriores).
2. Abre la app, cierra completamente y vuelve a abrirla (o borra la app de la pantalla de inicio y reinstálala si no se actualiza a la primera). El `sw.js` incluido ya tiene la versión de caché subida para forzar la renovación automáticamente en la mayoría de casos.

## Próximas mejoras posibles (si las quieres)
- Ajuste de tamaño de fuente y modo noche en el lector.
- Subcarpetas o etiquetas múltiples por documento.
- Sincronización con Google Drive para tener la biblioteca en varios dispositivos.
