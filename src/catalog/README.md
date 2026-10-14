# Catálogo AIRI

El registro acepta exclusivamente `{ type, props }`, con `type` igual a `Say`,
`Part`, `Card`, `Notice`, `Ask`, `Act`, `Status` o `Fallback`. Los schemas de
`schema.ts` son la frontera de validación. Un tipo desconocido, propiedades
extra o valores inválidos producen `Fallback`; nunca se ejecutan callbacks
procedentes del contenido generado.

```tsx
<CatalogRenderer
  item={{ type: "Card", props: {
    card: entry.card, status: entry.status,
    error: entry.error, loadingReason: entry.loadingReason,
  } }}
  handlers={{ onApprove, onAlternative, onEdit, onUndo, onSource }}
/>
```

Los handlers son funciones locales inyectadas por el propietario del hilo:

- `onApprove(card)`, `onAlternative(card)`, `onEdit(card)`, `onUndo(card)`.
- `onSource(source, card)` abre evidencia, si el consumidor puede resolverla.
- `onChoose(optionId)` responde una pregunta; `onOpen(target, action?)` navega.
- `onStop()` detiene la ejecución. El plan de `Status` acepta los pasos de A2
  directamente: `{ label, status: "pending" | "working" | "done" }`.

Los callbacks retornan `void` o `Promise<void>` y rechazan si falla la operación.
El catálogo muestra `toApiError(error).message`. Los handlers de aprobación,
alternativa y deshacer actualizan el DTO/estado autoritativo: resolver el callback
solo bloquea la intención enviada, sin inventar un resultado. Cambiar `id`,
`revision` o `state` reemplaza esa intención. Reintentar un fallo permanece posible.
El dueño del transporte conserva la Idempotency-Key entre reintentos y conecta
el adaptador real de aprobaciones. Aquí no hay transporte, claves ni datos mock.

`Part` acepta `kind: "table"` (columns `{key,label}` + rows), `"list"` (items
`{label,value?}`) o `"kpi"` (items `{label,value}`). Los valores son texto, número
o Money del contrato; no se calculan totales. `Ask` sin opciones muestra texto.
`Act.target`/`action` son identificadores: el callback local los resuelve, nunca
se convierten directamente en URL o código ejecutable.

`Card` reutiliza `CardSchema` de A2, que hoy tiene `revision`, sin `version` ni
`payload_hash`. `body` usa una gramática limitada de elementos React de lectura;
atributos, estilos y URLs no se transfieren, y markup desconocido se muestra
literalmente. Los gráficos HTML del mockup conservan texto, sin recrear barras
desde estilos arbitrarios. Editar delega al dueño la edición y revisión del DTO.
Deshacer requiere `undo`, estado permitido y, para `reversible: "window"`,
`undoRemainingSeconds > 0` suministrado por el dueño; no hay reloj inventado.

Los componentes importan `catalog.css`, consumen los tokens A1 y revelan capas
con Motion. `MotionConfig reducedMotion="user"` y la regla CSS de movimiento
reducido dejan visible también el HTML del servidor antes de hidratar.
