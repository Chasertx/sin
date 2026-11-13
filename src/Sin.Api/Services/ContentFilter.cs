using System.Text;
using System.Text.RegularExpressions;

namespace Sin.Api.Services;

/// <summary>
/// Blocks abusive text (harassment, slurs, threats) in anything users can write.
/// Terms live in moderation-terms.txt (one per line, # for comments) so moderators can
/// extend the list without a code change. This is a first line of defense, not a full
/// moderation system; pair it with user reports and, at scale, an AI moderation API.
/// </summary>
public class ContentFilter
{
    private readonly Regex? _pattern;

    public ContentFilter(IEnumerable<string> terms)
    {
        var cleaned = terms
            .Select(t => t.Trim())
            .Where(t => t.Length > 0 && !t.StartsWith('#'))
            .Select(t => Normalize(t))
            .Distinct()
            .OrderByDescending(t => t.Length)
            .Select(t => Regex.Escape(t).Replace("\\ ", "\\s+"))
            .ToList();

        if (cleaned.Count > 0)
            _pattern = new Regex($@"(?<![\p{{L}}\p{{N}}])(?:{string.Join('|', cleaned)})(?![\p{{L}}\p{{N}}])",
                RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant,
                TimeSpan.FromMilliseconds(200));
    }

    public static ContentFilter FromFile(string path) =>
        new(File.Exists(path) ? File.ReadAllLines(path) : []);

    /// <returns>An error message if the text contains blocked content, otherwise null.</returns>
    public string? Check(string? text)
    {
        if (_pattern is null || string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            return _pattern.IsMatch(Normalize(text))
                ? "That crosses the line. Honest is great; abusive isn't allowed here."
                : null;
        }
        catch (RegexMatchTimeoutException)
        {
            return null;
        }
    }

    /// <summary>Lowercase and undo common character swaps (k1ll → kill, $lut → slut).</summary>
    internal static string Normalize(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var c in text.ToLowerInvariant())
        {
            sb.Append(c switch
            {
                '0' => 'o',
                '1' or '|' => 'i',
                '3' => 'e',
                '4' or '@' => 'a',
                '5' or '$' => 's',
                '7' => 't',
                '’' => '\'',
                _ => c,
            });
        }
        return sb.ToString();
    }
}
