using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;

namespace Sin.Api.Endpoints;

public static class Mapping
{
    public static string? PhotoUrl(this HttpRequest req, string? file) =>
        file is null ? null : req.HttpContext.RequestServices.GetRequiredService<IPhotoStore>().Url(file, req);

    /// <summary>Your own profile, including the parts nobody else is sent.</summary>
    public static ProfileDto ToDto(this User u, HttpRequest req) => new(
        u.Id,
        u.DisplayName,
        u.Age,
        u.Gender,
        u.InterestedIn,
        u.Headline,
        req.PhotoUrl(u.PhotoFile),
        u.Flaws.OrderBy(f => f.CreatedAt).Select(f => f.ToDto()).ToList(),
        u.HeightInches,
        u.Ethnicity);

    /// <summary>Someone else's profile as <paramref name="viewer"/> sees it: distance instead of location, no ethnicity.</summary>
    public static ProfileDto ToDtoFor(this User u, User viewer, HttpRequest req) =>
        u.ToDto(req) with { Ethnicity = null, DistanceMiles = UsGeo.MilesBetween(viewer, u) };

    public static FlawDto ToDto(this Flaw f) => new(f.Id, f.Category, f.Text);

    public static MessageDto ToDto(this Message m) => new(m.Id, m.SenderId, m.Text, m.SentAt);

    public static PreferencesDto ToPreferences(this User u) => new(
        u.PrefMinAge ?? Limits.MinAge,
        u.PrefMaxAge,
        u.PrefMaxDistanceMiles,
        u.PrefMinHeightInches,
        u.PrefMaxHeightInches,
        u.PreferredEthnicities());

    public static List<Ethnicity> PreferredEthnicities(this User u) =>
        (u.PrefEthnicities ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(name => Enum.TryParse<Ethnicity>(name, out var e) ? e : (Ethnicity?)null)
            .OfType<Ethnicity>()
            .ToList();

    public static IResult Error(string message, int status = StatusCodes.Status400BadRequest, string? code = null) =>
        Results.Json(new ErrorResponse(message, code), statusCode: status);

    /// <summary>
    /// The answer for someone who signed in with Google or Apple and hasn't finished signing up:
    /// until they give their age (18 or older) they can't browse or swipe.
    /// </summary>
    public static IResult ProfileRequired() =>
        Error("Finish setting up your profile first.", StatusCodes.Status403Forbidden, ErrorCodes.ProfileRequired);

    /// <summary>The answer for someone who hasn't shared a US location yet.</summary>
    public static IResult LocationRequired() =>
        Error("Ick is only available in the United States. Share your location to see who's nearby.",
            StatusCodes.Status403Forbidden, ErrorCodes.LocationRequired);
}
