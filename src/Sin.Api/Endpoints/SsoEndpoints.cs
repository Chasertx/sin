using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;

namespace Sin.Api.Endpoints;

/// <summary>
/// Single sign-on for the mobile app (Google, Apple), using the server-side flow that
/// MAUI's WebAuthenticator expects:
///   1. App opens the system browser at  GET /api/auth/sso/{provider}
///   2. We challenge the provider; it redirects back to /signin-{provider}; the handler
///      stores the result in a short-lived "External" cookie and returns to step 1's URL.
///   3. We find/create the user, issue our own JWT, and redirect to  sin://auth#token=...
///      which the OS hands back to the app.
/// </summary>
public static class SsoEndpoints
{
    public const string ExternalCookie = "External";

    /// <summary>Provider scheme names this API knows how to handle (only registered ones are active).</summary>
    public static readonly string[] KnownProviders = ["Google", "Apple"];

    public static void MapSsoEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        // Lets the app show only the buttons that are actually configured.
        g.MapGet("/providers", async (IAuthenticationSchemeProvider schemes) =>
            (await schemes.GetAllSchemesAsync())
                .Select(s => s.Name)
                .Where(n => KnownProviders.Contains(n))
                .ToArray());

        g.MapGet("/sso/{provider}", async (string provider, HttpContext ctx, SinDb db, TokenService tokens,
            IAuthenticationSchemeProvider schemes, IConfiguration config, ILoggerFactory logs) =>
        {
            var callback = $"{config["Sso:CallbackScheme"] ?? "sin"}://auth";

            var scheme = (await schemes.GetAllSchemesAsync())
                .FirstOrDefault(s => KnownProviders.Contains(s.Name) && s.Name.Equals(provider, StringComparison.OrdinalIgnoreCase));
            if (scheme is null)
                return Results.Redirect($"{callback}#error={Uri.EscapeDataString($"{provider} sign-in isn't set up on the server.")}");

            // Step 2 not done yet (or the cookie is from a different provider): go to the provider.
            var external = await ctx.AuthenticateAsync(ExternalCookie);
            if (!external.Succeeded || external.Principal?.Identity?.AuthenticationType != scheme.Name)
                return Results.Challenge(new AuthenticationProperties { RedirectUri = ctx.Request.Path }, [scheme.Name]);

            await ctx.SignOutAsync(ExternalCookie);

            var p = external.Principal;
            var subject = p.FindFirstValue(ClaimTypes.NameIdentifier);
            var email = p.FindFirstValue(ClaimTypes.Email)?.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(subject))
                return Results.Redirect($"{callback}#error={Uri.EscapeDataString("The provider didn't return an account id.")}");

            // 1) Already linked?
            var link = await db.ExternalLogins.FirstOrDefaultAsync(x => x.Provider == scheme.Name && x.Subject == subject);
            var user = link is null ? null : await db.Users.FindAsync(link.UserId);

            if (user is null)
            {
                // 2) Same email as an existing account? Google and Apple only hand out verified emails.
                if (email is not null)
                    user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

                // 3) Brand-new user. Age 0 = needs onboarding; hidden from the feed until they finish.
                if (user is null)
                {
                    var name = p.FindFirstValue(ClaimTypes.GivenName)
                               ?? p.FindFirstValue(ClaimTypes.Name)?.Split(' ')[0]
                               ?? email?.Split('@')[0]
                               ?? "Mystery Sinner";
                    user = new User
                    {
                        Email = email ?? $"{scheme.Name.ToLowerInvariant()}-{subject}@sso.sin",
                        DisplayName = name.Length > 50 ? name[..50] : name,
                        Age = 0,
                        Gender = Shared.Gender.NonBinary,
                        InterestedIn = Shared.InterestedIn.Everyone,
                    };
                    db.Users.Add(user);
                }

                db.ExternalLogins.Add(new ExternalLogin { Provider = scheme.Name, Subject = subject, UserId = user.Id });
                await db.SaveChangesAsync();
                logs.CreateLogger("Sso").LogInformation("Linked {Provider} login to user {UserId}", scheme.Name, user.Id);
            }

            var fragment = string.Join("&",
                $"token={Uri.EscapeDataString(tokens.Create(user))}",
                $"userId={user.Id}",
                $"name={Uri.EscapeDataString(user.DisplayName)}",
                $"onboarding={(user.NeedsOnboarding ? "1" : "0")}");
            return Results.Redirect($"{callback}#{fragment}");
        }).ExcludeFromDescription();
    }
}
