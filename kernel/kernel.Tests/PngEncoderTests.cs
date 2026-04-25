using System;
using System.IO;
using SharpNoteKernel;
using Xunit;

namespace SharpNoteKernel.Tests;

public class PngEncoderTests
{
    [Fact]
    public void EncodesValidPngSignatureAndIhdr()
    {
        int w = 4, h = 4;
        var rgb = new byte[w * h * 3];
        for (int i = 0; i < w * h; i++) { rgb[i*3] = 255; rgb[i*3+1] = 0; rgb[i*3+2] = 0; }

        var png = PngEncoder.Encode(rgb, w, h);

        // PNG signature
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, png[..8]);

        // IHDR chunk length must be exactly 13
        Assert.Equal(0, png[8]);
        Assert.Equal(0, png[9]);
        Assert.Equal(0, png[10]);
        Assert.Equal(13, png[11]);

        // IHDR type
        Assert.Equal((byte)'I', png[12]);
        Assert.Equal((byte)'H', png[13]);
        Assert.Equal((byte)'D', png[14]);
        Assert.Equal((byte)'R', png[15]);

        // Width / height (big-endian) at offsets 16-23
        Assert.Equal(w, (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19]);
        Assert.Equal(h, (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23]);

        // Bit depth, color type, compression, filter, interlace (one byte each)
        Assert.Equal(8, png[24]);  // bit depth
        Assert.Equal(2, png[25]);  // color type: RGB
        Assert.Equal(0, png[26]);  // compression
        Assert.Equal(0, png[27]);  // filter
        Assert.Equal(0, png[28]);  // interlace
    }

    [Fact]
    public void EncodesLargeImageAndWritesArtifact()
    {
        int w = 200, h = 150;
        var rgb = new byte[w * h * 3];
        for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
        {
            int i = (y * w + x) * 3;
            rgb[i]   = (byte)((x * 255) / w);
            rgb[i+1] = (byte)((y * 255) / h);
            rgb[i+2] = 128;
        }
        var png = PngEncoder.Encode(rgb, w, h);
        File.WriteAllBytes("/tmp/test_png_large.png", png);

        // IHDR length must be 13
        Assert.Equal(13, (png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]);
        // Width/height in IHDR
        Assert.Equal(w, (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19]);
        Assert.Equal(h, (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23]);
        Assert.Equal(8, png[24]);
        Assert.Equal(2, png[25]);
    }

    [Fact]
    public void DecodesBackToOriginalPixelsViaSystemDrawing()
    {
        int w = 3, h = 2;
        var rgb = new byte[]
        {
            255,0,0,   0,255,0,   0,0,255,
            128,128,128, 64,200,32, 200,32,64,
        };

        var png = PngEncoder.Encode(rgb, w, h);

        // Round-trip via DeflateStream/zlib to ensure IDAT decompresses correctly.
        // Locate IDAT chunk
        int p = 8;
        byte[]? idat = null;
        while (p < png.Length)
        {
            int len = (png[p] << 24) | (png[p+1] << 16) | (png[p+2] << 8) | png[p+3];
            string type = System.Text.Encoding.ASCII.GetString(png, p+4, 4);
            if (type == "IDAT") { idat = png[(p+8)..(p+8+len)]; break; }
            p += 8 + len + 4;
        }
        Assert.NotNull(idat);
        // Strip 2-byte zlib header and 4-byte adler trailer
        var deflateBytes = idat![2..^4];
        using var ms = new MemoryStream(deflateBytes);
        using var ds = new System.IO.Compression.DeflateStream(ms, System.IO.Compression.CompressionMode.Decompress);
        using var outMs = new MemoryStream();
        ds.CopyTo(outMs);
        var raw = outMs.ToArray();
        // Each row: 1 filter byte + width*3 pixel bytes
        Assert.Equal(h * (1 + w * 3), raw.Length);
        for (int y = 0; y < h; y++)
        {
            Assert.Equal(0, raw[y * (1 + w * 3)]); // filter byte
            for (int i = 0; i < w * 3; i++)
                Assert.Equal(rgb[y * w * 3 + i], raw[y * (1 + w * 3) + 1 + i]);
        }
    }
}
