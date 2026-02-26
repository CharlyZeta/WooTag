import React from 'react';
import { Product, TagConfig } from '../types';
import { Tag } from './Tag';

interface TagSheetProps {
  products: Product[];
  config: TagConfig;
}

export const TagSheet: React.FC<TagSheetProps> = ({ products, config }) => {
  const itemsPerPage = config.layoutRows * config.layoutCols;

  const pages = [];
  if (products.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < products.length; i += itemsPerPage) {
      pages.push(products.slice(i, i + itemsPerPage));
    }
  }

  return (
    <div className="flex flex-col gap-8 print:gap-0 print:block">
      {pages.map((pageProducts, pageIndex) => (
        <div
          key={pageIndex}
          className={`bg-white shadow-2xl mx-auto overflow-hidden relative print:shadow-none print:m-0 ${pageIndex < pages.length - 1 ? 'print:break-after-page' : ''}`}
          style={{
            width: '210mm',
            height: '297mm',
            display: 'grid',
            gridTemplateColumns: `repeat(${config.layoutCols}, 1fr)`,
            gridTemplateRows: `repeat(${config.layoutRows}, 1fr)`,
            gap: `${config.gap}mm`,
            padding: '10mm',
            boxSizing: 'border-box',
            pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'avoid'
          }}
        >
          {pageProducts.map((product) => (
            <div key={product.id} className="w-full h-full overflow-hidden">
              <Tag product={product} config={config} />
            </div>
          ))}

          {/* Relleno visual de rejilla para espacios vacíos */}
          {Array.from({ length: Math.max(0, itemsPerPage - pageProducts.length) }).map((_, i) => (
            <div
              key={`empty-${pageIndex}-${i}`}
              className="border border-dashed border-gray-100 flex items-center justify-center text-gray-200 text-xs print:border-gray-50"
            >
              {products.length === 0 ? 'Espacio para Etiqueta' : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};