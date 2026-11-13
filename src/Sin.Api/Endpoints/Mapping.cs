using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;

namespace Sin.Api.Endpoints;

public static class Mapping
{
    public static string? PhotoUrl(this HttpRequest req, string? file) =>
        file is null ? null : req.HttpContext.RequestServices.GetRequiredService<IPhotoStore>().Url(file, req);

    public static ProfileDto ToDto(this User u, HttpRequest req) => new(
        u.Id,
        u.DisplayName,
        u.Age,
        u.Gender,
        u.InterestedIn,
        u.Headline,
        req.PhotoUrl(u.PhotoFile),
        u.Flaws.OrderBy(f => f.CreatedAt).Select(f => f.ToDto()).ToList());

    public static FlawDto ToDto(this Flaw f) => new(f.Id, f.Category, f.Text);

    public static MessageDto ToDto(this Message m) => new(m.Id, m.SenderId, m.Text, m.SentAt);

    public static IResult Error(string message, int status = StatusCodes.Status400BadRequest) =>
        Results.Json(new ErrorResponse(message), statusCode: status);
}
