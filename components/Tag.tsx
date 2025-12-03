import React from 'react';
import { Product, TagConfig } from '../types';
import { QRCodeSVG } from 'qrcode.react';

interface TagProps {
  product: Product;
  config: TagConfig;
}

export const Tag: React.FC<TagProps> = ({ product, config }) => {
  const hasSale = config.showSalePrice && product.salePrice && product.salePrice < product.price;
  const displayPrice = hasSale ? product.salePrice : product.price;

  const formatPrice = (price: number | undefined) => {
    if (price === undefined) return '';
    return config.showCurrencySymbol ? `$${price.toFixed(2)}` : price.toFixed(2);
  };

  return (
    <div 
      className={`relative flex flex-col justify-between bg-white overflow-hidden h-full w-full`}
      style={{
        padding: `${config.padding}mm`,
        border: config.showBorder ? '1px dashed #cbd5e1' : 'none',
        fontFamily: config.fontFamily
      }}
    >
      {/* Header: Name and SKU */}
      <div className="flex flex-col gap-1">
        <h3 
          className="font-bold leading-tight text-gray-900"
          style={{ fontSize: `${config.fontSizeTitle}px` }}
        >
          {product.name}
        </h3>
        {config.showSku && (
          <span className="text-gray-500 text-xs font-mono">SKU: {product.sku}</span>
        )}
      </div>

      {/* Body: Description */}
      {config.showDescription && (
        <div className="flex-grow mt-2 overflow-hidden">
          <p 
            className="text-gray-600 leading-snug"
            style={{ fontSize: `${config.fontSizeDesc}px` }}
          >
            {product.description}
          </p>
        </div>
      )}

      {/* Footer: Price and QR */}
      <div className="flex items-end justify-between mt-2 pt-2 border-t border-gray-100">
        <div>
          {hasSale && (
            <span className="text-gray-400 line-through text-sm block">
              {formatPrice(product.price)}
            </span>
          )}
          <div 
            className="font-black tracking-tight"
            style={{ 
              fontSize: `${config.fontSizePrice}px`,
              color: hasSale ? '#ef4444' : config.accentColor 
            }}
          >
            {formatPrice(displayPrice)}
          </div>
        </div>

        {config.showQRCode && (
          <div className="flex-shrink-0">
            <QRCodeSVG 
              value={`SKU:${product.sku}`} 
              size={config.fontSizePrice + 10} 
              fgColor={config.accentColor}
            />
          </div>
        )}
      </div>
    </div>
  );
};