# Conectar GitHub con Cloudflare

Esta conexión se hace una sola vez. Después, cada cambio enviado a la rama `main` de `Ebermed/hashtag-tv` se compila y publica automáticamente en `hashtagtv.hashtag-tv-mx.workers.dev`.

## Recursos existentes

- Worker: `hashtagtv`
- Base D1: `hashtag-tv-db`
- Binding D1: `DB`
- Bucket R2: `hashtag-tv-media`
- Binding R2: `BUCKET`

## Conexión del repositorio

1. En Cloudflare abre **Workers & Pages**.
2. Entra al Worker **hashtagtv**.
3. Abre **Settings** y después **Builds**.
4. Presiona **Connect**.
5. Elige **GitHub** y autoriza la aplicación oficial de Cloudflare.
6. Selecciona `Ebermed/hashtag-tv`.
7. Usa la rama de producción `main`.
8. Deja el directorio raíz en `/`.

## Comandos de compilación

Configura exactamente estos valores:

```text
Build command: npm run cloudflare:build
Deploy command: npm run cloudflare:deploy
```

Deja desactivados inicialmente los builds de ramas no productivas.

## Token de Builds

El token que use Cloudflare Builds necesita acceso a los tres recursos del proyecto:

- Workers Scripts: Edit
- D1: Edit
- Workers R2 Storage: Edit
- Account Settings: Read
- User Details: Read
- Memberships: Read

Restringe los recursos de cuenta únicamente a la cuenta de Hashtag TV. El token se guarda en Cloudflare, jamás dentro de GitHub.

## Secretos de ejecución

Estos secretos ya viven en el Worker y los despliegues normales no los eliminan:

- `CABINA_USERNAME`
- `CABINA_PASSWORD`
- `CABINA_SECONDARY_USERNAME`
- `CABINA_SECONDARY_PASSWORD`
- `CABINA_SESSION_SECRET`
- `YOUTUBE_DATA_API_KEY`, cuando se configure

## Comprobar la primera publicación

Después de guardar la conexión, realiza un nuevo push a `main` o usa **Retry build**. En **Deployments → View build history** deben completarse la compilación, las migraciones de D1 y el despliegue.

Prueba después:

- <https://hashtagtv.hashtag-tv-mx.workers.dev/>
- <https://hashtagtv.hashtag-tv-mx.workers.dev/cabina>

## Publicación manual de emergencia

En una computadora autenticada con Wrangler:

```powershell
npm.cmd install
npm.cmd run deploy:cloudflare
```

Los secretos permanecen guardados en Cloudflare.

## Estado

Conexión automática verificada y primer build solicitado el 27 de agosto de 2026.
