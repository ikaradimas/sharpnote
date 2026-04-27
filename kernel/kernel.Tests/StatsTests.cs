using System;
using System.Linq;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace SharpNoteKernel.Tests;

public class StatsTests
{
    [Fact]
    public void Mean_BasicAndIgnoresNaN()
    {
        Stats.Mean(new[] { 1.0, 2.0, 3.0, 4.0 }).Should().Be(2.5);
        Stats.Mean(new[] { 1.0, double.NaN, 3.0 }).Should().Be(2.0);
    }

    [Fact]
    public void Mean_EmptyThrows()
    {
        var act = () => Stats.Mean(Array.Empty<double>());
        act.Should().Throw<InvalidOperationException>();
    }

    [Theory]
    [InlineData(new[] { 1.0, 2.0, 3.0 }, 2.0)]                 // odd
    [InlineData(new[] { 1.0, 2.0, 3.0, 4.0 }, 2.5)]            // even
    [InlineData(new[] { 5.0 }, 5.0)]                           // single
    public void Median_OddEvenSingle(double[] input, double expected)
    {
        Stats.Median(input).Should().Be(expected);
    }

    [Fact]
    public void Variance_SampleVsPopulationDifferByBesselCorrection()
    {
        var data = new[] { 2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0 }; // population σ² = 4
        Stats.Variance(data, sample: false).Should().BeApproximately(4.0, 1e-9);
        Stats.Variance(data, sample: true).Should().BeApproximately(32.0 / 7, 1e-9);
        Stats.StdDev(data, sample: false).Should().BeApproximately(2.0, 1e-9);
    }

    [Fact]
    public void Variance_SinglePointIsZero()
    {
        Stats.Variance(new[] { 7.0 }).Should().Be(0);
    }

    [Theory]
    [InlineData(0.0,  1.0)]
    [InlineData(0.5,  3.0)]    // median of {1,2,3,4,5}
    [InlineData(1.0,  5.0)]
    [InlineData(0.25, 2.0)]    // exactly the second order stat (linear interp)
    public void Quantile_KnownPoints(double p, double expected)
    {
        Stats.Quantile(new[] { 1.0, 2.0, 3.0, 4.0, 5.0 }, p).Should().BeApproximately(expected, 1e-9);
    }

    [Fact]
    public void Quantile_OutOfRangeThrows()
    {
        var act = () => Stats.Quantile(new[] { 1.0, 2.0 }, 1.5);
        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void Range_MaxMinusMin()
    {
        Stats.Range(new[] { -3.0, 1.0, 4.0, 1.0, 5.0 }).Should().Be(8.0);
    }

    [Fact]
    public void Histogram_BinCountsSumToInputSize()
    {
        var data = Enumerable.Range(0, 100).Select(i => (double)i);
        var hist = Stats.Histogram(data, 10);
        hist.Should().HaveCount(10);
        hist.Sum(b => b.Count).Should().Be(100);
        hist[0].LowerBound.Should().Be(0);
        hist[^1].UpperBound.Should().Be(99);
    }

    [Fact]
    public void Histogram_DegenerateAllSameValueCollapsesToOneBin()
    {
        var hist = Stats.Histogram(new[] { 4.2, 4.2, 4.2 }, 5);
        hist.Should().HaveCount(1);
        hist[0].Count.Should().Be(3);
    }

    [Fact]
    public void Correlation_PerfectAndAnti()
    {
        var xs = new[] { 1.0, 2.0, 3.0, 4.0, 5.0 };
        var ys = xs.Select(x => 2 * x + 7);
        Stats.Correlation(xs, ys).Should().BeApproximately( 1.0, 1e-9);
        Stats.Correlation(xs, xs.Select(x => -x)).Should().BeApproximately(-1.0, 1e-9);
    }

    [Fact]
    public void LinearFit_ExactLineHasR2OfOne()
    {
        var xs = new[] { 0.0, 1.0, 2.0, 3.0 };
        var ys = xs.Select(x => 2 * x + 3.0).ToArray();
        var (slope, intercept, r2) = Stats.LinearFit(xs, ys);
        slope.Should().BeApproximately(2.0, 1e-9);
        intercept.Should().BeApproximately(3.0, 1e-9);
        r2.Should().BeApproximately(1.0, 1e-9);
    }

    [Fact]
    public void LinearFit_ZeroVarianceXThrows()
    {
        var act = () => Stats.LinearFit(new[] { 5.0, 5.0, 5.0 }, new[] { 1.0, 2.0, 3.0 });
        act.Should().Throw<InvalidOperationException>();
    }
}
