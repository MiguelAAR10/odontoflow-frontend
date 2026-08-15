# Ejecutar la demo end-to-end desde cero

## 1. Base aislada

Levanta PostgreSQL local:

```bash
docker compose up -d db
```

Aplica las migraciones y seeds en orden:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_initial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_simulated_channels.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/003_end_to_end_followup.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/001_simulated.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/002_end_to_end_demo.sql
```

Todos los pacientes, teléfonos, sedes, doctores y citas son ficticios.

## 2. Compilar y verificar

```bash
npm install
npm run typecheck
npm test
npm run build
```

## 3. Iniciar

```bash
npm start
```

Abre `http://127.0.0.1:3000`.

## 4. Demo obligatoria

Pulsa **Ejecutar demo Ana**. El sistema:

1. Restablece solo la sesión ficticia de Ana a lunes 08:55.
2. Genera WhatsApp a las 09:00.
3. Genera llamadas a las 12:00 y 16:00.
4. Marca la llamada de 16:00 como `ANSWERED_CONFIRMED`.
5. Conserva `appointment_status=CONFIRMED` y `followup_status=CONFIRMED`.
6. Genera `SAME_DAY_09AM` y `ONE_HOUR_BEFORE` el martes.
7. Muestra métricas, historial operativo, resumen, bandeja y cola sin duplicados.

La demo no abre conexiones hacia Google, Meta, WhatsApp ni proveedores de llamadas.
