# Sprint 8 QA — conteo de inventario y borrador de voz

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **Conteo escrito, Telegram demo y borrador de voz en modo demo: QA PASS; Telegram real y escritura API: BLOCKED**

## Implementado en alcance demo

- Inventario ofrece un flujo de conteo escrito manual. Acepta un nombre exacto de producto y una única cantidad; normaliza mayúsculas, tildes y espacios. Una unidad escrita debe coincidir con la del producto. Nombres no reconocidos, datos inválidos o nombres duplicados no se interpretan silenciosamente.
- Los errores conservan el texto original para corregirlo. El usuario puede editar la cifra y escoger la sede antes de revisar.
- La revisión muestra producto, cantidad interpretada, sede, saldo actual, diferencia y motivo requerido. La confirmación llama al comando de ajuste del ledger demo existente; el Kardex deja el movimiento por sede.
- La acción de confirmar está deshabilitada en modo API. No se escriben movimientos reales por este flujo.
- Ayuda contextual prepara para Inventario un borrador con formato compatible (`Producto: cantidad unidad`) y no ejecuta la mutación.
- La captura de voz es optativa y queda desactivada por defecto. Para activarla hacen falta `NEXT_PUBLIC_ENABLE_VOICE_DRAFTS=true` y modo demo (`NEXT_PUBLIC_USE_MOCKS=true`). Conserva intacto el gate del asistente de voz existente.
- El borrador envía el audio a `POST /audio` del servicio local y lee exclusivamente `transcripcion.texto`; descarta `mensajes`, adjuntos, códigos y cantidades del catálogo sintético. El texto resultante sigue editable y no se interpreta hasta que el usuario pulsa **Interpretar texto**. El ajuste requiere su confirmación explícita.
- El flujo escrito sigue disponible sin habilitar voz y no llama al servicio de voz. La transcripción solo está habilitada en modo demo; no produce llamadas al ERP ni cambios de stock.
- Telegram queda representado como canal demo dentro del mismo flujo de conteo: un mensaje recibido rellena el texto editable, fija la sede del borrador y exige interpretar, revisar diferencia y confirmar. Repetir el mismo mensaje no duplica movimientos. No se envían ni reciben mensajes reales.

## No conectado / bloqueado

- El servicio local `odontoflow-voice` no estaba levantado. La suite de interfaz sustituyó `POST /audio` por una respuesta con formato contractual que incluía una fila sintética conflictiva (`VOICE-SYNTH-999`, 999 unidades); comprobó que solo se mostraba el texto reconocido y que el saldo de 180 cajas no cambiaba. También simuló servicio caído, permiso del micrófono denegado y audio vacío. Esto valida el cliente y su manejo de errores, no la integración con una instancia viva ni un micrófono físico.
- Telegram real no se integró ni se enviaron mensajes. Aún hacen falta token, identidad de actor/sede, despliegue/allowlist y E2E con deduplicación.
- La confirmación humana real e idempotencia contra backend siguen pendientes de contrato, identidad y QA de C. No se declara terminado Sprint 8 completo ni producto conectado.

## Ajuste móvil de Chat

- En 390 px, Conversaciones prioriza el hilo; Contactos y Ficha se abren desde controles compactos. Búsqueda, filtros, selección, ficha, navegación a Agenda y creación de citas siguen disponibles.
- La conversación incluye tres mensajes de muestra por ID del snapshot. Los mensajes escritos quedan en estado local y **Restablecer** restaura la muestra. La etiqueta **Demo** deja claro que no se envía por WhatsApp ni por otro canal externo.
- Se redujo el texto repetido en móvil y se conservaron los datos y acciones compartidos con Agenda; el servicio, la sede y el profesional de una cita creada deben formar una combinación presente en el snapshot.
- Capturas: [Chat móvil enfocado](./sprint-8/screenshots/chat-focus-390.png) y [Chat desktop](./sprint-7/screenshots/chat-1440.png).

## QA

- `npm run typecheck`: PASS (frontend y backend).
- `npm test -- --reporter=dot`: 117/117 pruebas en 14 archivos; incluye cinco casos de la ruta aislada de voz y cuatro del parser estricto.
- Verificación focalizada de Telegram demo en navegador: PASS en escritorio y 390 px. Carga mensaje de Lince, interpreta `Guantes de nitrilo: 176 cajas`, muestra saldo 180, diferencia -4 y no hay overflow móvil.
- Suite visual amplia posterior: 17/17 recorridos PASS, cero errores de página.
- Verificación focalizada de Chat en navegador: PASS en escritorio y 390 px. Incluye hilo por ID, envío y reset locales sin solicitudes no-lectura, defaults de Ana (Blanqueamiento, Lince y Valeria), y apertura de la cita de las 15:30 en Agenda e Inicio. Sin overflow horizontal a 390 px.
- Capturas: [conteo escrito desktop](./sprint-8/screenshots/inventory-count-review-1440.png), [conteo escrito móvil](./sprint-8/screenshots/inventory-count-review-390.png), [Telegram demo desktop](./sprint-8/screenshots/inventory-telegram-review-1440.png), [Telegram demo móvil](./sprint-8/screenshots/inventory-telegram-review-390.png), [voz desktop](./sprint-8/screenshots/inventory-voice-review-1440.png), [voz móvil](./sprint-8/screenshots/inventory-voice-review-390.png) y [Kardex móvil](./sprint-8/screenshots/inventory-count-kardex-390.png).

## Alcance del bloque

- **Actores/rutas:** Owner y Administrativo en `/inventario`; respeta las sedes disponibles para el actor del escenario demo.
- **Entidades/comando:** Producto, balance y movimiento; usa `moveStock` con `kind: "adjustment"` y motivo, sin crear otra libreta de inventario.
- **Archivos:** parser y pruebas unitarias; vista de Inventario; cliente aislado `src/voice-draft.ts` y gate separado; vista de Chat y estilos móviles; recorridos y capturas visuales.
- **Ownership:** el conteo escrito usa el ledger demo existente; la voz solo rellena texto; Chat móvil mantiene el flujo de citas compartidas de Sprint 7. Consulta también [Sprint 7 QA](./sprint-7.md).
- **Estados:** texto vacío/inválido con borrador preservado, producto detectado, origen Telegram demo, balance al cambiar sede, diferencia cero, confirmación y acción deshabilitada en API.

## Archivos principales

- `src/inventory-count.ts` y `test/inventory-count.test.ts`: interpretación estricta del texto.
- `src/views/InventoryPage.tsx`: revisión, selección de sede y confirmación mock del ajuste.
- `src/components/ContextualHelpDock.tsx`: borrador de conteo editable.
- `scripts/visual-check.mjs`: QA visual y recorrido en navegador.
