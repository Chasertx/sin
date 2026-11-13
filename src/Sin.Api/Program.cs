using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Sin.Api.Data;
using Sin.Api.Endpoints;
using Sin.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

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
if (config["Supabase:Url"] is { Length: > 0 })
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

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- Auth: JWT bearer ----
builder.Services.AddSingleton<TokenService>();
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
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Sin API", Version = "v1", Description = "The anti-dating app. Lead with your worst." });
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
    db.Database.EnsureCreated();
    if (config.GetValue<bool>("Demo:SeedUsers")) SeedData.Seed(db);
}

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");
app.MapAuthEndpoints();
app.MapSsoEndpoints();
app.MapProfileEndpoints();
app.MapFeedEndpoints();
app.MapMatchEndpoints();

app.Run();
