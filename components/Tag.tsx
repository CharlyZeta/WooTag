
import React from 'react';
import { Product, TagConfig } from '../types';
import { QRCodeSVG } from 'qrcode.react';

interface TagProps {
  product: Product;
  config: TagConfig;
}

export const Tag: React.FC<TagProps> = ({ product, config }) => {
  const hasSale = config.showSalePrice && product.salePrice && product.salePrice < product.price;
  
  const formatPrice = (price: number | undefined) => {
    if (price === undefined) return '';
    const val = config.showDecimals ? price.toFixed(2) : Math.round(price).toFixed(0);
    return config.showCurrencySymbol ? `$${val}` : val;
  };

  const calculateCustomPrice = () => {
    const base = config.customPriceBase === 'sale' && hasSale ? (product.salePrice || 0) : product.price;
    return base * (1 + config.customPricePercent / 100);
  };

  const CustomPriceBlock = () => (
    <div className="flex flex-col">
      <span style={{ fontSize: `${config.fontSizeCustomLabel}px`, color: config.colorCustomLabel, lineHeight: 1 }}>
        {config.customPriceLabel}
      </span>
      <span style={{ fontSize: `${config.fontSizeCustomPrice}px`, color: config.colorCustomPrice, fontWeight: 'bold', lineHeight: 1.1 }}>
        {formatPrice(calculateCustomPrice())}
      </span>
    </div>
  );

  return (
    <div 
      className={`relative flex flex-col justify-between bg-white overflow-hidden h-full w-full`}
      style={{
        padding: `${config.padding}mm`,
        border: config.showBorder ? `1px dashed ${config.colorBorder}` : 'none',
        fontFamily: config.fontFamily
      }}
    >
      <div className="flex flex-col gap-1 h-full">
        <div>
          {config.showTitle && (
            <h3 className="font-bold leading-tight" style={{ fontSize: `${config.fontSizeTitle}px`, color: config.colorTitle }}>
              {product.name}
            </h3>
          )}
          {config.showSku && (
            <span className="text-gray-400 text-[10px] font-mono">SKU: {product.sku}</span>
          )}
        </div>

        {config.showImage && product.image && (
           <div className="flex justify-center my-1">
             <img 
               src={product.image} 
               alt={product.name}
               className="object-contain"
               style={{ height: `${config.imageSize}px`, maxHeight: '35%' }} 
             />
           </div>
        )}

        {config.showDescription && (
          <div className="flex-grow mt-1 overflow-hidden">
            <p className="leading-snug" style={{ fontSize: `${config.fontSizeDesc}px`, color: config.colorDesc }}>
              {product.description}
            </p>
          </div>
        )}

        <div className="flex items-end justify-between mt-auto pt-2 border-t border-gray-100">
          <div className="flex flex-col gap-1">
            {config.showCustomPrice && config.customPricePosition === 'top' && <CustomPriceBlock />}
            
            <div className="flex flex-col">
              {hasSale && (
                <span className="text-gray-400 line-through leading-none mb-1" style={{ fontSize: `${config.fontSizeDesc}px` }}>
                  {formatPrice(product.price)}
                </span>
              )}
              <span className="font-black leading-none" style={{ 
                fontSize: `${hasSale ? config.fontSizeSalePrice : config.fontSizePrice}px`, 
                color: hasSale ? config.colorSalePrice : config.colorPrice 
              }}>
                {formatPrice(hasSale ? product.salePrice : product.price)}
              </span>
            </div>

            {config.showCustomPrice && config.customPricePosition === 'bottom' && <CustomPriceBlock />}
          </div>

          {config.showQRCode && (
            <div className="flex-shrink-0 ml-2">
              <QRCodeSVG 
                value={`SKU:${product.sku}`} 
                size={config.qrSize} 
                fgColor={config.colorAccent}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
