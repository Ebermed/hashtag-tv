# Hashtag TV

Televisora musical web con canales lineales, programación continua, cabina de operación y entradas en vivo.

## Producción

- Señal pública: <https://hashtagtv.hashtag-tv-mx.workers.dev/>
- Cabina: <https://hashtagtv.hashtag-tv-mx.workers.dev/cabina>
- Worker: `hashtagtv`
- Base D1: `hashtag-tv-db`, binding `DB`
- Bucket R2: `hashtag-tv-media`, binding `BUCKET`

## Desarrollo local

Requiere Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Validación completa:

```bash
npm test
npm run lint
```

## Despliegue automático desde GitHub

Cloudflare Workers Builds debe conectarse al repositorio `Ebermed/hashtag-tv` y escuchar la rama `main`.

Configuración de Builds:

- Production branch: `main`
- Root directory: `/`
- Build command: `npm run cloudflare:build`
- Deploy command: `npm run cloudflare:deploy`
- Non-production branch builds: desactivado inicialmente

El token seleccionado para Builds necesita permisos de edición para Workers Scripts, D1 y R2. El despliegue localiza `hashtag-tv-db`, aplica migraciones pendientes y publica el Worker `hashtagtv` conservando las variables configuradas en el panel.

Las contraseñas de cabina, la llave de sesiones y la llave de YouTube son secretos de ejecución de Cloudflare. Nunca deben guardarse en este repositorio.

## Despliegue manual de emergencia

Con Wrangler autenticado en la cuenta correcta:

```bash
npm run deploy:cloudflare
```

Consulta [GUIA_PUBLICACION_CLOUDFLARE.md](./GUIA_PUBLICACION_CLOUDFLARE.md) para la conexión inicial y recuperación manual.
