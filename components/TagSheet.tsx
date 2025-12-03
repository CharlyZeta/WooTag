import React from 'react';
import { Product, TagConfig } from '../types';
import { Tag } from './Tag';

interface TagSheetProps {
  products: Product[];
  config: TagConfig;
}

export const TagSheet: React.FC<TagSheetProps> = ({ products, config }) => {
  // Calculate total cells needed (rows * cols)
  const itemsPerPage = config.layoutRows * config.layoutCols;
  
  // We only render one page for this demo, or up to the max that fits.
  // In a full production app, you would map over chunks of products to create multiple pages.
  const displayProducts = products.slice(0, itemsPerPage);
  
  // If we have fewer products than slots, fill with empties to maintain grid structure?
  // Or just let them render. Grid handles it.

  // A4 Dimensions: 210mm x 297mm
  return (
    <div 
      className="bg-white shadow-lg mx-auto overflow-hidden relative print:shadow-none"
      style={{
        width: '210mm',
        height: '297mm',
        display: 'grid',
        gridTemplateColumns: `repeat(${config.layoutCols}, 1fr)`,
        gridTemplateRows: `repeat(${config.layoutRows}, 1fr)`,
        gap: `${config.gap}mm`,
        padding: '10mm', // Safe margin for printers
        boxSizing: 'border-box'
      }}
    >
      {displayProducts.map((product) => (
        <div key={product.id} className="w-full h-full overflow-hidden">
          <Tag product={product} config={config} />
        </div>
      ))}
      
      {/* Fill empty spots if needed for visuals, though grid handles whitespace naturally */}
      {Array.from({ length: Math.max(0, itemsPerPage - displayProducts.length) }).map((_, i) => (
         <div key={`empty-${i}`} className="border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">
           Espacio disponible
         </div>
      ))}
    </div>
  );
};