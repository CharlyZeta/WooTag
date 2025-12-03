import { Product, WooConfig, WpUser } from '../types';

const cleanHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

const getAuthHeaders = (config: WooConfig) => {
  const auth = btoa(`${config.consumerKey}:${config.consumerSecret}`);
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };
};

export const validateConnection = async (config: WooConfig): Promise<WpUser> => {
  if (!config.url || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Por favor completa todos los campos.");
  }

  const baseUrl = config.url.replace(/\/$/, "");

  try {
    // We use the WP REST API /users/me endpoint to validate credentials and check roles
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=edit`, {
      method: 'GET',
      headers: getAuthHeaders(config)
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Credenciales inválidas o permisos insuficientes.");
    }

    if (!response.ok) {
      throw new Error(`Error de conexión: ${response.statusText}`);
    }

    const user = await response.json();

    // Check capabilities
    const allowedRoles = ['administrator', 'shop_manager'];
    const hasPermission = user.roles && user.roles.some((r: string) => allowedRoles.includes(r));

    if (!hasPermission) {
      throw new Error("El usuario no tiene permisos de Administrador o Shop Manager.");
    }

    return {
      id: user.id,
      name: user.name,
      slug: user.slug,
      roles: user.roles
    };

  } catch (error) {
    console.error("Validation Error:", error);
    throw error;
  }
};

export const fetchProductBySku = async (sku: string, config: WooConfig): Promise<Product | null> => {
  if (!config.url || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Faltan credenciales de WooCommerce");
  }

  const baseUrl = config.url.replace(/\/$/, "");
  
  try {
    const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
      method: 'GET',
      headers: getAuthHeaders(config)
    });

    if (!response.ok) {
      throw new Error(`Error en API: ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const wooProd = data[0];
      
      // Prefer short description, fallback to full description
      const rawDesc = wooProd.short_description || wooProd.description || "";
      
      return {
        id: String(wooProd.id),
        sku: wooProd.sku || sku,
        name: wooProd.name,
        price: parseFloat(wooProd.regular_price || "0"),
        salePrice: wooProd.sale_price ? parseFloat(wooProd.sale_price) : undefined,
        description: cleanHtml(rawDesc).slice(0, 150), // Clean HTML and limit length initially
        category: wooProd.categories?.[0]?.name
      };
    }
    
    return null;
  } catch (error) {
    console.error("WooCommerce Fetch Error:", error);
    throw error;
  }
};