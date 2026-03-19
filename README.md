# 🏷️ WooTag AI Generator

**WooTag AI Generator** es una herramienta web para diseñar e imprimir etiquetas de precio profesionales para tiendas WooCommerce. Importa productos desde tu tienda o desde una planilla Excel, personaliza el diseño y genera hojas A4 listas para imprimir, con código QR por producto y optimización de textos via Google Gemini AI.

Desarrollado con la asistencia de **Antigravity** (Google DeepMind).

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite)
![Version](https://img.shields.io/badge/versión-1.7.2-indigo?style=flat-square)
![Tests](https://img.shields.io/badge/tests-81%20passing-brightgreen?style=flat-square)

---

## 📸 Vista Previa

### Previsualización de Etiquetas

![Vista previa de etiquetas con productos cargados](screenshots/tag_preview.png)

> Panel lateral con 8 productos y hoja A4 con etiquetas mostrando nombre, SKU, precio regular, precio de oferta, precio especial y código QR.

### Segunda Página de Etiquetas

![Vista con scroll mostrando más etiquetas](screenshots/tag_preview_scroll.png)

> Scroll en la previsualización mostrando los productos restantes con paginación automática.

---

## 🚀 Características Principales

### 🔌 Integración WooCommerce

- **Modo Invitado / Offline**: La app es completamente funcional sin credenciales. Solo se requiere conexión para importar productos desde la API.
- **Conexión segura**: Credenciales ofuscadas en `localStorage` con salt + base64. La validación prioriza el endpoint de productos para esquivar bloqueos comunes (Error 401).
- **Sesión con expiración**: Las credenciales guardadas expiran a las 24 horas automáticamente.

#### Modal de Conexión

![Modal de conexión WooCommerce](screenshots/connection_modal.png)

> Formulario para conectar con la API REST de WooCommerce. Acepta URL de la tienda, Consumer Key y Consumer Secret con opción de guardar localmente.

#### Importación de productos — Tab "Importar"

| Método | Descripción |
|--------|-------------|
| **Planilla XLS** | Descarga la plantilla oficial `.xlsx`, completá los datos y subila con drag & drop. Sin necesidad de conexión a la tienda. |
| **Por SKU** | Búsqueda exacta por código. Filtra solo productos publicados (`status=publish`). |
| **Por nombre** | Autocompletado en tiempo real (debounce 400ms) con imagen, nombre y SKU en dropdown. |
| **Por categoría** | Selector con paginación automática — obtiene **todas** las categorías, sin límite de 100. |

> Todos los métodos detectan duplicados y preguntan antes de agregar etiquetas repetidas.

![Tab Importar](screenshots/import_tab.png)

> Sección de importación con área drag & drop para planillas XLS y botón para conectar con WooCommerce.

---

### 📊 Importación XLS Segura

La planilla Excel oficial incluye las columnas `sku`, `name`, `price`, `sale_price`, `description`, `category`, `image_url`. El módulo de importación aplica las siguientes medidas de seguridad:

- Solo acepta `.xlsx` y `.xls`. Los archivos `.xlsm` (con macros VBA) son **rechazados**.
- Límite de **5 MB** por archivo y **500 filas** por importación.
- SheetJS se configura con `{ cellFormula: false, cellHTML: false, bookVBA: false }` — no ejecuta fórmulas ni macros.
- Cada valor de celda se sanitiza: solo se aceptan `string` y `number`.
- URLs de imagen validadas para aceptar únicamente `http:` / `https:`. Se rechazan `javascript:`, `data:`, `file:` y similares.

---

### 🧠 Inteligencia Artificial (Gemini AI)

- **Optimización de descripciones**: Convierte textos largos en frases de venta concisas (≤ 15 palabras), ideales para el espacio limitado de una etiqueta.
- Modelo: `gemini-2.0-flash` (estable).
- Requiere `GEMINI_API_KEY` en el archivo `.env`.

<!-- TODO: Captura del botón de optimización AI en acción (screenshots/ai_optimization.png) -->

---

### 🎨 Personalización de Diseño

El panel lateral está organizado en **5 pestañas**:

| Tab | Contenido |
|-----|-----------|
| **Lista** | Lista de productos a imprimir. Botón de acceso rápido a "Importar" cuando está vacía. |
| **Importar** | Importación por XLS + API WooCommerce (SKU / Nombre / Categoría). |
| **Ajustes** | Layout A4 (filas/columnas), visibilidad de campos, Precio Especial, Leyenda de Precio. |
| **Diseño** | Perfiles de diseño guardados, tamaños de fuente, paleta de colores. |
| **Historial** | Registro de impresiones con filtro por SKU/nombre. |

#### Tab Ajustes

![Tab Ajustes](screenshots/settings_tab.png)

> Configuración de la distribución A4 (columnas × filas) y switches de visibilidad para cada campo de la etiqueta.

#### Tab Diseño

![Tab Diseño](screenshots/design_tab.png)

> Gestión de perfiles de diseño y sliders para ajustar tamaños de fuente por elemento.

#### Tab Historial

<!-- TODO: Captura del historial de impresiones con registros (screenshots/history_tab.png) -->
> *Pendiente: agregar captura del historial con registros de impresión.*

#### Campos configurables por etiqueta

- Distribución: filas × columnas en A4 (ej: 4×2, 5×3, 2×1)
- Visibilidad: nombre, SKU, imagen, descripción, QR, precio oferta, bordes, decimales, separador de miles
- **Precio Especial**: porcentaje configurable (+/-), base (regular/oferta), posición (arriba/abajo), etiqueta personalizada
- **Leyenda de Precio**: texto libre debajo del precio (ej: "IVA Incluido") con color y tamaño independientes
- Formato de precios: `Intl.NumberFormat('es-AR')` → `$1.234,56`
- Código QR centrado verticalmente con el bloque de precios

---

### 🖨️ Impresión

- Hoja A4 limpia (sin interfaz) con estilos CSS `@media print`.
- Múltiples páginas con paginación automática.
- **Indicador de páginas flotante**: badge animado en esquina inferior derecha, actualizado en tiempo real al scrollear.
- Scroll del área de previsualización completamente independiente del panel lateral.
- Historial de impresiones persistido en `localStorage` con deduplicación visual por SKU (`×N`).

---

## 🛠️ Instalación y Uso

### Requisitos

- Node.js v18+  
- npm  
- Credenciales de la API REST de WooCommerce (Consumer Key + Consumer Secret)  
- (Opcional) `GEMINI_API_KEY` para la optimización AI

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd WooTag

# 2. Instalar dependencias
npm install

# 3. Configurar API Key de Gemini (opcional)
echo "GEMINI_API_KEY=tu-api-key-aqui" > .env

# 4. Iniciar en desarrollo
npm run dev
```

Abre `http://localhost:3000`. La app funciona en **modo diseño** sin credenciales. Para importar desde WooCommerce, hacé clic en **"Conectar"**.

---

## 🧪 Tests Automatizados

```bash
npm test               # Ejecuta los 81 tests una vez
npm run test:watch     # Modo watch para desarrollo
npm run test:coverage  # Genera reporte de cobertura en /coverage
```

| Archivo | Tests | Cubre |
|---------|-------|-------|
| `utils/xlsImport.test.ts` | 39 | Extensión, tamaño, estructura, columnas, happy paths, advertencias, límite de filas, sanitización de URLs y celdas |
| `services/wooService.test.ts` | 26 | Conexión WooCommerce, fallback auth 401, búsqueda por SKU/nombre/categoría, paginación de categorías, mensajes de error en español |
| `utils/security.test.ts` | 10 | Round-trip encrypt/decrypt, datos corruptos, salt manipulado, preservación de tipos |
| `services/geminiService.test.ts` | 6 | Respuesta AI exitosa, fallback a descripción original, API Key ausente, errores de red |

---

## 📦 Build para Producción

```bash
npm run build
```

Los archivos estáticos quedan en `dist/`, listos para alojar en cualquier servidor web o subcarpeta de WordPress.

---

## 🗂️ Estructura del Proyecto

```
App.tsx                      ← Estado global: sesión, config, perfiles, historial, paginación
├── components/
│   ├── ConnectionModal.tsx   ← Modal de conexión a WooCommerce con validación
│   ├── Controls.tsx          ← Panel lateral con 5 tabs (Lista/Importar/Ajustes/Diseño/Historial)
│   ├── TagSheet.tsx          ← Hoja A4 paginada (un sheet por página)
│   └── Tag.tsx               ← Componente individual de etiqueta con QR y formateo de precios
├── services/
│   ├── wooService.ts         ← API REST WooCommerce (SKU, nombre, categorías, paginación)
│   └── geminiService.ts      ← Optimización de descripciones con Gemini AI
├── utils/
│   ├── security.ts           ← Ofuscación de credenciales en localStorage (base64 + salt)
│   └── xlsImport.ts          ← Parseo seguro XLS (SheetJS) + generador de plantilla
│
└── types.ts                  ← Interfaces TypeScript globales + DEFAULT_CONFIG + APP_VERSION
```

---

## 🔐 Seguridad

| Aspecto | Implementación |
|---------|----------------|
| Credenciales WooCommerce | Ofuscadas con base64 + salt en `localStorage`. **No** es cifrado fuerte — es protección contra inspección casual. |
| Sesión | Expiración automática a las 24h. |
| API Key Gemini | Solo en `.env` (gitignoreado). Nunca en código. |
| Importación XLS | Solo `.xlsx`/`.xls`, sin macros VBA, sanitización de celdas y URLs. |

---

## 📌 Estado del Proyecto

En mejora continua.

---

## 🛣 Roadmap

- [ ] Columna `quantity` en la planilla XLS para imprimir N etiquetas del mismo producto.
- [ ] Soporte multi-hoja para importar distintos grupos de productos.
- [ ] Exportar la configuración de la etiqueta como JSON para compartir entre usuarios.
- [ ] Modo oscuro en la interfaz de configuración.
- [ ] PWA / instalable como app de escritorio.

---

## 👨‍💻 Autor

**Gerardo Maidana**  
Backend Developer | Java & Spring Boot  
[LinkedIn](https://linkedin.com/in/gerardomaidana) · [GitHub](https://github.com/CharlyZeta/)

---

## 🤝 Créditos

Desarrollado para potenciar la gestión de tiendas físicas WooCommerce.  
*Powered by **Antigravity** (Google DeepMind)*
