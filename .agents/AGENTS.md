# Reglas de Desarrollo del Proyecto WooTag

- **Incrementar Versión**: Cada vez que realices cambios en el código y estos sean testeados con éxito (tanto en compilación build como en tests unitarios), debes incrementar la versión del proyecto en `package.json` (por ejemplo, incrementando la versión patch/minor).
- **Documentar Cambios**: Después de incrementar la versión, documenta de manera clara y profesional todos los cambios, correcciones o adiciones en `changelog.txt` bajo una sección con la nueva versión y la fecha actual.
- **Mantener Consistencia**: Asegúrate de que no queden referencias desactualizadas a la versión del software. Recuerda que Vite inyecta automáticamente la versión desde `package.json` en `types.ts` mediante `__APP_VERSION__`.

---

## Metodología SDD-GL (Spec-Driven Development)

Este proyecto utiliza el framework y metodología **SDD-GL** (Gate/Loop) para el desarrollo de Features (`FEAT-XXXX`) y Bugfixes (`FIX-XXXX`).

### Orquestación de Contratos (`contracts/`)
Al trabajar en cualquier tarea, feature o fix:
1. Buscar los contratos en `contracts/`.
2. Leer `# Status:` y `# Mode:` del encabezado del contrato:
   - `Status: DRAFT` + `Mode: GATE` → Modo Gate (especificación, revisión de consistencia con el usuario, resolución de ambigüedades en Ambiguity Log).
   - `Status: APPROVED` + `Mode: LOOP` → Modo Loop (ejecución autónoma basada en el Completion Map, coder + tester + reviewer, logs en `.sdd/runs/`).
   - `Status: RESOLVED` → El contrato está completo y verificado.
3. Al finalizar un contrato en Loop y antes de marcarlo como `RESOLVED`, aplicar las reglas de incremento de versión en `package.json`, testing completo (`npm test`, `npm run build`) y documentación en `changelog.txt`.

