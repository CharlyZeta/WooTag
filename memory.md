# Memory of WooTag AI Generator

## 📌 Estado actual (2026-10-20)
- **Versión**: 2.5.19 · **293 tests / 31 archivos** · `typecheck` limpio con `strict` · `lint` limpio.
- **Contratos SDD-GL resueltos en esta etapa** (12): FIX-0011 (snapshot de precios al imprimir), FIX-0012 (retiro del emparejamiento por QR), FIX-0013 (debounce de config/perfiles), FIX-0014 (TTL de auditoría de precios), FIX-0015 (geometría del indicador de página), FIX-0016 (sin credenciales en URLs), FIX-0017 (reglas de Firestore versionadas + modelo de amenaza), FIX-0018 (IA configurable con prueba de clave), FIX-0019 (sin telemetría de IP), FIX-0020 (deduplicación consistente), FIX-0023 (sin logs con payloads), FIX-0029 (sesión que vence en vivo).
- **Producción**: reglas de Firestore desplegadas en `wootag-cloud` y verificadas (simulador 5/5 + smoke test real de `users/{uid}/snapshots/{siteId}`).
- **Pendiente**: 3 contratos `DRAFT` (FIX-0024 Tailwind en build, FIX-0026 cobertura de UI, FIX-0028 service worker). Detalle en `contracts/` y mapa operativo en `graphify-out/PROJECT_MAP.md`.

---

## 📌 Contexto General del Proyecto
- **Nombre**: WooTag AI Generator (versión 2.5.15)
- **Propósito**: Generar e imprimir etiquetas de precio profesionales A4 conectando con WooCommerce o cargando plantillas Excel (XLS/XLSX). Permite optimización de descripciones usando Google Gemini AI (`gemini-2.0-flash`) y sincronización en tiempo real vía Firebase (Firestore y Auth) entre PC y dispositivos móviles con la misma cuenta cloud.
- **Stack Tecnológico**: React 19, TypeScript, Vite, Firebase, SheetJS (XLSX), Lucide React, Tailwind CSS (vía CDN en `index.html`).

---

## 🛠️ Estado del Proyecto & Health Check (2026-05-22)
1. **Base de Datos & Docker**: 
   - No aplica contenedor Docker local para base de datos. La aplicación es 100% serverless/client-side y se integra directamente con Firestore y WooCommerce API desde el navegador.
