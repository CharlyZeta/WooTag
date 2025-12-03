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

// Helper function to handle requests with fallback auth strategy
// 1. Try with Authorization Header (Standard)
// 2. If 401/403 (often stripped by shared hosting), try with Query Params
const makeWooRequest = async (endpoint: string, config: WooConfig): Promise<Response> => {
  let baseUrl = config.url.trim().replace(/\/$/, "");
  // Remove wp-json if user accidentally added it
  if (baseUrl.endsWith('/wp-json')) {
    baseUrl = baseUrl.substring(0, baseUrl.length - 8);
  }

  const url = `${baseUrl}${endpoint}`;
  
  // Attempt 1: Headers
  let response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(config)
  });

  // Attempt 2: Query Params (Fallback for server restrictions)
  if (response.status === 401 || response.status === 403) {
    const separator = url.includes('?') ? '&' : '?';
    const fallbackUrl = `${url}${separator}consumer_key=${config.consumerKey}&consumer_secret=${config.consumerSecret}`;
    
    response = await fetch(fallbackUrl, {
      method: 'GET'
    });
  }

  return response;
};

export const validateConnection = async (config: WooConfig): Promise<WpUser> => {
  if (!config.url || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Por favor completa todos los campos.");
  }

  try {
    // Strategy 1: Try to get specific User Info (Best case to identify Admin)
    let response = await makeWooRequest('/wp-json/wp/v2/users/me?context=edit', config);
    
    if (response.ok) {
        const user = await response.json();
        // Check capabilities
        const allowedRoles = ['administrator', 'shop_manager'];
        const hasPermission = user.roles && user.roles.some((r: string) => allowedRoles.includes(r));

        // If user exists but role is wrong (e.g. customer), throw error
        // Note: Sometimes keys are valid but this endpoint fails depending on key type.
        // We will proceed to Strategy 2 if this was a 401/403, but if it was 200 we trust it.
        if (!hasPermission) {
           // We do not throw immediately here, we might want to check if the keys work for products anyway.
           // But usually users/me returns the owner of the keys.
           // Let's enforce admin for this endpoint success path.
           throw new Error("El usuario detectado no tiene permisos de Administrador.");
        }

        return {
          id: user.id,
          name: user.name,
          slug: user.slug,
          roles: user.roles
        };
    }

    // Strategy 2: Fallback. 
    // If /users/me failed (401/403 or 404), it might be that the keys are strict Woo keys
    // that don't allow access to WP Core endpoints. 
    // We try to fetch 1 product. If that works, the keys are valid for our purpose.
    response = await makeWooRequest('/wp-json/wc/v3/products?per_page=1', config);
    
    if (response.ok) {
        // Success! The keys work for WooCommerce.
        // Return a generic user since we couldn't fetch real profile.
        return {
            id: 0,
            name: 'Gestor Tienda',
            slug: 'shop_manager',
            roles: ['shop_manager']
        };
    }
    
    if (response.status === 401 || response.status === 403) {
      throw new Error("Credenciales inválidas o permisos insuficientes.");
    }
    
    throw new Error(`Error de conexión: Servidor respondió ${response.status}`);

  } catch (error: any) {
    console.error("Validation Error:", error);
    // Clean up error message for UI
    const msg = error.message || "";
    if (msg.includes("Failed to fetch")) {
       throw new Error("No se pudo conectar al servidor. Verifica la URL y problemas de CORS/Red.");
    }
    throw error;
  }
};

export const fetchProductBySku = async (sku: string, config: WooConfig): Promise<Product | null> => {
  if (!config.url || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Faltan credenciales de WooCommerce");
  }

  try {
    const response = await makeWooRequest(`/wp-json/wc/v3/products?sku=${sku}`, config);

    if (!response.ok) {
      throw new Error(`Error en API: ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const wooProd = data[0];
      
      const rawDesc = wooProd.short_description || wooProd.description || "";
      
      return {
        id: String(wooProd.id),
        sku: wooProd.sku || sku,
        name: wooProd.name,
        price: parseFloat(wooProd.regular_price || "0"),
        salePrice: wooProd.sale_price ? parseFloat(wooProd.sale_price) : undefined,
        description: cleanHtml(rawDesc).slice(0, 150),
        category: wooProd.categories?.[0]?.name
      };
    }
    
    return null;
  } catch (error) {
    console.error("WooCommerce Fetch Error:", error);
    throw error;
  }
};