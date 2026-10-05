# OdontoFlow Frontend QA · 2026-09-30

## Resultado

QA aprobado para el frontend demo B. La compilación de producción, los tests de lógica y los recorridos visuales pasan. Las capturas cubren 24 combinaciones autorizadas de rol y vista en 1440, 1280, 390 y 375 px (96 imágenes), sin fallos de ruta, desbordes horizontales ni errores de página.

## Verificaciones

- `npm test`: 121 tests aprobados.
- `npm run typecheck`: TypeScript de frontend y backend aprobado.
- `NEXT_PUBLIC_USE_MOCKS=true next build --webpack`: compilación aprobada.
- `npm run test:visual`: 20 recorridos aprobados; cero errores de página y cero escrituras de red.
- Matriz de vistas: 24 rutas/roles, cero fallos y cero desbordes móviles. Evidencia en [`view-matrix-final/`](./view-matrix-final/).
- Reprogramación: Carlos Rivas pasó del sábado 15 a las 09:00 a las 11:00.
- Cancelación: la cita queda visible con estado Cancelada.
- Chat: mensaje local añadido y restablecido; cero solicitudes de escritura.
- `git diff --check`: aprobado.

## Cambios comprobados en pantalla

- Inicio del Administrativo: CTA móvil en el flujo, jornada legible y tres gráficos con sus unidades.
- Pacientes y Solicitudes: filas convertidas en tarjetas móviles, con datos y acciones visibles.
- Registro clínico: nombre del paciente destacado para que el Doctor identifique el encuentro.
- Roles y rutas: navegación autorizada verificada en Owner, Administrativo y Doctor.
- Ayuda contextual y movimiento reducido: sin errores de consola durante los recorridos.

## Límites de esta demo

Las acciones se verificaron en un navegador aislado con datos demo. No se enviaron mensajes por Telegram/WhatsApp ni se escribieron datos en un backend. La autenticación real, los permisos del servidor y las integraciones externas siguen dependiendo de sus contratos y credenciales.

El servidor del usuario en `127.0.0.1:5173` no se reinició ni modificó; la verificación se ejecutó en un build aislado sobre el puerto 5189.
