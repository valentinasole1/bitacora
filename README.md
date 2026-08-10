# Sitio personal + 📖 Bitácora

Sitio personal minimalista: página blanca (`index.html`) con los títulos de las secciones
en negro, apilados uno arriba del otro — Sobre mí, Curriculum, Redes, Bitácora y Juego —
y cada título se despliega hacia abajo como acordeón. La bitácora de lecturas vive en
`bitacora.html`, embebida en su sección.

## Cómo usarla

```sh
cd book-review-logger
python3 -m http.server 4173
# abrir http://localhost:4173
```

(También funciona abriendo `index.html` directo en el navegador.)

## Navegación

Los títulos se abren con click, o **paseando el bicho 🐞** (flechas del teclado o WASD)
hasta pisar un título. En celular el bicho se esconde y queda el tap.

## Secciones

La página principal está en inglés; la app de la bitácora sigue en español.

- **About me** — nota de papel rasgado + polaroid (falta foto, rol y ciudad).
- **Resume** — placeholder, en construcción.
- **Socials** — Instagram y LinkedIn con links reales; falta el usuario de GitHub.
- **Reading log** — la app de reseñas de libros (abajo el detalle).
- **Game** — placeholder, juego a definir.

## Qué hace la bitácora

- **Cartelera (el juego 🎮)** — la pantalla principal:
  - **Meta anual** editable (✎) con barra de progreso y ritmo ("2 libros por delante del ritmo").
  - **Niveles y XP** — +100 XP por libro terminado, +25 por reseña, +10 por publicarla afuera. De *Lector novato* a *Leyenda literaria*.
  - **Racha** 🔥 de meses consecutivos leyendo.
  - Estantes: **Leyendo ahora** (con botón "Lo terminé 🎉"), **Próximos a leer** y **Leídos este año** (grilla de tapas).
  - **9 logros** desbloqueables con confeti (Primera página, Maratonista, Meta cumplida, En llamas…).
- Cada libro se marca como **📌 Próximo / 📖 Leyendo / ✅ Leído** desde su página de detalle. Escribir una reseña lo marca leído automáticamente.
- **Buscador universal** — busca por título, autor o ISBN contra el catálogo de [Open Library](https://openlibrary.org) (millones de libros, sin API key).
- **Reseñas del libro** — histograma de puntuaciones de Open Library, rating de Google Books, y links directos a las reseñas en Goodreads, The StoryGraph, Amazon y LibraryThing.
- **Tus reseñas** — puntuación con estrellas + texto, guardadas en `localStorage` (no necesita cuenta ni servidor).
- **Publicar en otras páginas** — un click copia tu reseña al portapapeles y abre la página exacta del libro en Goodreads, The StoryGraph o Amazon (en Amazon abre directamente el formulario de reseña). Solo queda pegar. Ningún sitio de reseñas ofrece API pública de escritura, así que este es el flujo más directo posible.
- **Exportar** — descargá todas tus reseñas como JSON o copialas como Markdown.

## Stack

HTML + CSS + JavaScript vanilla. Sin dependencias, sin build. Modo claro/oscuro automático.
