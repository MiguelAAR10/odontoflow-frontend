# Sprint 1 QA — sistema visual y pantallas maestras

**Fecha:** 27 de septiembre de 2026  
**Resultado:** **BLOCKED para aceptación formal; implementación demo continuó bajo la autorización autónoma de Alejandro**

## Entregado y verificado

- Inicio Administrativo con cola de jornada y acciones contextuales; Owner con lectura de cargos/cobros, matriz por sede, filtros, tabla accesible y detalle por origen.
- Capturas de ambas pantallas a 1440, 1280, 390 y 375 px. Los escenarios vacío, carga y error de Owner y Admin tienen capturas móviles en [`screenshots/`](./sprint-1/screenshots/).
- Suite visual global actual: 17/17 recorridos PASS, cero errores de página. `npm run typecheck` y 112 pruebas unitarias PASS; detalle en [Sprint 0 QA](./sprint-0.md).
- La referencia de A y B y sus límites están registrados en [`references.md`](./sprint-1/references.md). A es Aminova Clinic dashboard y B Aminova Operations view.
- Las pantallas maestras consumen el puerto público `src/api.ts`; la aplicación no importa directamente `src/domain`, `mockData` ni contratos privados fuera del módulo `src/api/`.

## Puertas formales pendientes

- **Validación de Miguel:** no recibida. La autorización de Alejandro permite seguir construyendo el frontend demo, pero no sustituye la aprobación de alcance/dominio de Miguel.
- **Aprobación visual de Alejandro:** pendiente; las capturas y la QA técnica no equivalen a un visto bueno escrito.
- **Referentes Godly:** la galería pública se comprobó, pero es de aplicaciones móviles generales. No acredita los seis referentes Godly requeridos ni reemplaza la curación formal del plan.
- **Ownership de Leo:** falta su manifiesto de archivos, base/commit y responsable de integración, y no se declara revisado ni integrado código suyo ausente del clon. La instrucción explícita de Alejandro permite continuar el flujo Chat/Agenda local sin esperar ese manifiesto; el recorrido ya migrado se documenta en [Sprint 7 QA](./sprint-7.md).
- **Addendum A70/B30 y ficha formal Hallmark:** no consta una aprobación firmada del addendum ni la ficha completa de Study/Audit exigida como cierre.

## Dictamen

Las dos pantallas maestras, su responsive y sus estados están implementados y pasaron QA técnica/visual. Sprint 1 continúa **BLOCKED para aceptación formal** por las puertas anteriores. La instrucción expresa de Alejandro autoriza avanzar en trabajo demo independiente mientras siguen pendientes; por eso Sprint 2 y los módulos posteriores pueden progresar sin presentar esas aprobaciones como recibidas.
