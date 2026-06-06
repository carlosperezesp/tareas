# La Lista

App personal de tareas, notas y compra con sincronizacion en Postgres y planificacion en Google Calendar.

## Variables necesarias

```env
DATABASE_URL=
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_TIME_ZONE=Europe/Amsterdam
```

Puedes generar `AUTH_SECRET` con:

```bash
openssl rand -base64 32
```

Puedes generar `CRON_SECRET` igual:

```bash
openssl rand -base64 32
```

En Vercel, `NEXT_PUBLIC_APP_URL` debe ser la URL final de produccion, por ejemplo:

```env
NEXT_PUBLIC_APP_URL=https://la-lista.vercel.app
```

## Google Cloud

1. Crea un proyecto en Google Cloud.
2. Activa Google Calendar API.
3. Configura OAuth consent screen.
4. Crea un OAuth Client de tipo Web.
5. Anade estos redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://TU-DOMINIO.vercel.app/api/auth/callback/google`

Scopes usados:

```txt
openid
email
profile
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.events
```

## Datos

La app crea las tablas automaticamente la primera vez que se abre con `DATABASE_URL` configurado.

## Deploy en Vercel

1. Crea/importa el proyecto en Vercel desde este directorio o desde un repo Git.
2. Anade Neon Postgres desde Vercel Marketplace y copia `DATABASE_URL` a las variables del proyecto.
3. Anade las variables de Google y `AUTH_SECRET`.
4. Anade `CRON_SECRET` para proteger la tarea programada.
5. Actualiza `NEXT_PUBLIC_APP_URL` con la URL final de Vercel.
6. En Google Cloud, anade tambien el redirect URI final:

```txt
https://TU-DOMINIO.vercel.app/api/auth/callback/google
```

Comandos locales, cuando tengas Vercel CLI:

```bash
npm install
npm run build
vercel deploy --prod
```

## Planificacion automatica

Vercel ejecuta `/api/cron/plan-google` los lunes y viernes a `01:00 UTC`, que equivale a `03:00` en Amsterdam durante horario de verano. Vercel Cron usa UTC.

El boton manual `Plan Google` sigue funcionando igual.
