# 🏷️ WooTag AI Generator

**WooTag AI Generator** es una potente herramienta de escritorio (web-based) diseñada para optimizar, diseñar e imprimir etiquetas de precios profesionales para tiendas WooCommerce. Combina la flexibilidad de la API de WooCommerce con la inteligencia de Google Gemini para crear etiquetas perfectas en segundos.

Este proyecto ha sido desarrollado con la asistencia de **Antigravity**.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite)

---

## 🚀 Características Principales

### 🔌 Integración WooCommerce
*   **Conexión Directa**: Se conecta a tu tienda mediante API REST (Consumer Key / Consumer Secret).
*   **Importación Flexible**:
    *   **Por SKU**: Busca y agrega productos individuales rápidamente.
    *   **Por Categoría**: Importa catálogos completos con un solo clic.

### 🧠 Inteligencia Artificial (Gemini AI)
*   **Optimización de Textos**: Transforma descripciones largas y técnicas de productos en "bullets" de venta concisos y atractivos (máx. 15 palabras), perfectos para el espacio limitado de una etiqueta física.

### 🎨 Personalización de Diseño Avanzada
El editor visual en tiempo real permite ajustar cada detalle de la etiqueta:

#### **Distribución y Formato**
*   **Layout A4**: Configura filas y columnas (ej. 4x2, 5x3) para aprovechar al máximo tus hojas de etiquetas.
*   **Visibilidad Selectiva**: Activa o desactiva elementos según necesites:
    *   Nombre del producto
    *   SKU
    *   Imagen
    *   Descripción
    *   Código QR
    *   Precios (Oferta, Regular)
    *   Bordes de corte

#### **Precios y Ofertas**
*   **Precios Dinámicos**: Detecta automáticamente si un producto está en oferta y destaca el precio rebajado.
*   **Separador de Miles**: Interruptor para alternar entre formatos de precio (`1.500` vs `1500`).
*   **Leyenda de Precio**: Campo de texto libre debajo del precio (ej: "IVA Incluido", "Contado Efectivo") con color y tamaño configurables.
*   **Etiqueta de Precio Especial**:
    *   Calculadora automática de recargos o descuentos (ej: "+10%", "-5%").
    *   Base de cálculo seleccionable (sobre precio regular o precio de oferta).
    *   Posición ajustable (Arriba o Abajo del precio principal).
    *   Etiqueta de texto personalizable (ej: "Mayorista", "Club") con **control de color y tamaño independiente**.

#### **Estilos Gráficos**
*   **Tipografía**: Control total del tamaño de fuente para *cada* elemento (título, precios, leyendas, descripción).
*   **Paleta de Colores**: Selectores de color individuales para textos, bordes y acentos.

#### **Código QR**
*   **QR Limpio**: Genera códigos QR que contienen exclusivamente el SKU del producto, facilitando el escaneo en caja o inventario.
*   **Tamaño Ajustable**: Slider dedicado para controlar el tamaño del código QR en la etiqueta.

### 💾 Gestión de Perfiles
*   **Guardado Local**: Crea y guarda múltiples perfiles de diseño (ej: "Etiquetas Oferta", "Etiquetas Estantería").
*   **Carga Rápida**: Cambia entre configuraciones completas con un solo clic.

### 🖨️ Impresión Optimizada
*   **Modo de Impresión**: Genera una hoja limpia, sin interfaz de usuario, lista para imprimir en A4.
*   **CSS Print-Media**: Ajustes específicos para asegurar márgenes correctos y alta fidelidad.

---

## 🛠️ Instalación y Uso

### Requisitos
*   Node.js (v18+)
*   npm

### Pasos
1.  **Clonar el repositorio**:
    ```bash
    git clone <url-del-repo>
    cd WooTag
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Iniciar servidor de desarrollo**:
    ```bash
    npm run dev
    ```

4.  **Abrir en el navegador**:
    Visita `http://localhost:3000`.

5.  **Configurar credenciales**:
    Ingresa la URL de tu tienda, Consumer Key y Consumer Secret en la pantalla de inicio. (Nota: Las credenciales se guardan localmente en tu navegador).

---

## 📦 Build para Producción

Para generar los archivos estáticos listos para desplegar en un servidor web o subcarpeta de WordPress:

```bash
npm run build
```

Los archivos se generarán en la carpeta `dist/`.

---

## 🤝 Créditos

Desarrollado para potenciar la gestión de tiendas físicas WooCommerce.
*Powered by **Antigravity***.
