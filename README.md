# 🏷️ WooTag AI Generator

**WooTag AI Generator** es una herramienta web para diseñar e imprimir etiquetas de precio profesionales para tiendas WooCommerce. Importa productos desde tu tienda, personaliza el diseño y genera hojas A4 listas para imprimir, con soporte de QR y optimización de textos via Google Gemini AI.

Este proyecto ha sido desarrollado con la asistencia de **Antigravity**.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite)
![Version](https://img.shields.io/badge/versión-1.5.1-indigo?style=flat-square)

---

## 🚀 Características Principales

### 🔌 Integración WooCommerce

- **Modo Invitado / Offline**: La app es completamente funcional sin credenciales. Solo se requiere conexión para importar productos.
- **Conexión segura**: Credenciales ofuscadas en `localStorage`. La validación prioriza el endpoint de productos para esquivar bloqueos de seguridad comunes (Error 401).
- **Pre-carga de credenciales**: Al abrir el modal de conexión, los campos se pre-llenan con las credenciales ya guardadas. Los campos tienen `autoComplete="off"` para evitar interferencias del navegador.

#### Importación de productos

| Método | Descripción |
|--------|-------------|
| **Por SKU** | Búsqueda exacta por código. Filtra solo productos publicados (`status=publish`). |
| **Por nombre** | Campo de búsqueda con autocompletado en tiempo real (debounce 400ms). Muestra imagen, nombre y SKU en un dropdown de sugerencias. |
| **Por categoría** | Selector desplegable con paginación automática (obtiene **todas** las categorías, sin límite de 100). |

> Todos los métodos de importación detectan duplicados y preguntan al usuario antes de agregar etiquetas repetidas.

---

### 🧠 Inteligencia Artificial (Gemini AI)

- **Optimización de descripciones**: Convierte textos largos en frases de venta concisas (≤ 15 palabras), ideales para el espacio limitado de una etiqueta.
- Modelo: `gemini-2.0-flash` (nombre oficial y estable).

---

### 🎨 Personalización de Diseño

El panel lateral está organizado en tres pestañas:

#### Tab "Ajustes" — Layout y Visibilidad

- **Distribución A4**: Configura filas y columnas (ej: 4×2, 5×3).
- **Campos visibles**: Activa/desactiva nombre, SKU, imagen, descripción, QR, precio de oferta, bordes, decimales, separador de miles.
- **Precio Especial**: Precio adicional con porcentaje configurable (+/-), base de cálculo (regular/oferta), posición (arriba/abajo) y etiqueta personalizada.
- **Leyenda de Precio**: Texto libre debajo del precio (ej: "IVA Incluido") con color y tamaño independientes.

#### Tab "Diseño" — Estilo Visual

- **Perfiles de diseño**: Guarda y carga múltiples configuraciones con nombre personalizado.
- **Tamaños de fuente**: Slider individual por elemento (título, precios, leyendas, descripción, QR).
- **Paleta de colores**: Selectores de color para cada elemento textual y de borde.

#### Diseño de la etiqueta

- Formato de precios con `Intl.NumberFormat('es-AR')` — separadores siempre correctos (ej: `$1.234,56`).
- **Código QR** centrado verticalmente respecto al bloque de precios, con padding inferior para que nunca se corte.

---

### 🖨️ Impresión y Navegación

- **Modo impresión**: Hoja A4 limpia (sin interfaz), con estilos CSS print-media para márgenes exactos.
- **Múltiples páginas**: Paginación automática según el layout configurado.
- **Indicador de páginas flotante**: Badge en el rincón inferior derecho que muestra la página actual y el total (ej: `2 / 5`), con puntos animados. Se actualiza en tiempo real al scrollear y se oculta al imprimir.
- **Scroll independiente**: El área de previsualización scrollea de forma completamente independiente del menú lateral.

---

### 💾 Gestión de Perfiles

Crea y guarda múltiples perfiles de diseño (ej: "Etiquetas Oferta", "Etiquetas Estantería") para cambiar entre configuraciones completas con un clic.

---

## 🛠️ Instalación y Uso

### Requisitos

- Node.js v18+
- npm
- Credenciales de la API REST de WooCommerce (Consumer Key + Consumer Secret)

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd WooTag

# 2. Instalar dependencias
npm install

# 3. Iniciar en desarrollo
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

La app funciona en **modo diseño** sin credenciales. Para importar productos, hacé clic en **"Conectar"** e ingresá la URL de tu tienda + Consumer Key + Consumer Secret.

---

## 📦 Build para Producción

```bash
npm run build
```

Los archivos estáticos quedan en `dist/` listos para alojar en cualquier servidor web o subcarpeta de WordPress.

---

## 🗂️ Estructura del Proyecto

```
App.tsx                  ← Estado global: sesión, configuración, perfiles, indicador de páginas
├── components/
│   ├── ConnectionModal.tsx  ← Modal de conexión a WooCommerce
│   ├── Controls.tsx         ← Panel lateral con 3 tabs
│   ├── TagSheet.tsx         ← Hoja A4 paginada
│   └── Tag.tsx              ← Componente individual de etiqueta
├── services/
│   ├── wooService.ts        ← API REST WooCommerce (SKU, nombre, categorías)
│   └── geminiService.ts     ← Optimización de descripciones con Gemini AI
├── utils/
│   └── security.ts          ← Ofuscación de credenciales en localStorage
└── types.ts                 ← Interfaces TypeScript (Product, TagConfig, etc.)
```

---

## 🤝 Créditos

Desarrollado para potenciar la gestión de tiendas físicas WooCommerce.  
*Powered by **Antigravity***
