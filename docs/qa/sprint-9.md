# Sprint 9 QA — sesión real, permisos y entrega

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **C BLOCKED; B demo pendiente de aceptación visual/de dominio**

## Hallazgos

- El selector de rol actual es local al frontend demo y no acredita identidad humana ni permisos del servidor.
- El contrato generado y el cliente incluidos no exponen una sesión humana de navegador ni credenciales de actor para enlazar los comandos.
- El repositorio backend esperado no está disponible en este workspace para inspeccionar/ejecutar su contrato. No se corrieron E2E conectadas ni negativas 401/403.
- No se cambió la identidad a `system`, no se añadieron credenciales al browser y no se afirma que las rutas API estén autorizadas.

## Criterio de salida

C requiere un contrato de sesión humana, permisos aplicados por backend, aislamiento verificado por sede/profesional y E2E sin fixtures. Esos insumos y servicios no están disponibles; C permanece BLOCKED. El recorrido Chat→Agenda→Inicio ya no depende del manifiesto de Leo para avanzar en este checkout y está descrito en [Sprint 7 QA](./sprint-7.md); no se afirma haber revisado codigo ausente de Leo. B ya tiene borradores demo de voz y Telegram en Inventario; sigue pendiente por las revisiones finales de dominio y aprobación visual de Alejandro/Miguel.

## QA del frontend demo vigente

- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: 117/117 pruebas.
- Suite de navegador: 17/17 recorridos PASS tras el ajuste final de Chat/Telegram, cero errores de página.
- Estas pruebas no sustituyen sesión humana, auditoría de permisos o E2E con backend real.
