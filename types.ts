export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  salePrice?: number;
  description: string;
  category?: string;
}

export interface TagConfig {
  layoutRows: number;
  layoutCols: number;
  showSku: boolean;
  showDescription: boolean;
  showQRCode: boolean;
  showSalePrice: boolean;
  showCurrencySymbol: boolean;
  showBorder: boolean;
  accentColor: string;
  fontSizeTitle: number;
  fontSizePrice: number;
  fontSizeDesc: number;
  fontFamily: string;
  gap: number; // in mm
  padding: number; // in mm
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
  expiresAt: number; // Timestamp
}

export const DEFAULT_CONFIG: TagConfig = {
  layoutRows: 4,
  layoutCols: 2,
  showSku: true,
  showDescription: true,
  showQRCode: true,
  showSalePrice: true,
  showCurrencySymbol: true,
  showBorder: true,
  accentColor: '#000000',
  fontSizeTitle: 16,
  fontSizePrice: 32,
  fontSizeDesc: 10,
  fontFamily: 'Inter',
  gap: 2,
  padding: 5,
};

export const DEFAULT_WOO_CONFIG: WooConfig = {
  url: '',
  consumerKey: '',
  consumerSecret: ''
};