# Memory of WooTag AI Generator

## 📌 Contexto General del Proyecto
- **Nombre**: WooTag AI Generator (versión 2.2.4)
- **Propósito**: Generar e imprimir etiquetas de precio profesionales A4 conectando con WooCommerce o cargando plantillas Excel (XLS/XLSX). Permite optimización de descripciones usando Google Gemini AI (`gemini-2.0-flash`) y sincronización en tiempo real vía Firebase (Firestore y Auth) entre PC y dispositivos móviles (modo Companion QR o identidad compartida).
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
   - Implementar una sincronización de WooCommerce bidireccional y robusta entre dispositivos mediante un efecto debounce unificado y prevención de bucles/condiciones de carrera.

---

## 🔍 Análisis Exhaustivo del Código

### 1. Orquestación Global (`App.tsx`)
- **Fortalezas**:
  - Excelente separación y modularización del estado global de la aplicación (cola de productos, configuración visual `TagConfig`, perfiles de diseño guardados e historial de impresión).
  - Manejo eficiente de rehidratación de sesión con credenciales WooCommerce de forma cifrada/ofuscada en `localStorage`.
  - Excelente uso de referencias (`useRef`) y de un indicador flotante de páginas A4 que actualiza el estado de manera reactiva mediante el scroll del contenedor.
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
- **`realtimeSession.ts` & `cloudProfiles.ts`**:
  - Uso de sincronización atómica con `arrayUnion` de Firestore para evitar que múltiples dispositivos móviles en una misma cuenta sobrescriban datos concurrentemente.
  - `subscribeToCloudProfile` activo mientras haya `currentUser`, sincronizando productos y `wooSites` en tiempo real entre dispositivos.
- **`geminiService.ts`**:
  - Implementa fallback robusto de red y control de cuotas para que la app continúe funcionando de forma transparente si falla la optimización de descripciones con IA.

### 5. Flujo de Credenciales Cloud (post-fix v2.2.4)
```
Firebase Login (PC o móvil)
    → loadCloudProfile(uid)           // Lee Firestore: users/{uid}
    → Extrae WooConfig desde WooSite  // FIX: ya no pasa WooSite donde se esperaba WooConfig
    → handleConnect(wooConfig, ..., remember=true, siteId)
    → setSession()                    // Estado React actualizado ✅
    → localStorage cifrado            // Persistencia local ✅ (FIX: remember=true)
    → Firestore activeSiteId          // Persistencia cloud ✅
```

### 6. Utilidades y Seguridad (`utils/`)
- **`security.ts`**:
  - Ofuscación base64 rápida con un Salt estático para evitar la inspección visual casual en las DevTools del navegador. Cumple bien su propósito, pero se destaca en la documentación que no es un cifrado criptográfico estricto.
- **`xlsImport.ts`**:
  - Diseño altamente seguro contra inyecciones de macros o fórmulas maliciosas. Lee únicamente valores ya calculados de celdas con SheetJS (`cellFormula: false`, `cellHTML: false`, `bookVBA: false`), restringe a formatos puros de datos (`.xls`/`.xlsx`), limita el tamaño a 5 MB y el número de filas a 500.

---

## 🚀 Próximos Pasos Recomendados
1. **Dividir `Controls.tsx`** en submódulos por pestaña para reducir la complejidad cognitiva del archivo.
2. **Verificar la suite de pruebas** ejecutando `npm test` para asegurar que el cambio de importaciones no rompa nada en el bundle de Vite.
3. **Considerar cifrado real** de las credenciales WooCommerce en Firestore (actualmente se guardan en texto plano en el documento del usuario).
