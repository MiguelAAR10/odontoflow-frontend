# Referencias visuales públicas

**Revisadas:** 27 de septiembre de 2026. Las páginas citadas abren sin iniciar sesión; las capturas de producto siguen siendo material del proveedor y no validan su funcionamiento.

| Referencia | Qué aporta | Decisión para OdontoFlow |
| --- | --- | --- |
| [Godly — App Screenshots](https://godly.design/apps/) | Galería pública de pantallas móviles iOS/Android; el catálogo incluye Agenda, Airtable y Asana. | Útil para contraste de jerarquía y acciones móviles. No es referente suficiente para un dashboard clínico desktop. |
| [Aminova — Clinic dashboard](https://aminova.health/screenshots) | Captura de clínica con citas del día y alertas operativas. | **Elegida para Administrativo:** mantener una cola de próximas citas y señales pequeñas; no trasladar métricas de protocolos que OdontoFlow no tiene. |
| [Aminova — Scheduling](https://aminova.health/screenshots) | Calendario de profesionales con cita explícita y conflictos de recursos. | Usar como contraste para la densidad de Agenda; no inventar recursos o conflictos si el backend no los ofrece. |
| [Aminova — Operations view](https://aminova.health/screenshots) | Lista de pacientes junto a resumen de actividad y cifras. | **Elegida para Owner:** conservar la lectura ejecutiva y separar series clínicas y financieras según sus fuentes. |
| [SHCA — Patient management SaaS case study](https://www.unlocklive.com/case-studies/shca) | Capturas públicas de roster, alertas, navegación por centro y registro de auditoría. | Contraste para filas operativas y alcance por sede; el caso es senior care, no odontología. |
| [Apple — Charts HIG](https://developer.apple.com/design/human-interface-guidelines/charts) | Reglas de legibilidad, comparación y accesibilidad para gráficos. | Aplicar a etiquetas, tabla alternativa, unidades y lectura de series; no tratarlo como referencia visual clínica. |

## Selección

- **A — Administrativo:** Aminova Clinic dashboard, por priorizar citas y alertas operativas en la primera lectura.
- **B — Owner:** Aminova Operations view, por combinar una vista ejecutiva con una lista de trabajo. La implementación de OdontoFlow separa cargos y cobros y marca el origen demo.

Godly se verificó como accesible sin login, pero su catálogo es de pantallas móviles de apps generales. No se considera evidencia de seis referencias clínicas desktop; esa parte de la puerta formal queda abierta para la revisión humana.

## Rasgos adoptados y rechazados

- **Adoptados:** filas accionables, estados legibles, próximos eventos visibles, ejes/valores explicables y composición que conserva lectura en móvil.
- **Rechazados:** adherencia a protocolos, refills, vitales, ingresos combinados, conflictos de recursos y cualquier cifra o permiso sin contrato en OdontoFlow.
