
export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  salePrice?: number;
  description: string;
  category?: string;
  image?: string;
  stockQuantity?: number | null;
  manageStock?: boolean;
}

export interface DesignProfile {
  id: string;
  name: string;
  config: TagConfig;
}

export interface TagConfig {
  layoutRows: number;
  layoutCols: number;
  
  // Visibility
  showTitle: boolean;
  showSku: boolean;
  showDescription: boolean;
  showQRCode: boolean;
  showSalePrice: boolean;
  showCurrencySymbol: boolean;
  showBorder: boolean;
  showImage: boolean;
  showDecimals: boolean;
  
  // Custom Price Field
  showCustomPrice: boolean;
  customPriceLabel: string;
  customPricePercent: number; // Positive or negative
  customPriceBase: 'regular' | 'sale'; // Calculation base
  customPricePosition: 'top' | 'bottom';

  // Colors
  colorTitle: string;
  colorPrice: string;
  colorSalePrice: string;
  colorCustomPrice: string;
  colorCustomLabel: string;
  colorDesc: string;
  colorBorder: string;
  colorAccent: string;

  // Typography & Sizing
  fontSizeTitle: number;
  fontSizePrice: number;
  fontSizeSalePrice: number;
  fontSizeCustomPrice: number;
  fontSizeCustomLabel: number;
  fontSizeDesc: number;
  fontFamily: string;
  imageSize: number;
  qrSize: number;

  // Spacing
  gap: number;
  padding: number;
}

export interface WooConfig {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WpUser {
  id: number;
  name: string;
  slug: string;
  roles: string[];
}

export interface AuthSession {
  user: WpUser;
  config: WooConfig;
  expiresAt: number;
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export const DEFAULT_CONFIG: TagConfig = {
  layoutRows: 4,
  layoutCols: 2,
  
  showTitle: true,
  showSku: true,
  showDescription: true,
  showQRCode: true,
  showSalePrice: true,
  showCurrencySymbol: true,
  showBorder: true,
  showImage: false,
  showDecimals: true,

  showCustomPrice: false,
  customPriceLabel: 'Precio Especial',
  customPricePercent: 10,
  customPriceBase: 'regular',
  customPricePosition: 'bottom',

  colorTitle: '#111827',
  colorPrice: '#000000',
  colorSalePrice: '#ef4444',
  colorCustomPrice: '#059669', // Emerald 600
  colorCustomLabel: '#6b7280',
  colorDesc: '#4b5563',
  colorBorder: '#cbd5e1',
  colorAccent: '#000000',

  fontSizeTitle: 16,
  fontSizePrice: 28,
  fontSizeSalePrice: 24,
  fontSizeCustomPrice: 20,
  fontSizeCustomLabel: 10,
  fontSizeDesc: 10,
  fontFamily: 'Inter',
  imageSize: 60,
  qrSize: 48,

  gap: 2,
  padding: 5,
};

export const DEFAULT_WOO_CONFIG: WooConfig = {
  url: '',
  consumerKey: '',
  consumerSecret: ''
};
