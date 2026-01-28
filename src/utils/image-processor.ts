/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Image processing utilities for token optimization.
 * Inspired by fast-playwright-mcp.
 */

import sharp from 'sharp';

import type {ImageOptions} from '../expectation.js';

export interface ImageSize {
  width: number;
  height: number;
}

export interface ProcessedImage {
  data: Buffer;
  mimeType: string;
  originalSize: ImageSize;
  processedSize: ImageSize;
  compressionRatio: number;
}

/**
 * Process an image with optional resizing and format conversion.
 * Returns the processed image buffer and metadata.
 */
export async function processImage(
  data: Uint8Array,
  mimeType: string,
  options?: ImageOptions,
): Promise<ProcessedImage> {
  const inputBuffer = Buffer.from(data);

  // Return original if no options provided
  if (!options || Object.keys(options).length === 0) {
    return processImageWithoutOptions(inputBuffer, mimeType);
  }

  try {
    // Get original metadata
    const originalMetadata = await sharp(inputBuffer).metadata();
    const originalSize: ImageSize = {
      width: originalMetadata.width || 0,
      height: originalMetadata.height || 0,
    };

    let image = sharp(inputBuffer);

    // Apply resizing if specified
    if (options.maxWidth || options.maxHeight) {
      image = image.resize(options.maxWidth, options.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Apply format and quality options
    let outputMimeType = mimeType;
    if (options.format) {
      const result = applyFormatConversion(
        image,
        options.format,
        options.quality,
      );
      image = result.image;
      outputMimeType = result.mimeType;
    } else if (options.quality) {
      image = applyQualityToExistingFormat(image, mimeType, options.quality);
    }

    // Process the image
    const processedBuffer = await image.toBuffer();
    const processedMetadata = await sharp(processedBuffer).metadata();

    const processedSize: ImageSize = {
      width: processedMetadata.width || originalSize.width,
      height: processedMetadata.height || originalSize.height,
    };

    // Calculate compression ratio
    const compressionRatio = processedBuffer.length / inputBuffer.length;

    return {
      data: processedBuffer,
      mimeType: outputMimeType,
      originalSize,
      processedSize,
      compressionRatio,
    };
  } catch (error) {
    throw new Error(
      `Image processing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Process image without options (return original with metadata).
 */
async function processImageWithoutOptions(
  data: Buffer,
  mimeType: string,
): Promise<ProcessedImage> {
  try {
    const metadata = await sharp(data).metadata();
    return {
      data,
      mimeType,
      originalSize: {
        width: metadata.width || 0,
        height: metadata.height || 0,
      },
      processedSize: {
        width: metadata.width || 0,
        height: metadata.height || 0,
      },
      compressionRatio: 1.0,
    };
  } catch {
    // If Sharp fails, return basic structure
    return {
      data,
      mimeType,
      originalSize: {width: 0, height: 0},
      processedSize: {width: 0, height: 0},
      compressionRatio: 1.0,
    };
  }
}

/**
 * Apply format conversion to image.
 */
function applyFormatConversion(
  image: sharp.Sharp,
  format: string,
  quality?: number,
): {image: sharp.Sharp; mimeType: string} {
  const outputMimeType = `image/${format}`;
  let processedImage = image;

  switch (format) {
    case 'jpeg':
      processedImage = image.jpeg({quality: quality || 80});
      break;
    case 'png':
      processedImage = image.png({quality: quality || 100});
      break;
    case 'webp':
      processedImage = image.webp({quality: quality || 80});
      break;
    default:
      // For unsupported formats, keep original
      break;
  }

  return {image: processedImage, mimeType: outputMimeType};
}

/**
 * Apply quality settings to existing format.
 */
function applyQualityToExistingFormat(
  image: sharp.Sharp,
  mimeType: string,
  quality: number,
): sharp.Sharp {
  if (mimeType.includes('jpeg')) {
    return image.jpeg({quality});
  }
  if (mimeType.includes('png')) {
    return image.png({quality});
  }
  if (mimeType.includes('webp')) {
    return image.webp({quality});
  }
  return image;
}
