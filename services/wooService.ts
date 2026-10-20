
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

const validateHttpsUrl = (url: string): void => {
  if (!url || typeof url !== 'string') return;
  try {
    const parsed = new URL(url.trim());
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) {
      throw new Error("Se requiere una conexión segura (HTTPS) para conectar con WooCommerce.");
    }
  } catch (err: any) {
    if (err.message && err.message.includes("HTTPS")) throw err;
    throw new Error("URL de tienda inválida. Asegúrate de incluir el protocolo (ej: https://mitienda.com)");
  }
};

const makeWooRequest = async (endpoint: string, config: WooConfig): Promise<Response> => {
  validateHttpsUrl(config.url);

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
  validateHttpsUrl(config.url);
  try {
    // 1. Try to fetch a product first (Primary Check for WooCommerce API)
    // This is more reliable than wp/v2/users/me which is often blocked or restricted
    const productResponse = await makeWooRequest('/wp-json/wc/v3/products?per_page=1', config);

    if (productResponse.ok) {
      // Connection successful! Use default user profile.
      // We skip fetching specific user details (wp/v2/users/me) because it often triggers 401 errors
      // on secured sites, causing unnecessary alarm in the console.
      return { id: 0, name: 'Gestor Tienda', slug: 'shop_manager', roles: ['shop_manager'] };
    }

    // If we're here, product fetch failed.
    throw new Error("Credenciales inválidas o acceso denegado a Productos.");
  } catch (error: any) {
    console.error("Connection error:", error);
    throw error;
  }
};

export const fetchCategories = async (config: WooConfig): Promise<WooCategory[]> => {
  // Bug 7 fix: paginate to fetch all categories, not just the first 100
  const allCategories: WooCategory[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await makeWooRequest(
      `/wp-json/wc/v3/products/categories?per_page=100&hide_empty=true&page=${page}`,
      config
    );
    if (!response.ok) break;
    const data: WooCategory[] = await response.json();
    allCategories.push(...data);
    totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    page++;
  } while (page <= totalPages);

  return allCategories;
};

export const isPriceDeterminable = (wooProd: any): boolean => {
  if (wooProd.type === 'variable') {
    return false;
  }
  const regularPrice = parseFloat(wooProd.regular_price);
  return !isNaN(regularPrice) && regularPrice > 0;
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
  manageStock: wooProd.manage_stock,
  sourceId: Number(wooProd.id)
});

export const fetchProductsByCategory = async (categoryId: number, config: WooConfig): Promise<Product[]> => {
  console.log(`[WooTag] Fetching category ${categoryId}...`);
  const allProducts: Product[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await makeWooRequest(
      `/wp-json/wc/v3/products?category=${categoryId}&status=publish&per_page=100&page=${page}`,
      config
    );
    if (!response.ok) {
      console.error(`[WooTag] Category fetch failed on page ${page}: ${response.status}`);
      throw new Error(`Error al obtener productos de la categoría ${categoryId} (página ${page}): ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (isPriceDeterminable(item)) {
          allProducts.push(mapWooProduct(item));
        } else {
          console.warn(`[WooTag] Omitiendo producto ${item.sku || item.id} ("${item.name}") por precio no determinable o variable.`);
        }
      }
    }
    totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    page++;
  } while (page <= totalPages);

  console.log(`[WooTag] Found ${allProducts.length} total products in category ${categoryId}.`);
  return allProducts;
};

export const fetchProductBySku = async (sku: string, config: WooConfig): Promise<Product | null> => {
  console.log(`[WooTag] Searching SKU: ${sku}`);
  // Bug 1 fix: add status=publish to avoid returning drafts; FIX-0008: encode sku
  const response = await makeWooRequest(`/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&status=publish`, config);
  if (!response.ok) {
    console.error(`[WooTag] SKU fetch failed: ${response.status}`);
    return null;
  }
  const data = await response.json();
  console.log(`[WooTag] SKU Search Result:`, data);
  if (Array.isArray(data) && data.length > 0) {
    const rawProd = data[0];
    if (!isPriceDeterminable(rawProd)) {
      throw new Error(`El producto "${sku}" tiene un precio no determinable o es de tipo variable.`);
    }
    return mapWooProduct(rawProd);
  }
  console.warn(`[WooTag] SKU not found (empty array)`);
  return null;
};

export const fetchProductsByName = async (query: string, config: WooConfig): Promise<Product[]> => {
  if (!query || query.trim().length < 2) return [];
  const encoded = encodeURIComponent(query.trim());
  const response = await makeWooRequest(
    `/wp-json/wc/v3/products?search=${encoded}&status=publish&per_page=10`,
    config
  );
  if (!response.ok) return [];
  const data = await response.json();
  if (Array.isArray(data)) {
    return data
      .filter(item => {
        if (!isPriceDeterminable(item)) {
          console.warn(`[WooTag] Omitiendo producto ${item.sku || item.id} ("${item.name}") por precio no determinable o variable.`);
          return false;
        }
        return true;
      })
      .map(mapWooProduct);
  }
  return [];
};

export interface CatalogProductSummary {
  id: number;
  sku: string;
  name: string;
  regularPrice: number;
  salePrice: number | null;
  product: Product;
}

export const fetchAllCatalogProducts = async (
  config: WooConfig,
  onProgress?: (loaded: number, totalPages: number) => void
): Promise<CatalogProductSummary[]> => {
  const allSummaries: CatalogProductSummary[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await makeWooRequest(
      `/wp-json/wc/v3/products?status=publish&per_page=100&page=${page}`,
      config
    );
    if (!response.ok) {
      throw new Error(`Error al leer el catálogo de productos (página ${page}): ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (isPriceDeterminable(item)) {
          const mapped = mapWooProduct(item);
          const regularPrice = parseFloat(item.regular_price || "0");
          const salePrice = item.sale_price ? parseFloat(item.sale_price) : null;
          allSummaries.push({
            id: Number(item.id),
            sku: item.sku || String(item.id),
            name: item.name,
            regularPrice,
            salePrice,
            product: mapped
          });
        }
      }
    }
    totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
    if (onProgress) {
      onProgress(allSummaries.length, totalPages);
    }
    page++;
  } while (page <= totalPages);

  return allSummaries;
};
