# Sprint 5 QA — analítica y Finanzas

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **PASS — lecturas compartidas en frontend demo; agregado API pendiente**

## Contrato aplicado

- Owner y Finanzas usan `financialSummary` desde `src/api/repository.ts`; cargos y cobros se agregan en centavos enteros y se agrupan por sede.
- `cargos creados` usa `Charge.createdAt` en el intervalo local `[inicio, fin)`. `cobros recibidos` usa `Payment.paidAt`; la sede se obtiene del cargo asociado.
- `saldo vigente` es la deuda abierta del snapshot actual. No se suma como ingreso del periodo y permanece estable al cambiar el periodo.
- Las ventanas compartidas son 10–16, 10–12 y 13–16 de agosto de 2026. Las tarjetas por sede concilian con el total.
- La vista declara fuente, periodo y procedencia demo. Cada sede enlaza con Caja; no se presenta como agregado observado en API.

## Evidencia

- `npm run typecheck`: PASS (frontend y backend); `npm test -- --reporter=dot`: 112/112 PASS.
- La suite visual verifica el cruce Owner–Finanzas, periodo vacío, saldo vigente y móvil a 390 px; la última corrida global (17/17) pasó sin errores de página.
- El test visual compara Owner y Finanzas en el mismo escenario y verifica que las tres cifras coincidan. Cambia a la ventana inicial y confirma flujos cero con saldo actual sin cambios.
- Capturas: [1440 px](./sprint-5/screenshots/finanzas-1440.png) y [390 px](./sprint-5/screenshots/finanzas-390.png). No hay desbordamiento del documento en móvil.
- Prueba unitaria cubre conciliación general y por sede, ventana vacía y saldo vigente.

## Pendiente

La API todavía no ofrece la lectura agregada financiera ni listas filtradas de drill-down requeridas para datos reales. La vista sigue no disponible en modo API; no se descarga ni suma una lista parcial para aparentar analítica global. La aceptación formal de dominio y visual continúa pendiente con Miguel y Alejandro.
