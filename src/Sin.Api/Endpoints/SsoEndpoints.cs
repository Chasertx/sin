using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;

namespace Sin.Api.Endpoints;

/// <summary>
/// Single sign-on for the mobile app (Google, Apple), using a server-side flow:
///   1. App opens the system browser at  GET /api/auth/sso/{provider}
///   2. We challenge the provider; it redirects back to /signin-{provider}; the handler
///      stores the result in a short-lived "External" cookie and returns to step 1's URL.
///   3. We find/create the user, issue our own JWT, and redirect to  sin://auth#token=...
///      which the OS hands back to the app. For a new account the redirect also carries what the
///      provider told us (first name, verified email), so the app can show the rest of sign-up
///      already filled in.
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

        g.MapGet("/sso/{provider}", async (string provider, string? returnUrl, HttpContext ctx, SinDb db, TokenService tokens,
            IAuthenticationSchemeProvider schemes, IConfiguration config, IWebHostEnvironment env, ILoggerFactory logs) =>
        {
            var callback = ResolveCallback(returnUrl, config, env);

            var scheme = (await schemes.GetAllSchemesAsync())
                .FirstOrDefault(s => KnownProviders.Contains(s.Name) && s.Name.Equals(provider, StringComparison.OrdinalIgnoreCase));
            if (scheme is null)
                return Results.Redirect($"{callback}#error={Uri.EscapeDataString($"{provider} sign-in isn't set up on the server.")}");

            // Step 2 not done yet (or the cookie is from a different provider): go to the provider.
            var external = await ctx.AuthenticateAsync(ExternalCookie);
            if (!external.Succeeded || external.Principal?.Identity?.AuthenticationType != scheme.Name)
                return Results.Challenge(new AuthenticationProperties { RedirectUri = ctx.Request.Path + ctx.Request.QueryString }, [scheme.Name]);

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
                // 2) Same email as an existing account? Only link if the provider vouches the email
                //    is verified; otherwise anyone could claim someone else's account.
                var verified = IsEmailVerified(scheme.Name, p);
                if (email is not null)
                {
                    var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
                    if (existing is not null && !verified)
                        return Results.Redirect($"{callback}#error={Uri.EscapeDataString("An account with this email already exists. Log in with your password instead.")}");
                    user = existing;
                }
                // An unverified email isn't stored either, so it can't squat a real person's address.
                if (!verified) email = null;

                // 3) Brand-new user. Age 0 = needs onboarding; hidden from the feed until they finish.
                if (user is null)
                {
                    var name = p.FindFirstValue(ClaimTypes.GivenName)
                               ?? p.FindFirstValue(ClaimTypes.Name)?.Split(' ')[0]
                               ?? email?.Split('@')[0]
                               ?? "Mystery Sinner";
                    user = new User
                    {
                        Email = email ?? $"{scheme.Name.ToLowerInvariant()}-{subject}{PlaceholderEmailDomain}",
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

            if (user.IsBanned)
                return Results.Redirect($"{callback}#error={Uri.EscapeDataString("This account has been suspended.")}");

            return Results.Redirect($"{callback}#{SessionFragment(user, tokens.Create(user))}");
        }).ExcludeFromDescription();
    }

    /// <summary>What the app gets back after a successful sign-in, as a URL fragment.</summary>
    internal static string SessionFragment(User user, string token)
    {
        var parts = new List<string>
        {
            $"token={Uri.EscapeDataString(token)}",
            $"userId={user.Id}",
            $"name={Uri.EscapeDataString(user.DisplayName)}",
            $"onboarding={(user.NeedsOnboarding ? "1" : "0")}",
        };
        // Only a real address, never the stand-in we store when the provider gave no verified email.
        if (!user.Email.EndsWith(PlaceholderEmailDomain, StringComparison.OrdinalIgnoreCase))
            parts.Add($"email={Uri.EscapeDataString(user.Email)}");
        return string.Join("&", parts);
    }

    /// <summary>Accounts whose provider gave no verified email are stored under a made-up address here.</summary>
    internal const string PlaceholderEmailDomain = "@sso.sin";

    /// <summary>
    /// Apple only issues verified emails. Google says so explicitly in its "email_verified" claim
    /// (mapped from the userinfo response in Program.cs). Anything else counts as unverified.
    /// </summary>
    internal static bool IsEmailVerified(string provider, ClaimsPrincipal principal) =>
        provider == "Apple" ||
        (provider == "Google" &&
         string.Equals(principal.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Where to send the user back to. Only the app's own scheme is allowed (never arbitrary URLs,
    /// which would leak the token), plus Expo Go's exp:// URLs while developing.
    /// </summary>
    internal static string ResolveCallback(string? returnUrl, IConfiguration config, IWebHostEnvironment env)
    {
        var appScheme = config["Sso:CallbackScheme"] ?? "sin";
        var fallback = $"{appScheme}://auth";
        if (string.IsNullOrWhiteSpace(returnUrl) || !Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri))
            return fallback;
        var allowed = uri.Scheme == appScheme || (env.IsDevelopment() && uri.Scheme is "exp" or "exps");
        return allowed ? returnUrl.Split('#')[0] : fallback;
    }
}
