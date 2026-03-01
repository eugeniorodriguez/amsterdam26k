# Que ver en Amsterdam en 3 dias (web estatica)

Web estatica para GitHub Pages, sin build y sin backend.
Stack: `HTML + CSS + JavaScript vanilla`.

## Archivos

- `index.html`: estructura UI (tabs, itinerario, mapa, checklist, opciones)
- `styles.css`: tema visual, responsive, dark mode, impresion
- `data.js`: dataset de POIs + itinerario por defecto + checklist
- `app.js`: logica completa (estado, localStorage, mapa, filtros, drag&drop, export/import)
- `manifest.json`: metadata para instalacion PWA
- `sw.js`: cache de app shell para uso offline basico
- `icons/icon-192.svg` y `icons/icon-512.svg`: iconos PWA placeholder

## Publicar en GitHub Pages

1. Sube estos archivos a un repositorio (rama `main` o `master`).
2. Ve a `Settings` -> `Pages`.
3. En `Build and deployment`, elige:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` (o la rama que uses)
   - `Folder`: `/ (root)`
4. Guarda y espera la URL publicada.

## Personalizar el viaje en `data.js`

### Hotel y vuelos reales

- `window.HOTEL_REFERENCE`: define hotel base (direccion, telefonos, check-in/out, lat/lng).
- `window.TRAVEL_LOGISTICS`: define vuelos de ida/vuelta y notas operativas.
- El hotel se pinta siempre como referencia fija en el mapa, aunque cambies filtros.

### Editar POIs
Cada lugar esta en `window.POIS` y usa este formato:

```js
{
  id: "id-unico",
  nombre: "Nombre del lugar",
  descripcion_corta: "Resumen corto",
  categoria: "museo",
  tags: ["tag1", "tag2"],
  barrio: "Zona",
  direccion: "Direccion",
  enlace_oficial: "https://...",
  reserva_requerida: true,
  notas_reserva: "Notas",
  indoor: true,
  apto_lluvia: true,
  duracion_min: 90,
  coste_nivel: "€€",
  edad_recomendada: "12-18",
  lat: 52.37,
  lng: 4.89
}
```

### Editar itinerario por defecto
`window.DEFAULT_ITINERARY` define `day1/day2/day3` y bloques `morning/afternoon/night`.

Cada entrada usa:

```js
{ entryId: "d1m1", planA: "poi-sol", planB: "poi-lluvia" }
```

### Anadir nuevos POIs
1. Crea un nuevo objeto en `window.POIS` con `id` unico.
2. (Opcional) agrega su categoria a `window.CATEGORIES`.
3. Referencia ese `id` en `window.DEFAULT_ITINERARY` para usarlo en el plan.
4. Recarga la pagina; la app lo mostrara en mapa/lista/filtros.

## Persistencia local

La app guarda en `localStorage`:

- progreso de "hechas"
- favoritas
- orden del itinerario (drag&drop)
- filtros y busqueda
- checklist
- modo clima y dark mode
- hora de salida por dia

Tambien puedes compartir estado por `Exportar JSON` / `Importar JSON`.

## CDNs usados y por que

- [Leaflet](https://leafletjs.com/) por CDN: mapa interactivo sin API key obligatoria.
- [OpenStreetMap tiles](https://www.openstreetmap.org/): capa base gratuita para visualizacion.
- [SortableJS](https://sortablejs.github.io/Sortable/): drag&drop simple para reordenar paradas.

No hay React/Vite/Node ni build step.

## Limitaciones conocidas

- Los tiles del mapa requieren internet al menos en la primera carga.
- El modo offline (Service Worker) cachea la UI y archivos locales, pero no garantiza tiles OSM completos.
- Coordenadas en `data.js` son aproximadas en algunos casos.
- Horarios, tarifas y politicas de reserva pueden cambiar: revisar siempre la web oficial.

## Accesibilidad y responsive

- Tabs con roles ARIA y navegacion sin recargar.
- Contraste alto y tipografia legible.
- Layout adaptativo: desktop con panel lista/mapa y movil en columna.
- Vista de impresion limpia con `window.print()`.
