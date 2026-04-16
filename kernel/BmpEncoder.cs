using System;

namespace SharpNoteKernel;

/// <summary>
/// Minimal BMP encoder for raw RGB pixel data. No external dependencies.
/// Produces uncompressed 24-bit BMP suitable for base64 data URIs in browsers.
/// </summary>
public static class BmpEncoder
{
    /// <summary>
    /// Encodes raw RGB bytes (3 bytes per pixel, row-major, top-to-bottom) to a BMP file.
    /// </summary>
    public static byte[] Encode(byte[] rgb, int width, int height)
    {
        int rowBytes = ((width * 3 + 3) / 4) * 4; // rows padded to 4-byte boundary
        int pad = rowBytes - width * 3;
        int dataSize = rowBytes * height;
        var bmp = new byte[54 + dataSize];

        // File header (14 bytes)
        bmp[0] = (byte)'B'; bmp[1] = (byte)'M';
        BitConverter.GetBytes(54 + dataSize).CopyTo(bmp, 2);  // file size
        BitConverter.GetBytes(54).CopyTo(bmp, 10);             // pixel data offset

        // DIB header (40 bytes — BITMAPINFOHEADER)
        BitConverter.GetBytes(40).CopyTo(bmp, 14);             // header size
        BitConverter.GetBytes(width).CopyTo(bmp, 18);
        BitConverter.GetBytes(height).CopyTo(bmp, 22);
        BitConverter.GetBytes((short)1).CopyTo(bmp, 26);       // color planes
        BitConverter.GetBytes((short)24).CopyTo(bmp, 28);      // bits per pixel
        BitConverter.GetBytes(dataSize).CopyTo(bmp, 34);       // image size

        // Pixel data (BMP stores bottom-to-top, BGR order)
        // Use Span for fast bulk processing
        var src = rgb.AsSpan();
        var dst = bmp.AsSpan(54);

        for (int y = 0; y < height; y++)
        {
            var srcRow = src.Slice((height - 1 - y) * width * 3, width * 3);
            var dstRow = dst.Slice(y * rowBytes, width * 3);
            // Swap RGB → BGR in bulk
            for (int x = 0; x < width; x++)
            {
                int s = x * 3, d = x * 3;
                dstRow[d]     = srcRow[s + 2]; // B
                dstRow[d + 1] = srcRow[s + 1]; // G
                dstRow[d + 2] = srcRow[s];     // R
            }
            // Padding bytes are already zero from array init
        }

        return bmp;
    }

    /// <summary>
    /// Encodes RGB bytes to a BMP and returns a base64 data URI ready for an img src.
    /// </summary>
    public static string EncodeBase64DataUri(byte[] rgb, int width, int height)
    {
        var bmp = Encode(rgb, width, height);
        return $"data:image/bmp;base64,{Convert.ToBase64String(bmp)}";
    }
}
