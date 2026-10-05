# Sprint 4 QA — Caja e Inventario operativo

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **PASS — flujos frontend demo; modo API real no verificado**

## Entregado y verificado

- Caja calcula pagos y saldo en centavos, acepta abonos parciales, rechaza sobrepagos, permite completar el saldo y deduplica reintentos con la misma clave de idempotencia.
- La UI API conserva la clave al reintentar el mismo pago; si cambia el monto o medio de pago crea una clave para la nueva intención. En Caja, Owner solo puede consultar pagos; el harness verifica que no vea `Cobrar`.
- El cargo demo nace cuando se completa un servicio; el servicio no se duplica al repetir el comando y cada pago adicional conserva su propio registro.
- Inventario muestra balance por sede y ledger de movimientos. Ajuste requiere motivo, rechaza cantidades que dejarían saldo negativo y no presenta mínimos de stock inventados.
- Las transferencias actualizan ambos balances y crean movimientos de salida/entrada enlazados por un mismo ID. El harness confirma saldo 180→170 en Lince, 60→70 en Jesús María, y el Kardex de cada sede.
- Los formularios API de pago, entrada, ajuste, transferencia y producto usan clave de idempotencia estable mientras se reintenta la misma intención. La sede de destino se excluye del selector de origen.

## QA ejecutada

- `npm run typecheck`: PASS (frontend y backend).
- `npm test -- --reporter=dot`: 112/112 PASS, incluidas parcial + segundo pago, sobrepago, reintento deduplicado, motivo de ajuste, protección contra saldo negativo y doble Kardex.
- `VISUAL_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:visual`: última corrida 17/17 recorridos PASS, cero errores de página. Caja se revisa por rol y el flujo transferir/ver Kardex se completa en navegador.
- Capturas de Caja e Inventario a 1440/1280/390/375 px, más ambos Kardex, en [`screenshots/`](./sprint-4/screenshots/). Las tablas conservan desplazamiento horizontal local en móvil sin ensanchar el documento.

## Límite

La cobertura acredita las reglas de negocio del demo y la presentación de la UI. No se probaron respuestas reales del backend, autorizaciones de servidor ni fallos de red con una sesión humana; esos requisitos siguen fuera de la evidencia de este sprint y no equivalen a producción.
