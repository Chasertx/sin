namespace Sin.Api.Services;

/// <summary>
/// The core rule of the app: no bragging. Rejects text that smells like a normal dating profile.
/// </summary>
public static class NegativityGuard
{
    private static readonly string[] Humblebrags =
    [
        "i'm amazing", "i am amazing", "i'm awesome", "i am awesome", "i'm a catch", "i am a catch",
        "i'm funny", "i am funny", "i'm loyal", "i am loyal", "i'm kind", "i am kind", "i'm smart",
        "i'm attractive", "i'm hot", "i'm successful", "i am successful", "great listener",
        "good listener", "love to travel", "love traveling", "wanderlust", "work hard play hard",
        "entrepreneur", "six pack", "6 pack", "perfectionist", "i care too much", "too nice",
        "too honest", "work too hard", "fluent in", "own my own", "own a house", "6 ft", "six foot",
        "gym rat", "fitness model", "high value", "alpha male", "i'm perfect", "i am perfect",
        "basically perfect", "everyone loves me", "i'm the best", "i am the best", "i'm great at", "i am great at",
        "i'm beautiful", "i'm gorgeous", "i'm handsome", "i'm rich", "no flaws", "flawless"
    ];

    /// <returns>An error message if the text is too positive, otherwise null.</returns>
    public static string? Check(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.ToLowerInvariant().Replace('’', '\'');
        var hit = Humblebrags.FirstOrDefault(t.Contains);
        return hit is null
            ? null
            : $"\"{hit}\" sounds suspiciously like a compliment. This is a no-bragging zone. Try something worse.";
    }
}
