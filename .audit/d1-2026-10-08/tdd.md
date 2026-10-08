# D1 · evidencia TDD · 2026-10-08

Prueba de la pantalla real y su adapter, con axios simulado en el transporte:
`npm test -- test/patients-page.test.tsx`.

Primera ejecución, antes del cambio de producto: exit **1**, **1 failed (1)**.
Salida original conservada en `red.log` (ignorado por git):

```text
AssertionError: expected [ '1284Pacientes registrados', …(2) ] to deeply equal [ '40Pacientes registrados' ]
- Expected
+ Received
  [
-   "40Pacientes registrados",
+   "1284Pacientes registrados",
+   "37Nuevos este mes",
+   "16Leads por contactar",
  ]
Test Files  1 failed (1)
     Tests  1 failed (1)
```

Cambio mínimo: contar la lista recibida, retirar KPIs sin datos y sustituir
los controles decorativos por la vista completa y el total recibido.
Segunda ejecución: exit **0**, **1 passed (1)**.

Cobertura adicional de búsqueda (1/40 y 0/40), lista vacía (0/0) y modo mock
(6/6 desde mockData): exit **0**, **4 passed (4)**; salida en `green.log`.
Los tests renderizan PatientsPage y sus componentes reales con React 18.3.1;
react-test-renderer y sus tipos son dependencias sólo de desarrollo.
