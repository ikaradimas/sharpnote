import React from 'react';

export function ImageOutput({ spec }) {
  const { src, alt, width, height } = spec;
  return (
    <img
      className="output-image"
      src={src}
      alt={alt || ''}
      style={{
        maxWidth: width ? `${width}px` : '100%',
        ...(height ? { maxHeight: `${height}px` } : {}),
      }}
    />
  );
}
