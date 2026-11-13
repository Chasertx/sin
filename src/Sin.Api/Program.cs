using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Sin.Api.Data;
using Sin.Api.Endpoints;
using Sin.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Refuse to run in production with the placeholder signing key.
if (!builder.Environment.IsDevelopment() && (config["Jwt:Key"] ?? "").Contains("CHANGE-ME"))
    throw new InvalidOperationException("Set a real Jwt:Key (environment variable Jwt__Key) before running outside Development.");

// Render (and most hosts) tell the app which port to listen on.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://+:{port}");

// ---- Database: SQLite file locally (zero setup); Postgres when hosted (Database:Provider=Postgres). ----
var connectionString = config.GetConnectionString("Sin")!;
if (string.Equals(config["Database:Provider"], "Postgres", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddDbContext<SinDb>(o => o.UseNpgsql(PostgresConnection.Normalize(connectionString)));
else
    builder.Services.AddDbContext<SinDb>(o => o.UseSqlite(connectionString));

// ---- Photos: Supabase Storage if configured, else local disk ----
if (config["Supabase:Url"] is { Length: > 0 } && config["Supabase:ServiceKey"] is { Length: > 0 })
    builder.Services.AddHttpClient<IPhotoStore, SupabasePhotoStore>();
else
    builder.Services.AddSingleton<IPhotoStore, LocalPhotoStore>();

// Behind a hosting proxy the app sees http; trust X-Forwarded-Proto so URLs (and SSO redirects) are https.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

// Moderation word list (editable text file next to the app).
builder.Services.AddSingleton(ContentFilter.FromFile(Path.Combine(AppContext.BaseDirectory, "moderation-terms.txt")));

// The mobile app doesn't need CORS; the browser preview (Expo web) does, so allow it in Development only.
builder.Services.AddCors(o => o.AddPolicy("dev-web", p => p
    .SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var u) && (u.IsLoopback || u.Host.StartsWith("192.168.") || u.Host.StartsWith("10.")))
    .AllowAnyHeader().AllowAnyMethod()));

// ---- Rate limiting: per signed-in user, or per IP when anonymous ----
var limitsEnabled = config.GetValue("RateLimits:Enabled", true);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static string Key(HttpContext ctx) =>
        ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon";
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => limitsEnabled
        ? RateLimitPartition.GetFixedWindowLimiter(Key(ctx), _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1) })
        : RateLimitPartition.GetNoLimiter("off"));
    // Sign-up / login: slows down password guessing and spam accounts.
    o.AddPolicy("auth", ctx => limitsEnabled
        ? RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "anon", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) })
        : RateLimitPartition.GetNoLimiter("off"));
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- Auth: JWT bearer ----
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LoginThrottle>();
var auth = builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!)),
            ValidateIssuerSigningKey = true,
        };
        // Tokens stop working the moment an account is deleted or banned.
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var id = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var db = ctx.HttpContext.RequestServices.GetRequiredService<SinDb>();
                if (!Guid.TryParse(id, out var userId) || !await db.Users.AnyAsync(u => u.Id == userId && !u.IsBanned))
                    ctx.Fail("Account no longer active.");
            },
        };
    })
    // Short-lived cookie that carries the provider's result back to /api/auth/sso/{provider}.
    .AddCookie(SsoEndpoints.ExternalCookie, o =>
    {
        o.Cookie.Name = "sin.external";
        o.ExpireTimeSpan = TimeSpan.FromMinutes(5);
    });

// ---- SSO providers: each one turns on only when its credentials are configured ----
if (config["Sso:Google:ClientId"] is { Length: > 0 } googleId)
{
    auth.AddGoogle("Google", o =>
    {
        o.SignInScheme = SsoEndpoints.ExternalCookie;
        o.ClientId = googleId;
        o.ClientSecret = config["Sso:Google:ClientSecret"]!;
        // Needed to link Google logins to existing accounts safely (only verified emails).
        o.ClaimActions.MapJsonKey("email_verified", "email_verified");
        o.ClaimActions.MapJsonKey("email_verified", "verified_email");
    });
}

if (config["Sso:Apple:ClientId"] is { Length: > 0 } appleId)
{
    auth.AddApple("Apple", o =>
    {
        o.SignInScheme = SsoEndpoints.ExternalCookie;
        o.ClientId = appleId;                       // your Services ID, e.g. com.sinapp.sin.signin
        o.TeamId = config["Sso:Apple:TeamId"]!;
        o.KeyId = config["Sso:Apple:KeyId"]!;
        o.GenerateClientSecret = true;
        var keyPath = config["Sso:Apple:PrivateKeyPath"]!;  // the AuthKey_XXXX.p8 you download from Apple
        o.UsePrivateKey(_ => new Microsoft.Extensions.FileProviders.Physical.PhysicalFileInfo(new FileInfo(keyPath)));
        // Apple POSTs back cross-site, so the correlation cookies must be SameSite=None (requires https).
        o.CorrelationCookie.SameSite = SameSiteMode.None;
        o.CorrelationCookie.SecurePolicy = CookieSecurePolicy.Always;
    });
}
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery();

// ---- Swagger with a "Authorize" button ----
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "We All Got Problems API", Version = "v1", Description = "What can you handle? The anti-dating app." });
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = [] });
});

var app = builder.Build();

// ---- Create DB + seed demo data on startup ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SinDb>();
    if (db.Database.IsNpgsql())
    {
        // Supabase databases already contain Supabase's own tables (auth, storage...), so
        // EnsureCreated() would think "already set up" and skip. Create ours if our schema is empty.
        var ourTables = db.Database
            .SqlQueryRaw<int>("select count(*)::int as \"Value\" from information_schema.tables where table_schema = {0}", SinDb.PostgresSchema)
            .AsEnumerable()
            .First();
        if (ourTables == 0)
        {
            db.Database.ExecuteSqlRaw($"CREATE SCHEMA IF NOT EXISTS \"{SinDb.PostgresSchema}\"");
            db.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>().CreateTables();
        }
    }
    else
    {
        db.Database.EnsureCreated();
    }
    if (config.GetValue<bool>("Demo:SeedUsers")) SeedData.Seed(db);
}

app.UseForwardedHeaders();
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});
if (app.Environment.IsDevelopment())
{
    app.UseCors("dev-web");
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
}
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseAntiforgery();

app.MapGet("/", () => app.Environment.IsDevelopment() ? Results.Redirect("/swagger") : Results.Redirect("/privacy.html"))
    .ExcludeFromDescription();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");
app.MapAuthEndpoints();
app.MapSsoEndpoints();
app.MapProfileEndpoints();
app.MapFeedEndpoints();
app.MapMatchEndpoints();
app.MapSafetyEndpoints();
app.MapAdminEndpoints();

app.Run();

// Lets the test project spin up the API in-process.
public partial class Program { }
