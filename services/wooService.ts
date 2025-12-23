
import { Product, WooConfig, WpUser, WooCategory } from '../types';

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

const makeWooRequest = async (endpoint: string, config: WooConfig): Promise<Response> => {
  let baseUrl = config.url.trim().replace(/\/$/, "");
  if (baseUrl.endsWith('/wp-json')) {
    baseUrl = baseUrl.substring(0, baseUrl.length - 8);
  }

  const url = `${baseUrl}${endpoint}`;
  
  let response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(config)
  });

  if (response.status === 401 || response.status === 403) {
    const separator = url.includes('?') ? '&' : '?';
    const fallbackUrl = `${url}${separator}consumer_key=${config.consumerKey}&consumer_secret=${config.consumerSecret}`;
    response = await fetch(fallbackUrl, { method: 'GET' });
  }

  return response;
};

export const validateConnection = async (config: WooConfig): Promise<WpUser> => {
  if (!config.url || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Por favor completa todos los campos.");
  }
  try {
    let response = await makeWooRequest('/wp-json/wp/v2/users/me?context=edit', config);
    if (response.ok) {
        const user = await response.json();
        const allowedRoles = ['administrator', 'shop_manager'];
        const hasPermission = user.roles && user.roles.some((r: string) => allowedRoles.includes(r));
        if (!hasPermission) throw new Error("El usuario no tiene permisos suficientes.");
        return { id: user.id, name: user.name, slug: user.slug, roles: user.roles };
    }
    response = await makeWooRequest('/wp-json/wc/v3/products?per_page=1', config);
    if (response.ok) return { id: 0, name: 'Gestor Tienda', slug: 'shop_manager', roles: ['shop_manager'] };
    throw new Error("Credenciales inválidas.");
  } catch (error: any) {
    throw error;
  }
};

export const fetchCategories = async (config: WooConfig): Promise<WooCategory[]> => {
  const response = await makeWooRequest('/wp-json/wc/v3/products/categories?per_page=100&hide_empty=true', config);
  if (!response.ok) return [];
  return await response.json();
};

const mapWooProduct = (wooProd: any): Product => ({
  id: String(wooProd.id),
  sku: wooProd.sku || String(wooProd.id),
  name: wooProd.name,
  price: parseFloat(wooProd.regular_price || "0"),
  salePrice: wooProd.sale_price ? parseFloat(wooProd.sale_price) : undefined,
  description: cleanHtml(wooProd.short_description || wooProd.description || "").slice(0, 150),
  image: wooProd.images && wooProd.images.length > 0 ? wooProd.images[0].src : undefined,
  stockQuantity: wooProd.stock_quantity,
  manageStock: wooProd.manage_stock
});

export const fetchProductsByCategory = async (categoryId: number, config: WooConfig): Promise<Product[]> => {
  const response = await makeWooRequest(`/wp-json/wc/v3/products?category=${categoryId}&per_page=100&status=publish`, config);
  if (!response.ok) return [];
  const data = await response.json();
  return data.map(mapWooProduct);
};

export const fetchProductBySku = async (sku: string, config: WooConfig): Promise<Product | null> => {
  const response = await makeWooRequest(`/wp-json/wc/v3/products?sku=${sku}`, config);
  if (!response.ok) return null;
  const data = await response.json();
  if (Array.isArray(data) && data.length > 0) {
    return mapWooProduct(data[0]);
  }
  return null;
};