2. **Contexto de Ingeniería**:
   - Analizado el archivo [ENGINEERING_CONTEXT.md](file:///d:/ProyectosDual/WooTag/WooTag/ENGINEERING_CONTEXT.md) y el historial en [changelog.txt](file:///d:/ProyectosDual/WooTag/WooTag/changelog.txt).
3. **Rol de Sesión**:
   - Cargado el rol: **Arquitecto / Desarrollador Principal**.
4. **Misión de Sesión (2026-05-22)**:
   - Implementar un panel de diagnóstico visual en la cuenta de la nube (`CloudLoginModal`), agregar un botón de sincronización forzada ("Subir Credenciales a la Nube") para evitar demoras/debounce, y solucionar un bug crítico de race condition al iniciar sesión con perfiles de nube vacíos que borraba/sobrescribía configuraciones.

---

## 🔍 Análisis Exhaustivo del Código

### 1. Orquestación Global (`App.tsx`)
- **Fortalezas**:
  - Excelente separación y modularización del estado global de la aplicación (cola de productos, configuración visual `TagConfig`, perfiles de diseño guardados e historial de impresión).
  - Manejo eficiente de rehidratación de sesión con credenciales WooCommerce de forma ofuscada en `localStorage`.
  - Excelente uso de referencias (`useRef`) y de un indicador flotante de páginas A4 que actualiza el estado de manera reactiva mediante el scroll del contenedor.
- **Mejoras y Fixes en v2.2.7 ✅**:
  - **Migración de Perfiles Heredados a Multisitio (Retrocompatibilidad)**: Corregida la rama de fallback en `App.tsx` para cuentas con perfiles antiguos en la base de datos (que tenían `wooSession` pero carecían de `wooSites` y `activeSiteId`), transformándola automáticamente al formato multisitio y guardándola de forma consistente tanto localmente en `localStorage` como en Firestore.
  - **Diagnóstico de Expiración de Firestore Rules**: Identificación de la expiración de las reglas de prueba de Firestore (límite del 25 de abril de 2026) que bloqueaba toda sincronización de datos con un error de permisos denegados. Se redactó y proporcionó al usuario una regla de producción segura y segmentada.
  - **Reglas de Firestore versionadas (FIX-0017)**: las reglas de seguridad ya viven en el repo (`firestore.rules` + `firebase.json`); cada usuario sólo accede a `users/{suUid}` y sus subcolecciones y todo lo demás queda denegado por defecto. Un `allow` permisivo o la expiración de reglas de prueba ya no pueden pasar desapercibidos en un PR.

- **Mejoras y Fixes en v2.2.6 ✅**:
  - **Compuerta de Sincronización Reactiva (`isCloudProfileLoaded`)**: Introducción del estado `isCloudProfileLoaded` en `App.tsx` para bloquear escrituras y suscripciones automáticas en Firebase hasta que los datos iniciales de la nube se hayan descargado por completo, previniendo la pérdida de credenciales y configuraciones en móviles.
  - **Limpieza Completa de Estados en Logout**: Al cerrar sesión de Firebase, se resetean todos los estados de tiendas, sesión activa de WooCommerce y cola de productos locales, removiendo datos confidenciales de `localStorage` para garantizar transiciones seguras.

- **Mejoras y Fixes en v2.2.5 ✅**:
  - **Panel de diagnóstico en la nube (`CloudLoginModal`)**: Visualización detallada del ID del dispositivo, el recuento de productos locales, y el estado de todas las tiendas guardadas en la nube con insignias dinámicas ("Activa" / "Guardada").
  - **Sincronización forzada manual (`handleForcePushWooSession`)**: Permite la carga instantánea de credenciales y sesión desde la PC a Firestore, actualizando `lastSyncedData.current` en el proceso para evitar bucles.
  - **Fix de sobrescritura de perfil vacío**: Inicialización de la referencia con estados vacíos al detectar una cuenta nueva/vacía, previniendo que los móviles recién ingresados sobreescriban datos válidos de otros dispositivos.

- **Mejoras y Fixes en v2.2.4 ✅**:
  - **Evitar bucles de escritura**: Implementación de referencias `sessionRef` y `lastSyncedData` para realizar comparaciones profundas antes de escribir a Firestore y omitir loops redundantes en las suscripciones.
  - **Sincronización en tiempo real reactiva**: Modificación de la suscripción en tiempo real (`subscribeToCloudProfile`) para conectar automáticamente si el sitio activo en la nube cambia o si el móvil no tiene sesión local.
  - **Migración transparente de sesión local**: Si un usuario tiene sesión local iniciada (modo invitado) y se loguea en Firebase con una base de datos vacía, sus credenciales locales se guardan automáticamente en su perfil en la nube.
  - **Debounce unificado**: Integración de todo el flujo de sincronización de WooCommerce hacia Firestore en un único `useEffect` con debounce de 1000ms, simplificando los handlers y removiendo llamadas directas duplicadas.

### 2. Panel de Control (`components/Controls.tsx`)
- **Fortalezas**:
  - Componente robusto de control lateral dividido en 5 pestañas (Lista, Importar, Ajustes, Diseño e Historial).
  - Manejo transparente del modo responsivo/móvil bloqueando funciones de anfitrión (Host) en viewports pequeños (< 768px).
- **Áreas de Mejora**:
  - El archivo supera las 1,100 líneas. Es un fuerte candidato a refactorización dividiéndose en sub-componentes independientes por cada pestaña.

### 3. Renderizado de Etiquetas (`components/Tag.tsx` & `components/TagSheet.tsx`)
- **Fortalezas**:
  - `TagSheet.tsx` realiza la paginación de manera matemática limpia basada en el grid establecido de filas/columnas.
  - Evita páginas vacías al final omitiendo la directiva `print:break-after-page` en la última página mediante una validación del índice.
  - Formateo consistente de precios para Argentina/España (`es-AR`) con soporte selectivo de separadores e inclusión de IVA (leyenda) y Precio Especial.

### 4. Servicios API y Firebase (`services/` & `contexts/`)
- **`wooService.ts`**:
  - Implementa un handshake inteligente que busca productos primero para verificar la API en lugar de acceder a `/wp-json/wp/v2/users/me` (que suele fallar con errores 401 en configuraciones estándar de WordPress/WooCommerce).
  - Paginación automática segura para categorías usando el header `X-WP-TotalPages`.
- **`cloudProfiles.ts`**:
  - Uso de sincronización atómica con `arrayUnion` de Firestore para evitar que múltiples dispositivos móviles en una misma cuenta sobrescriban datos concurrentemente.
  - `subscribeToCloudProfile` activo mientras haya `currentUser`, sincronizando productos y `wooSites` en tiempo real entre dispositivos.
  - Emparejamiento por QR entre dispositivos retirado en 2.5.4 (FIX-0012); la sincronización PC↔móvil usa la cuenta cloud (`users/{uid}`).
- **`geminiService.ts`**:
  - Implementa fallback robusto de red y control de cuotas para que la app continúe funcionando de forma transparente si falla la optimización de descripciones con IA.

### 5. Flujo de Credenciales Cloud (post-fix v2.2.4)
```
Firebase Login (PC o móvil)
    → loadCloudProfile(uid)           // Lee Firestore: users/{uid}
    → Extrae WooConfig desde WooSite  // FIX: ya no pasa WooSite donde se esperaba WooConfig
    → handleConnect(wooConfig, ..., remember=true, siteId)
    → setSession()                    // Estado React actualizado ✅
    → localStorage ofuscado           // Persistencia local ✅ (FIX: remember=true)
    → Firestore activeSiteId          // Persistencia cloud ✅
```

### 6. Utilidades y Seguridad (`utils/`)
- **`security.ts`**:
  - Ofuscación base64 rápida con un Salt estático para evitar la inspección visual casual en las DevTools del navegador. Cumple bien su propósito, pero se destaca en la documentación que no es un cifrado criptográfico estricto.
- **`crypto.ts`** (FIX-0017):
  - Ofuscación en reposo con WebCrypto (AES-GCM 256 bits, HKDF-SHA256) para las credenciales guardadas en Firestore. La clave se deriva del `uid` del path, así que cualquiera que pueda leer el documento puede descifrarlo: **no aporta confidencialidad**. El control real de acceso son las reglas de Firestore (`firestore.rules`).
- **`xlsImport.ts`**:
  - Diseño altamente seguro contra inyecciones de macros o fórmulas maliciosas. Lee únicamente valores ya calculados de celdas con SheetJS (`cellFormula: false`, `cellHTML: false`, `bookVBA: false`), restringe a formatos puros de datos (`.xls`/`.xlsx`), limita el tamaño a 5 MB y el número de filas a 500.

---

## 🚀 Próximos Pasos Recomendados
1. **Dividir `Controls.tsx`** en submódulos por pestaña para reducir la complejidad cognitiva del archivo.
2. **Verificar la suite de pruebas** ejecutando `npm test` para asegurar que el cambio de importaciones no rompa nada en el bundle de Vite.
3. ✅ **FIX-0017: el cifrado es ofuscación en reposo y el control real son `firestore.rules` (versionadas, deploy manual documentado)**.
