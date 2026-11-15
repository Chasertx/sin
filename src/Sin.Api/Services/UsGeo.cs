using Sin.Api.Data;

namespace Sin.Api.Services;

/// <summary>Ick is US-only: decides whether a shared location counts, and measures distances.</summary>
public static class UsGeo
{
    public const double MilesPerDegree = 69.0;
    private const double EarthRadiusMiles = 3958.8;

    /// <summary>The United States and its inhabited territories, as phones report them.</summary>
    private static readonly HashSet<string> UsCountryCodes = new(StringComparer.OrdinalIgnoreCase) { "US", "PR", "VI", "GU", "MP", "AS" };

    /// <summary>
    /// Generous rectangles around US soil. They overlap neighbours (southern Canada, northern Mexico),
    /// which is why the country the phone resolved is checked too; these catch everything else,
    /// including a phone that reports the wrong country.
    /// </summary>
    private static readonly (double South, double North, double West, double East)[] Boxes =
    [
        (24.4, 49.4, -125.0, -66.9),    // lower 48 and DC
        (51.0, 71.6, -180.0, -129.9),   // Alaska
        (51.0, 53.5, 172.0, 180.0),     // western Aleutians, across the date line
        (18.8, 22.4, -160.6, -154.7),   // Hawaii
        (17.6, 18.6, -68.0, -64.5),     // Puerto Rico and the US Virgin Islands
        (13.2, 20.6, 144.5, 146.2),     // Guam and the Northern Marianas
        (-14.6, -11.0, -171.2, -168.1), // American Samoa
    ];

    /// <param name="countryCode">What the phone's geocoder said, or null if it couldn't tell.</param>
    public static bool IsInUs(double latitude, double longitude, string? countryCode)
    {
        if (!double.IsFinite(latitude) || !double.IsFinite(longitude)) return false;
        if (!string.IsNullOrWhiteSpace(countryCode) && !UsCountryCodes.Contains(countryCode.Trim())) return false;
        return Boxes.Any(b => latitude >= b.South && latitude <= b.North && longitude >= b.West && longitude <= b.East);
    }

    /// <summary>Two decimal places is roughly a mile: enough for "12 miles away", not enough to find a house.</summary>
    public static (double Latitude, double Longitude) Coarsen(double latitude, double longitude) =>
        (Math.Round(latitude, 2), Math.Round(longitude, 2));

    /// <summary>Great-circle distance in miles.</summary>
    public static double MilesBetween(double lat1, double lng1, double lat2, double lng2)
    {
        static double Rad(double degrees) => degrees * Math.PI / 180;
        var dLat = Rad(lat2 - lat1);
        var dLng = Rad(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return 2 * EarthRadiusMiles * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    /// <summary>Whole miles between two people, never less than 1; null if either hasn't shared a location.</summary>
    public static int? MilesBetween(User a, User b) =>
        a.HasLocation && b.HasLocation
            ? Math.Max(1, (int)Math.Round(MilesBetween(a.Latitude!.Value, a.Longitude!.Value, b.Latitude!.Value, b.Longitude!.Value)))
            : null;
}

/// <summary>
/// Accounts that skip the location check (setting Location:BypassEmails, comma-separated). Meant for the
/// test login handed to App Store and Google Play reviewers, who are often outside the US or on a
/// device with no location: without this they could never get past Discover and the app is rejected.
/// </summary>
public class LocationBypass(IConfiguration config)
{
    private readonly HashSet<string> _emails = (config["Location:BypassEmails"] ?? "")
        .Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public bool Covers(User user) => _emails.Contains(user.Email);

    /// <summary>Puts a bypassed account in New York City if it has no location of its own.</summary>
    public void Place(User user)
    {
        if (user.HasLocation) return;
        user.Latitude = 40.71;
        user.Longitude = -74.01;
        user.LocatedAt = DateTime.UtcNow;
    }
}
