using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] AllowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    private const long MaxPhotoBytes = 8 * 1024 * 1024;

    public static void MapProfileEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/me").WithTags("My profile").RequireAuthorization();

        g.MapGet("/", async (ClaimsPrincipal me, SinDb db, HttpRequest req) =>
        {
            var user = await db.Users.Include(u => u.Flaws).FirstOrDefaultAsync(u => u.Id == me.UserId());
            return user is null ? Results.NotFound() : Results.Ok(user.ToDto(req));
        });

        g.MapPut("/", async (UpdateProfileRequest r, ClaimsPrincipal me, SinDb db, HttpRequest req) =>
        {
            var user = await db.Users.Include(u => u.Flaws).FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(r.DisplayName) || r.DisplayName.Length > 50) return Error("Display name is required (max 50).");
            if (r.Age < 18 || r.Age > 120) return Error("You must be 18 or older.");
            var headline = string.IsNullOrWhiteSpace(r.Headline) ? null : r.Headline.Trim();
            if (headline?.Length > Limits.HeadlineMaxLength) return Error($"Headline max {Limits.HeadlineMaxLength} characters.");
            if (NegativityGuard.Check(headline) is { } brag) return Error(brag);

            user.DisplayName = r.DisplayName.Trim();
            user.Age = r.Age;
            user.Gender = r.Gender;
            user.InterestedIn = r.InterestedIn;
            user.Headline = headline;
            await db.SaveChangesAsync();
            return Results.Ok(user.ToDto(req));
        });

        g.MapPost("/photo", async (IFormFile file, ClaimsPrincipal me, SinDb db, HttpRequest req, IPhotoStore photos) =>
        {
            if (file.Length == 0 || file.Length > MaxPhotoBytes) return Error("Photo must be under 8 MB.");
            if (!AllowedImageTypes.Contains(file.ContentType)) return Error("Photo must be JPEG, PNG, WEBP or HEIC.");

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();

            var ext = file.ContentType.Split('/')[1].Replace("jpeg", "jpg");
            var name = $"{user.Id:N}-{DateTime.UtcNow.Ticks}.{ext}";
            await using (var stream = file.OpenReadStream())
                await photos.SaveAsync(name, stream, file.ContentType);

            if (user.PhotoFile is not null)
                await photos.DeleteAsync(user.PhotoFile);
            user.PhotoFile = name;
            await db.SaveChangesAsync();
            return Results.Ok(new PhotoUploadResponse(req.PhotoUrl(name)!));
        }).DisableAntiforgery();

        g.MapPost("/flaws", async (CreateFlawRequest r, ClaimsPrincipal me, SinDb db) =>
        {
            var text = r.Text?.Trim() ?? "";
            if (text.Length < Limits.FlawMinLength || text.Length > Limits.FlawMaxLength)
                return Error($"A flaw must be {Limits.FlawMinLength}-{Limits.FlawMaxLength} characters.");
            if (NegativityGuard.Check(text) is { } brag) return Error(brag);

            var userId = me.UserId();
            if (await db.Flaws.CountAsync(f => f.UserId == userId) >= Limits.MaxFlaws)
                return Error($"Max {Limits.MaxFlaws} flaws. Nobody needs to know that much.");

            var flaw = new Flaw { UserId = userId, Category = r.Category, Text = text };
            db.Flaws.Add(flaw);
            await db.SaveChangesAsync();
            return Results.Ok(flaw.ToDto());
        });

        g.MapDelete("/flaws/{id:guid}", async (Guid id, ClaimsPrincipal me, SinDb db) =>
        {
            var deleted = await db.Flaws.Where(f => f.Id == id && f.UserId == me.UserId()).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }
}
