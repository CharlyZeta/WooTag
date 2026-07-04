# Reglas de Desarrollo del Proyecto WooTag

- **Incrementar Versión**: Cada vez que realices cambios en el código y estos sean testeados con éxito (tanto en compilación build como en tests unitarios), debes incrementar la versión del proyecto en `package.json` (por ejemplo, incrementando la versión patch/minor).
- **Documentar Cambios**: Después de incrementar la versión, documenta de manera clara y profesional todos los cambios, correcciones o adiciones en `changelog.txt` bajo una sección con la nueva versión y la fecha actual.
- **Mantener Consistencia**: Asegúrate de que no queden referencias desactualizadas a la versión del software. Recuerda que Vite inyecta automáticamente la versión desde `package.json` en `types.ts` mediante `__APP_VERSION__`.
