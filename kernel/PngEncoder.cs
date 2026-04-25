using System;
using System.IO;
using System.IO.Compression;

namespace SharpNoteKernel;

/// <summary>
/// Minimal PNG encoder for raw RGB pixel data. No external dependencies.
/// Produces valid PNG files using unfiltered rows + deflate compression.
/// </summary>
public static class PngEncoder
{
    public static byte[] Encode(byte[] rgb, int width, int height)
    {
        using var ms = new MemoryStream();
        // PNG signature
        ms.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });

        // IHDR chunk
        WriteChunk(ms, "IHDR", w =>
        {
            WriteBE32(w, width);
            WriteBE32(w, height);
            w.Write((byte)8);  // bit depth
            w.Write((byte)2);  // color type: RGB
            w.Write((byte)0);  // compression
            w.Write((byte)0);  // filter
            w.Write((byte)0);  // interlace
        });

        // IDAT chunk — deflate-compressed scanlines
        WriteChunk(ms, "IDAT", w =>
        {
            using var deflateMs = new MemoryStream();
            // zlib header
            deflateMs.WriteByte(0x78);
            deflateMs.WriteByte(0x01);

            using (var deflate = new DeflateStream(deflateMs, CompressionLevel.Fastest, leaveOpen: true))
            {
                for (int y = 0; y < height; y++)
                {
                    deflate.WriteByte(0); // filter: None
                    deflate.Write(rgb, y * width * 3, width * 3);
                }
            }

            // Adler-32 checksum
            uint adler = Adler32(rgb, width, height);
            deflateMs.WriteByte((byte)(adler >> 24));
            deflateMs.WriteByte((byte)(adler >> 16));
            deflateMs.WriteByte((byte)(adler >> 8));
            deflateMs.WriteByte((byte)adler);

            deflateMs.Position = 0;
            deflateMs.CopyTo(w.BaseStream);
        });

        // IEND chunk
        WriteChunk(ms, "IEND", _ => { });

        return ms.ToArray();
    }

    public static string EncodeBase64DataUri(byte[] rgb, int width, int height)
    {
        var png = Encode(rgb, width, height);
        return $"data:image/png;base64,{Convert.ToBase64String(png)}";
    }

    private static void WriteChunk(Stream s, string type, Action<BinaryWriter> writeData)
    {
        using var dataMs = new MemoryStream();
        using (var bw = new BinaryWriter(dataMs, System.Text.Encoding.ASCII, leaveOpen: true))
            writeData(bw);
        var data = dataMs.ToArray();
        var typeBytes = System.Text.Encoding.ASCII.GetBytes(type);

        // Length (big-endian)
        var lenBytes = new byte[4];
        WriteBE32(lenBytes, data.Length);
        s.Write(lenBytes);

        // Type
        s.Write(typeBytes);

        // Data
        s.Write(data);

        // CRC32 over type + data
        uint crc = Crc32(typeBytes, data);
        var crcBytes = new byte[4];
        WriteBE32(crcBytes, (int)crc);
        s.Write(crcBytes);
    }

    private static void WriteBE32(BinaryWriter w, int value)
    {
        w.Write((byte)(value >> 24));
        w.Write((byte)(value >> 16));
        w.Write((byte)(value >> 8));
        w.Write((byte)value);
    }

    private static void WriteBE32(byte[] buf, int value, int offset = 0)
    {
        buf[offset]     = (byte)(value >> 24);
        buf[offset + 1] = (byte)(value >> 16);
        buf[offset + 2] = (byte)(value >> 8);
        buf[offset + 3] = (byte)value;
    }

    private static uint Adler32(byte[] rgb, int width, int height)
    {
        uint a = 1, b = 0;
        for (int y = 0; y < height; y++)
        {
            // Filter byte (0)
            a = (a + 0) % 65521;
            b = (b + a) % 65521;
            // Row pixels
            int offset = y * width * 3;
            for (int i = 0; i < width * 3; i++)
            {
                a = (a + rgb[offset + i]) % 65521;
                b = (b + a) % 65521;
            }
        }
        return (b << 16) | a;
    }

    // CRC32 with PNG polynomial
    private static readonly uint[] CrcTable = MakeCrcTable();
    private static uint[] MakeCrcTable()
    {
        var table = new uint[256];
        for (uint n = 0; n < 256; n++)
        {
            uint c = n;
            for (int k = 0; k < 8; k++)
                c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            table[n] = c;
        }
        return table;
    }

    private static uint Crc32(byte[] type, byte[] data)
    {
        uint crc = 0xFFFFFFFF;
        foreach (byte b in type) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        foreach (byte b in data) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc ^ 0xFFFFFFFF;
    }
}
