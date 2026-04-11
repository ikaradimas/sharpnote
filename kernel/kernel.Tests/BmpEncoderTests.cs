using System;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class BmpEncoderTests
{
    [Fact]
    public void Encode_ProducesValidBmpHeader()
    {
        var rgb = new byte[3 * 2 * 2]; // 2x2 black image
        var bmp = BmpEncoder.Encode(rgb, 2, 2);

        bmp[0].Should().Be((byte)'B');
        bmp[1].Should().Be((byte)'M');
        // File size = 54 header + pixel data
        var fileSize = BitConverter.ToInt32(bmp, 2);
        fileSize.Should().Be(bmp.Length);
        // Pixel data offset = 54
        BitConverter.ToInt32(bmp, 10).Should().Be(54);
        // Width and height
        BitConverter.ToInt32(bmp, 18).Should().Be(2);
        BitConverter.ToInt32(bmp, 22).Should().Be(2);
        // 24 bits per pixel
        BitConverter.ToInt16(bmp, 28).Should().Be(24);
    }

    [Fact]
    public void Encode_CorrectPixelData()
    {
        // 1x1 red pixel (R=255, G=0, B=0)
        var rgb = new byte[] { 255, 0, 0 };
        var bmp = BmpEncoder.Encode(rgb, 1, 1);

        // BMP stores BGR, pixel at offset 54
        bmp[54].Should().Be(0);     // B
        bmp[55].Should().Be(0);     // G
        bmp[56].Should().Be(255);   // R
    }

    [Fact]
    public void EncodeBase64DataUri_StartsWithDataPrefix()
    {
        var rgb = new byte[3]; // 1x1 black
        var uri = BmpEncoder.EncodeBase64DataUri(rgb, 1, 1);
        uri.Should().StartWith("data:image/bmp;base64,");
    }

    [Fact]
    public void Encode_RowPaddingTo4Bytes()
    {
        // 3x1 image: 3 pixels × 3 bytes = 9 bytes per row, padded to 12
        var rgb = new byte[3 * 3 * 1];
        var bmp = BmpEncoder.Encode(rgb, 3, 1);
        var rowBytes = ((3 * 3 + 3) / 4) * 4; // 12
        var expectedSize = 54 + rowBytes * 1;
        bmp.Length.Should().Be(expectedSize);
    }
}
