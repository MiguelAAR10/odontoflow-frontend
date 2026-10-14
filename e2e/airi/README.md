# Auditoría AIRI · E3-PARIDAD

`paridad.py` audita el producto sin modificarlo. Recorre Inicio, Agenda, Bandeja,
Caja, Rastro, Mi turno (administrativo), Dirección (dueño), Jornada y Atención
(doctor), y Lienzo (administrativo), con sede **Lince** en ambos. Cada vista se ejecuta en 1440×1000 y 390×844,
claro/oscuro, movimiento normal/reducido: **80 casos independientes**.

## Ejecutar

Desde la raíz del worktree, con Python Playwright, Chromium y Pillow disponibles:

```bash
python3 -m pip install playwright Pillow
python3 -m playwright install chromium
NEXT_PUBLIC_USE_MOCKS=true npx next dev -p 5243 -H 127.0.0.1
```

En otra terminal, si el mockup oficial no está servido:

```bash
python3 -m http.server 8130 --directory /home/miguel/projects/MiguelAR10-Builder/AI-Edge-Runners/products/odontoflow/odontoflow-planning/mockups --bind 127.0.0.1
```

Luego:

```bash
python3 e2e/airi/paridad.py --self-test
python3 e2e/airi/paridad.py
npm run typecheck
```

Sin `python -I`. Detener los servidores propios al terminar. No necesita backend
para esta auditoría visual: debe usarse el modo mock honesto del producto.
El auditor no intercepta ni reemplaza respuestas de negocio y no aprueba tarjetas.

Opciones:

```bash
python3 e2e/airi/paridad.py --help
python3 e2e/airi/paridad.py --views agenda caja --output .audit/diagnostico
python3 e2e/airi/paridad.py --base-url http://127.0.0.1:5243 --mockup-url http://127.0.0.1:8130/agente-v10/ --sample-ms 1200
python3 e2e/airi/paridad.py --axe-path /ruta/axe-4.10.3.min.js
```

`--views` usa claves del mockup: `home agenda bandeja caja actividad turno
direccion jornada ficha canvas`. Un filtro sirve para diagnosticar; **no cumple
la matriz de aceptación**. `--sample-ms` controla el muestreo RAF (mínimo 500 ms).
Se descarga axe-core **4.10.3** del CDN indicado en el script a `.audit/` una vez;
JSON registra versión, SHA256 del recurso y versión de Chromium. `--axe-path`
permite ejecución sin CDN. La versión debe coincidir con la fijada.

## Qué mide

- Todos los errores de consola y excepciones JS; respuestas HTTP ≥400 y peticiones
  fallidas. No se excluyen fallos de cancelación ni de recursos externos.
- Desborde horizontal global e interno visible, incluso contenido cortado por
  `overflow:hidden`. Excluye scrollers intencionales, ellipsis, decoración
  `aria-hidden` y etiquetas recortadas de accesibilidad. También excluye el marco del botón de
  personaje, cuyo SVG sobresale intencionalmente. Guarda selector y píxeles.
- Una entrada AIRI visible por vista. Lienzo exige cero en reposo y una al abrir
  `Control+k` (equivalente funcional de ⌘K). Captura y audita también ese diálogo.
- Máximo de agentes simultáneamente animados durante reposo y consulta simulada,
  deduplicados por identidad entre cursor/SVG/equipo. Cuenta WAAPI/CSS y cambios
  de transform/opacity entre frames. Máximo dos; con reduced motion exige cero.
  Informa propiedades animadas ajenas a transform/opacity.
- axe-core con tags WCAG 2 A/AA, 2.1 A/AA y 2.2 AA: violaciones y reglas incompletas
  con nodos, HTML, selector y enlace explicativo. **AA automático no certifica AA**:
  revisar incompletos, teclado, lectura, canvas y estados adicionales manualmente.
- Navegación por enlaces reales, rol seleccionado, ruta, tema y preferencia de
  movimiento; sección equivalente del mockup. Omite intro en ambos para comparar.

El muestreo es finito: no demuestra el límite de animación durante todos los
posibles eventos. Consultas cubren actividad inicial, sin aprobar ni verificar
cada flujo de negocio. AA se ejecuta en reposo y diálogo de Lienzo; estados de
trabajo tienen geometría/movimiento/entrada y captura, no un segundo axe completo.

## Evidencia y códigos de salida

En `.audit/E3-PARIDAD/` (no commitear):

- `results.json`: datos crudos de cada caso y de referencia, errores y métricas.
- `report.md`: tabla por vista/configuración con cifras y veredicto automático. Desborde y agentes muestran el peor
  valor entre reposo, trabajo y diálogo (nodos deduplicados por selector).
- `index.html`: galería; **app izquierda, mockup derecha**, sin reescalar al componer.
- `*-app.png`, `*-mockup.png`, `*-pair.png`: páginas completas comparables.
- `*-working.png`, `*-shortcut.png`: actividad y diálogo de Lienzo.
- `*-failure.html`: DOM cuando un caso no pudo medirse.

Código 0: todos los casos seleccionados pasan controles automáticos. Código 1:
fallo de producto/medición o excepción de preparación (ver traceback). Código 2:
argumentos inválidos. Se guarda evidencia tras cada caso, sin abortar ante un
fallo de vista. Un fallo de preparación (servidor/Chromium/axe) no acredita nada.
El resultado visual se determina revisando la pareja de capturas; no se usa una
puntuación de píxeles como sustituto de criterio visual. Fallos del propio mockup
se registran separados de los del producto. El informe de planning resume las
cifras y prioriza diferencias visuales con enlaces a capturas concretas.
