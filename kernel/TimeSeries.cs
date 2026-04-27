using System;
using System.Collections.Generic;
using System.Linq;

namespace SharpNoteKernel;

public enum FillMethod { ForwardFill, BackFill, Linear, Zero, Nan }

/// <summary>
/// Pure time-series helpers exposed as the <c>TimeSeries</c> global.
/// Mirrors the surface a notebook user reaches for when working with
/// regularly-sampled data: rolling windows, EMAs, gap-filling, and
/// resampling/aggregation.
/// </summary>
public static class TimeSeries
{
    /// <summary>
    /// Rolling-window aggregate. Output has the same length as input; the
    /// first <c>window-1</c> elements are <c>double.NaN</c> (insufficient
    /// data for a full window). <paramref name="fn"/> defaults to <see cref="Stats.Mean"/>.
    /// </summary>
    public static List<double> Rolling(
        IEnumerable<double> values, int window,
        Func<IEnumerable<double>, double>? fn = null)
    {
        if (window <= 0) throw new ArgumentOutOfRangeException(nameof(window), "window must be positive.");
        fn ??= Stats.Mean;
        var arr = values.ToArray();
        var result = new List<double>(arr.Length);
        for (int i = 0; i < arr.Length; i++)
        {
            if (i < window - 1) { result.Add(double.NaN); continue; }
            var slice = new double[window];
            Array.Copy(arr, i - window + 1, slice, 0, window);
            result.Add(fn(slice));
        }
        return result;
    }

    /// <summary>
    /// Exponential moving average. <paramref name="alpha"/> in (0, 1] —
    /// 1 means no smoothing (output equals input), values close to 0
    /// react slowly. The first output element is the first input value.
    /// </summary>
    public static List<double> EMA(IEnumerable<double> values, double alpha)
    {
        if (alpha <= 0 || alpha > 1) throw new ArgumentOutOfRangeException(nameof(alpha), "alpha must be in (0, 1].");
        var result = new List<double>();
        bool seeded = false;
        double prev = 0;
        foreach (var v in values)
        {
            if (!seeded) { prev = v; seeded = true; }
            else         { prev = alpha * v + (1 - alpha) * prev; }
            result.Add(prev);
        }
        return result;
    }

    /// <summary>
    /// Inserts entries at every <paramref name="interval"/> between the
    /// first and last timestamp that aren't already covered. The original
    /// samples are preserved verbatim; only the missing slots are filled
    /// according to <paramref name="method"/>.
    /// </summary>
    public static List<(DateTime Time, double Value)> FillGaps(
        IEnumerable<(DateTime Time, double Value)> series,
        TimeSpan interval,
        FillMethod method = FillMethod.ForwardFill)
    {
        if (interval <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(interval), "interval must be positive.");
        var sorted = series.OrderBy(p => p.Time).ToList();
        if (sorted.Count == 0) return new();

        var result = new List<(DateTime Time, double Value)>();
        for (int i = 0; i < sorted.Count - 1; i++)
        {
            result.Add(sorted[i]);
            var (t0, v0) = sorted[i];
            var (t1, v1) = sorted[i + 1];
            for (var t = t0 + interval; t < t1; t += interval)
            {
                double fill = method switch
                {
                    FillMethod.ForwardFill => v0,
                    FillMethod.BackFill    => v1,
                    FillMethod.Zero        => 0,
                    FillMethod.Nan         => double.NaN,
                    FillMethod.Linear      => v0 + (v1 - v0) * ((t - t0).TotalMilliseconds / (t1 - t0).TotalMilliseconds),
                    _                      => v0,
                };
                result.Add((t, fill));
            }
        }
        result.Add(sorted[^1]);
        return result;
    }

    /// <summary>
    /// Buckets <paramref name="series"/> into fixed-width <paramref name="interval"/>
    /// windows aligned to the first sample, aggregating each bucket via
    /// <paramref name="agg"/> (default <see cref="Stats.Mean"/>). Empty
    /// buckets are dropped from the output.
    /// </summary>
    public static List<(DateTime Time, double Value)> Resample(
        IEnumerable<(DateTime Time, double Value)> series,
        TimeSpan interval,
        Func<IEnumerable<double>, double>? agg = null)
    {
        if (interval <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(interval), "interval must be positive.");
        agg ??= Stats.Mean;
        var sorted = series.OrderBy(p => p.Time).ToList();
        if (sorted.Count == 0) return new();

        var origin   = sorted[0].Time;
        var buckets  = new SortedDictionary<long, List<double>>();
        long ticks   = interval.Ticks;
        foreach (var (t, v) in sorted)
        {
            long b = (t - origin).Ticks / ticks;
            if (!buckets.TryGetValue(b, out var list)) buckets[b] = list = new();
            list.Add(v);
        }
        return buckets
            .Select(kv => (Time: origin + TimeSpan.FromTicks(kv.Key * ticks), Value: agg(kv.Value)))
            .ToList();
    }
}
