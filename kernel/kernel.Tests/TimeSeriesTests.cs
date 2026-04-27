using System;
using System.Linq;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace SharpNoteKernel.Tests;

public class TimeSeriesTests
{
    [Fact]
    public void Rolling_DefaultMeanProducesSmoothedSeries()
    {
        var input = new[] { 1.0, 2.0, 3.0, 4.0, 5.0 };
        var output = TimeSeries.Rolling(input, 3);

        output.Should().HaveCount(5);
        double.IsNaN(output[0]).Should().BeTrue();
        double.IsNaN(output[1]).Should().BeTrue();
        output[2].Should().Be(2.0);  // mean(1,2,3)
        output[3].Should().Be(3.0);  // mean(2,3,4)
        output[4].Should().Be(4.0);  // mean(3,4,5)
    }

    [Fact]
    public void Rolling_WindowOfOneIsIdentity()
    {
        var input  = new[] { 7.0, 4.0, 9.0 };
        var output = TimeSeries.Rolling(input, 1);
        output.Should().Equal(input);
    }

    [Fact]
    public void Rolling_AcceptsCustomAggregator()
    {
        var input = new[] { 1.0, 2.0, 9.0, 4.0, 5.0 };
        var output = TimeSeries.Rolling(input, 3, Stats.Median);
        output[2].Should().Be(2.0);   // median(1,2,9)
        output[3].Should().Be(4.0);   // median(2,9,4)
        output[4].Should().Be(5.0);   // median(9,4,5)
    }

    [Fact]
    public void EMA_AlphaOneIsIdentity()
    {
        TimeSeries.EMA(new[] { 1.0, 2.0, 3.0 }, 1.0).Should().Equal(new[] { 1.0, 2.0, 3.0 });
    }

    [Fact]
    public void EMA_LowAlphaStaysCloseToFirstValue()
    {
        var output = TimeSeries.EMA(new[] { 10.0, 20.0, 30.0, 40.0 }, 0.05);
        // After 4 steps with alpha 0.05, the EMA is (1-0.95^3)*next inputs etc.
        // The headline: it should still be much closer to 10 than to 40.
        output[^1].Should().BeLessThan(20.0);
        output[0].Should().Be(10.0);
    }

    [Fact]
    public void FillGaps_InsertsMissingTimestamps_ForwardFillByDefault()
    {
        var t0 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var input = new[]
        {
            (Time: t0,                       Value: 10.0),
            (Time: t0.AddMinutes(3),         Value: 13.0),
        };
        var filled = TimeSeries.FillGaps(input, TimeSpan.FromMinutes(1));
        filled.Should().HaveCount(4);
        filled[0].Should().Be((t0,                  10.0));
        filled[1].Should().Be((t0.AddMinutes(1),    10.0)); // forward-filled
        filled[2].Should().Be((t0.AddMinutes(2),    10.0));
        filled[3].Should().Be((t0.AddMinutes(3),    13.0));
    }

    [Fact]
    public void FillGaps_LinearInterpolatesProportionally()
    {
        var t0 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var input = new[]
        {
            (Time: t0,                Value: 0.0),
            (Time: t0.AddMinutes(4),  Value: 8.0),
        };
        var filled = TimeSeries.FillGaps(input, TimeSpan.FromMinutes(1), FillMethod.Linear);
        filled.Select(p => p.Value).Should().Equal(new[] { 0.0, 2.0, 4.0, 6.0, 8.0 });
    }

    [Fact]
    public void Resample_BucketsAggregatesViaMeanByDefault()
    {
        var t0 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var input = new[]
        {
            (Time: t0.AddMinutes(0),  Value: 1.0),
            (Time: t0.AddMinutes(1),  Value: 3.0),  // same 5-min bucket as above
            (Time: t0.AddMinutes(5),  Value: 10.0), // next bucket
            (Time: t0.AddMinutes(6),  Value: 20.0),
            (Time: t0.AddMinutes(7),  Value: 30.0),
        };
        var resampled = TimeSeries.Resample(input, TimeSpan.FromMinutes(5));
        resampled.Should().HaveCount(2);
        resampled[0].Value.Should().Be(2.0);   // mean(1, 3)
        resampled[1].Value.Should().Be(20.0);  // mean(10, 20, 30)
    }

    [Fact]
    public void Resample_AcceptsCustomAggregator()
    {
        var t0 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var input = new[]
        {
            (Time: t0.AddMinutes(0), Value: 1.0),
            (Time: t0.AddMinutes(1), Value: 9.0),
            (Time: t0.AddMinutes(2), Value: 5.0),
        };
        var resampled = TimeSeries.Resample(input, TimeSpan.FromMinutes(5), xs => xs.Max());
        resampled.Should().HaveCount(1);
        resampled[0].Value.Should().Be(9.0);
    }
}
