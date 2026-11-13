using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth").RequireRateLimiting("auth");

        g.MapPost("/register", async (RegisterRequest r, SinDb db, TokenService tokens, ContentFilter filter) =>
        {
            var email = r.Email?.Trim().ToLowerInvariant() ?? "";
            if (!email.Contains('@') || email.Length > 256) return Error("Enter a valid email.");
            if (string.IsNullOrWhiteSpace(r.Password) || r.Password.Length < 8) return Error("Password must be at least 8 characters.");
            if (string.IsNullOrWhiteSpace(r.DisplayName) || r.DisplayName.Length > 50) return Error("Display name is required (max 50).");
            if (r.Age < 18 || r.Age > 120) return Error("You must be 18 or older.");
            if (filter.Check(r.DisplayName) is { } abusive) return Error(abusive);
            if (await db.Users.AnyAsync(u => u.Email == email)) return Error("That email is already registered.", 409);

            var user = new User
            {
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(r.Password),
                DisplayName = r.DisplayName.Trim(),
                Age = r.Age,
                Gender = r.Gender,
                InterestedIn = r.InterestedIn,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Ok(new AuthResponse(tokens.Create(user), user.Id, user.DisplayName));
        });

        g.MapPost("/login", async (LoginRequest r, SinDb db, TokenService tokens) =>
        {
            var email = r.Email?.Trim().ToLowerInvariant() ?? "";
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user is null || user.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(r.Password ?? "", user.PasswordHash))
                return Error(user is { PasswordHash: null }
                    ? "This account uses Google/Apple sign-in. Use that button instead."
                    : "Wrong email or password.", 401);
            if (user.IsBanned) return Error("This account has been suspended.", 403);
            return Results.Ok(new AuthResponse(tokens.Create(user), user.Id, user.DisplayName, user.NeedsOnboarding));
        });
    }
}
