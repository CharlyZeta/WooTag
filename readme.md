# 🏷️ WooTag AI Generator

**WooTag AI Generator** es una herramienta profesional diseñada para propietarios de tiendas WooCommerce que necesitan imprimir etiquetas de precios físicas de forma rápida, elegante y optimizada.

![Versión](https://img.shields.io/badge/version-1.2.0-blue.svg)
![React](https://img.shields.io/badge/built%20with-React-61DAFB.svg)
![Tailwind](https://img.shields.io/badge/style-TailwindCSS-38B2AC.svg)
![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange.svg)

---

## ✨ Características Principales

### 🔄 Integración Directa con WooCommerce
Conéctate a tu tienda usando tu **Consumer Key** y **Consumer Secret**. Importa productos individualmente por SKU o carga categorías completas con un solo clic.

### 🤖 Optimización de Texto con IA (Gemini)
¿Tus descripciones de WooCommerce son demasiado largas para una etiqueta pequeña? Nuestra IA analiza el producto y genera una descripción persuasiva y ultra-breve (máximo 15 palabras) ideal para retail.

### 🎨 Personalización Total del Diseño
Controla cada aspecto de tu etiqueta:
- **Layout A4:** Configura filas y columnas (desde 1x1 hasta 4x10).
- **Colores:** Personaliza el color de títulos, precios, ofertas y códigos QR.
- **Fuentes:** Ajusta tamaños de fuente independientes para cada campo.
- **Precios Especiales:** Calcula automáticamente precios para "Mayoristas" o "Club" aplicando porcentajes de incremento o descuento.

### 📂 Perfiles de Diseño
Guarda tus configuraciones favoritas (ej. "Etiqueta Oferta Roja", "Etiqueta Minimalista") y cárgalas instantáneamente según el tipo de producto que vayas a imprimir.

### 🖨️ Impresión Fiel a A4 y PDF
Diseñado específicamente para hojas A4 (210mm x 297mm). El sistema elimina escalas y márgenes innecesarios para que lo que ves en pantalla sea exactamente lo que sale de tu impresora o se guarda en tu PDF.

---

## 🚀 Funciones Técnicas

- **Persistencia de Sesión:** Opción de "Recordar credenciales" para no tener que loguearte cada vez.
- **Códigos QR Automáticos:** Genera un QR basado en el SKU para facilitar el escaneo en el punto de venta.
- **Responsive Design:** Panel de control optimizado para uso en escritorio con previsualización en tiempo real.
- **Modo Offline Ready:** Una vez cargados los productos, la personalización visual no requiere internet.

---

## 🛠️ Instalación y Uso

1. **Configuración de WooCommerce:**
   - Ve a `WooCommerce > Ajustes > Avanzado > API REST`.
   - Crea una clave con permisos de **Lectura/Escritura**.
2. **Inicio de Sesión:**
   - Ingresa la URL de tu tienda (ej. `https://mitienda.com`).
   - Pega tu `Consumer Key` y `Consumer Secret`.
3. **Generación:**
   - Busca productos por SKU o categoría.
   - Ajusta el diseño en las pestañas laterales.
   - Haz clic en **IMPRIMIR** y selecciona "Guardar como PDF" o tu impresora física.

---

## 📸 Capturas de Pantalla (Ilustrativo)

| Login Seguro | Panel de Control | Previsualización A4 |
| :---: | :---: | :---: |
| ![Login](https://raw.githubusercontent.com/lucide-react/lucide/main/icons/lock.svg) | ![Design](https://raw.githubusercontent.com/lucide-react/lucide/main/icons/palette.svg) | ![Print](https://raw.githubusercontent.com/lucide-react/lucide/main/icons/printer.svg) |

---

## 📜 Licencia

Este proyecto está diseñado para uso profesional en entornos de retail. Consulta el archivo `changelog.txt` para ver las últimas actualizaciones de rendimiento y seguridad.

---
*Desarrollado con ❤️ para la comunidad de eCommerce.*