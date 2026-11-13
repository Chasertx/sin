using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Shared;

namespace Sin.Api.Endpoints;

/// <summary>
/// Minimal moderation API, protected by the X-Admin-Key header (config Admin:ApiKey).
/// Disabled entirely when no key is configured.
/// </summary>
public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin").AddEndpointFilter(async (ctx, next) =>
        {
            var expected = ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Admin:ApiKey"];
            var given = ctx.HttpContext.Request.Headers["X-Admin-Key"].ToString();
            if (string.IsNullOrEmpty(expected) || expected.Length < 24 ||
                !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.UTF8.GetBytes(given), System.Text.Encoding.UTF8.GetBytes(expected)))
                return Results.NotFound();
            return await next(ctx);
        });

        g.MapGet("/reports", async (ReportStatus? status, SinDb db) =>
        {
            var reports = await db.Reports
                .Where(r => r.Status == (status ?? ReportStatus.Open))
                .OrderByDescending(r => r.Id)
                .Take(200)
                .ToListAsync();
            var ids = reports.Select(r => r.ReportedId).Distinct().ToList();
            var names = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
            return Results.Ok(reports.Select(r => new ReportDto(r.Id, r.ReporterId, r.ReportedId,
                names.GetValueOrDefault(r.ReportedId, "(deleted)"), r.Reason, r.Details, r.Status, r.CreatedAt)));
        });

        g.MapPost("/reports/{id:long}/status/{status}", async (long id, ReportStatus status, SinDb db) =>
        {
            var updated = await db.Reports.Where(r => r.Id == id).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, status));
            return updated == 0 ? Results.NotFound() : Results.NoContent();
        });

        // Banned users can't sign in, their tokens stop working, and they vanish from feeds and matches.
        g.MapPost("/users/{id:guid}/ban", async (Guid id, SinDb db) =>
        {
            var updated = await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBanned, true));
            if (updated == 0) return Results.NotFound();
            await db.Reports.Where(r => r.ReportedId == id && r.Status == ReportStatus.Open)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, ReportStatus.ActionTaken));
            return Results.NoContent();
        });

        g.MapPost("/users/{id:guid}/unban", async (Guid id, SinDb db) =>
        {
            var updated = await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBanned, false));
            return updated == 0 ? Results.NotFound() : Results.NoContent();
        });
    }
}
