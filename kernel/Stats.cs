using System;
using System.Collections.Generic;
using System.Linq;

namespace SharpNoteKernel;

public record HistogramBin(double LowerBound, double UpperBound, int Count);

/// <summary>
/// Pure statistics helpers exposed as the <c>Stats</c> global. NaN values
/// are silently filtered from inputs; empty inputs throw
/// <see cref="InvalidOperationException"/> to match LINQ's
/// <c>.Average()</c> contract.
/// </summary>
public static class Stats
{
    public static double Mean(IEnumerable<double> source)
    {
        var (sum, count) = SumAndCount(source);
        if (count == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        return sum / count;
    }

    public static double Median(IEnumerable<double> source)
    {
        var sorted = Clean(source).OrderBy(x => x).ToArray();
        if (sorted.Length == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        int n = sorted.Length;
        return (n % 2 == 1) ? sorted[n / 2] : 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
    }

    public static double Variance(IEnumerable<double> source, bool sample = true)
    {
        var values = Clean(source).ToArray();
        if (values.Length == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        if (values.Length == 1) return 0;
        double mean = values.Average();
        double sumSq = 0;
        foreach (var v in values) { var d = v - mean; sumSq += d * d; }
        int divisor = sample ? values.Length - 1 : values.Length;
        return sumSq / divisor;
    }

    public static double StdDev(IEnumerable<double> source, bool sample = true) =>
        Math.Sqrt(Variance(source, sample));

    /// <summary>
    /// Quantile via linear interpolation between order statistics — same
    /// definition as NumPy's default. <paramref name="p"/> in [0, 1].
    /// </summary>
    public static double Quantile(IEnumerable<double> source, double p)
    {
        if (p < 0 || p > 1) throw new ArgumentOutOfRangeException(nameof(p), "p must be in [0, 1].");
        var sorted = Clean(source).OrderBy(x => x).ToArray();
        if (sorted.Length == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        if (sorted.Length == 1) return sorted[0];

        double pos = p * (sorted.Length - 1);
        int    lo  = (int)Math.Floor(pos);
        int    hi  = (int)Math.Ceiling(pos);
        if (lo == hi) return sorted[lo];
        double frac = pos - lo;
        return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
    }

    public static double Range(IEnumerable<double> source)
    {
        var values = Clean(source).ToArray();
        if (values.Length == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        return values.Max() - values.Min();
    }

    public static List<HistogramBin> Histogram(IEnumerable<double> source, int bins)
    {
        if (bins <= 0) throw new ArgumentOutOfRangeException(nameof(bins), "bins must be positive.");
        var values = Clean(source).ToArray();
        if (values.Length == 0) throw new InvalidOperationException("Sequence contains no non-NaN elements.");
        double min = values.Min(), max = values.Max();
        var result = new List<HistogramBin>(bins);
        if (min == max)
        {
            // Degenerate: all values identical → put them all in a single bin.
            result.Add(new HistogramBin(min, max, values.Length));
            return result;
        }
        double width = (max - min) / bins;
        var counts = new int[bins];
        foreach (var v in values)
        {
            int idx = (int)((v - min) / width);
            if (idx == bins) idx = bins - 1; // include max in the last bin
            counts[idx]++;
        }
        for (int i = 0; i < bins; i++)
            result.Add(new HistogramBin(min + i * width, min + (i + 1) * width, counts[i]));
        return result;
    }

    /// <summary>Pearson correlation coefficient.</summary>
    public static double Correlation(IEnumerable<double> xs, IEnumerable<double> ys)
    {
        var (x, y) = ZipClean(xs, ys);
        if (x.Length < 2) throw new InvalidOperationException("Need at least 2 paired non-NaN samples.");
        double mx = x.Average(), my = y.Average();
        double num = 0, denX = 0, denY = 0;
        for (int i = 0; i < x.Length; i++)
        {
            double dx = x[i] - mx, dy = y[i] - my;
            num  += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }
        double den = Math.Sqrt(denX * denY);
        return den == 0 ? 0 : num / den;
    }

    /// <summary>
    /// Ordinary least squares linear fit. Returns slope, intercept, and r²
    /// (the coefficient of determination — 1 indicates a perfect fit).
    /// </summary>
    public static (double Slope, double Intercept, double R2) LinearFit(
        IEnumerable<double> xs, IEnumerable<double> ys)
    {
        var (x, y) = ZipClean(xs, ys);
        if (x.Length < 2) throw new InvalidOperationException("Need at least 2 paired non-NaN samples.");
        double mx = x.Average(), my = y.Average();
        double sxy = 0, sxx = 0, syy = 0;
        for (int i = 0; i < x.Length; i++)
        {
            double dx = x[i] - mx, dy = y[i] - my;
            sxy += dx * dy;
            sxx += dx * dx;
            syy += dy * dy;
        }
        if (sxx == 0) throw new InvalidOperationException("xs has zero variance — cannot fit a line.");
        double slope     = sxy / sxx;
        double intercept = my - slope * mx;
        double r2        = syy == 0 ? 1.0 : (sxy * sxy) / (sxx * syy);
        return (slope, intercept, r2);
    }

    // ── internal ─────────────────────────────────────────────────────────────

    private static IEnumerable<double> Clean(IEnumerable<double> source) =>
        source.Where(v => !double.IsNaN(v));

    private static (double Sum, int Count) SumAndCount(IEnumerable<double> source)
    {
        double s = 0; int n = 0;
        foreach (var v in source) if (!double.IsNaN(v)) { s += v; n++; }
        return (s, n);
    }

    private static (double[] X, double[] Y) ZipClean(IEnumerable<double> xs, IEnumerable<double> ys)
    {
        var x = new List<double>();
        var y = new List<double>();
        using var ex = xs.GetEnumerator();
        using var ey = ys.GetEnumerator();
        while (ex.MoveNext() && ey.MoveNext())
        {
            if (!double.IsNaN(ex.Current) && !double.IsNaN(ey.Current))
            {
                x.Add(ex.Current);
                y.Add(ey.Current);
            }
        }
        return (x.ToArray(), y.ToArray());
    }
}
