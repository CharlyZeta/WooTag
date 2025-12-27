# WooTag AI Generator

**WooTag AI Generator** es una herramienta profesional desarrollada para optimizar la creación e impresión de etiquetas de precios para tiendas WooCommerce. Combina la potencia de React para la interfaz de usuario con la inteligencia artificial de Google Gemini para optimizar descripciones de productos para etiquetas físicas.

Este proyecto ha sido desarrollado con la asistencia de **Antigravity**.

![React](https://img.shields.io/badge/React-19.2.0-61DAFB?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-6.0.0-646CFF?style=flat-square&logo=vite)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css)

## 🚀 Características

-   **Integración WooCommerce**: Conexión directa mediante API REST (Consumer Key/Secret).
-   **IA Integrada**: Uso de Google Gemini para resumir descripciones largas en formatos aptos para etiquetas (max 15 palabras).
-   **Diseño de Etiquetas**:
    -   Personalización de filas/columnas (Layout A4).
    -   Ajustes de tipografía, colores y márgenes.
    -   Generación de códigos QR automáticos basados en SKU.
-   **Impresión Optimizada**: Salida CSS específica para impresión A4 perfecta sin márgenes indeseados.
-   **Gestión de Perfiles**: Guardado local de configuraciones de diseño frecuentes.

## 🛠️ Requisitos Previos

-   **Node.js**: v18.0.0 o superior (recomendado v20+).
-   **NPM**: v9.0.0 o superior.

## 📦 Instalación

1.  Clona el repositorio o descarga el código fuente.
2.  Instala las dependencias del proyecto:

```bash
npm install
```

## ▶️ Ejecución Local

Para iniciar el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000` (o el puerto que indique la terminal).

## 🔨 Build para Producción

Para generar los archivos estáticos optimizados para producción:

```bash
npm run build
```

Los archivos generados se encontrarán en la carpeta `dist/`.

## 🤝 Contribución

Si deseas contribuir, por favor asegúrate de seguir las pautas de estilo de código y realizar pruebas exhaustivas de las funcionalidades de impresión e integración con la API.

---

*Powered by Antigravity*