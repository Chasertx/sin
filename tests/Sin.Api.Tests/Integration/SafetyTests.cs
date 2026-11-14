using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class SafetyTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Blocking_hides_both_people_from_each_other()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        Assert.Contains(await a.FeedAsync(), p => p.Id == b.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await a.Client.PostAsync($"/api/users/{b.Id}/block", null)).StatusCode);

        Assert.DoesNotContain(await a.FeedAsync(), p => p.Id == b.Id);
        Assert.DoesNotContain(await b.FeedAsync(), p => p.Id == a.Id); // works both ways
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostJsonAsync("/api/swipes", new SwipeRequest(a.Id, true))).StatusCode);
    }

    [Fact]
    public async Task Blocking_ends_an_existing_match_and_deletes_the_chat()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        var id = await TestHelpers.MatchAsync(a, b);
        await b.Client.PostJsonAsync($"/api/matches/{id}/messages", new SendMessageRequest("creepy message"));

        await a.Client.PostAsync($"/api/users/{b.Id}/block", null);

        Assert.Empty(await a.MatchesAsync());
        Assert.Empty(await b.MatchesAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostJsonAsync($"/api/matches/{id}/messages", new SendMessageRequest("hello?"))).StatusCode);
        Assert.Equal(0, await factory.WithDbAsync(db => db.Messages.CountAsync(m => m.MatchId == id)));
    }

    [Fact]
    public async Task Blocking_twice_is_harmless()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        await a.Client.PostAsync($"/api/users/{b.Id}/block", null);
        Assert.Equal(HttpStatusCode.NoContent, (await a.Client.PostAsync($"/api/users/{b.Id}/block", null)).StatusCode);
        Assert.Equal(1, await factory.WithDbAsync(db => db.Blocks.CountAsync(x => x.BlockerId == a.Id && x.BlockedId == b.Id)));
    }

    [Fact]
    public async Task Block_and_report_reject_yourself_and_unknown_users()
    {
        var a = await factory.CreateVisibleUserAsync();
        await (await a.Client.PostAsync($"/api/users/{a.Id}/block", null)).ErrorAsync();
        await (await a.Client.PostJsonAsync($"/api/users/{a.Id}/report", new ReportRequest(ReportReason.Spam, null))).ErrorAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.PostAsync($"/api/users/{Guid.NewGuid()}/block", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await a.Client.PostJsonAsync($"/api/users/{Guid.NewGuid()}/report", new ReportRequest(ReportReason.Spam, null))).StatusCode);
    }

    [Fact]
    public async Task Reporting_files_a_report_and_blocks()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();

        var res = await a.Client.PostJsonAsync($"/api/users/{b.Id}/report", new ReportRequest(ReportReason.Harassment, "  said awful things  "));
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        var report = await factory.WithDbAsync(db => db.Reports.SingleAsync(r => r.ReporterId == a.Id));
        Assert.Equal((b.Id, ReportReason.Harassment, "said awful things", ReportStatus.Open),
            (report.ReportedId, report.Reason, report.Details, report.Status));
        Assert.DoesNotContain(await a.FeedAsync(), p => p.Id == b.Id);
    }

    [Fact]
    public async Task Report_details_are_length_limited()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        var tooLong = new string('x', Limits.ReportDetailsMaxLength + 1);
        await (await a.Client.PostJsonAsync($"/api/users/{b.Id}/report", new ReportRequest(ReportReason.Other, tooLong))).ErrorAsync();
    }

    [Fact]
    public async Task Deleting_an_account_removes_everything_and_kills_the_token()
    {
        var me = await factory.CreateVisibleUserAsync("Leaving");
        var friend = await factory.CreateVisibleUserAsync();
        var matchId = await TestHelpers.MatchAsync(me, friend);
        await me.Client.PostJsonAsync($"/api/matches/{matchId}/messages", new SendMessageRequest("goodbye"));
        await me.Client.PostAsync("/api/me/photo", PhotoContent());
        Assert.NotEmpty(factory.Photos.Files);
        var photoCountBefore = factory.Photos.Files.Count;

        Assert.Equal(HttpStatusCode.NoContent, (await me.Client.DeleteAsync("/api/me")).StatusCode);

        // The old token stops working immediately.
        Assert.Equal(HttpStatusCode.Unauthorized, (await me.Client.GetAsync("/api/me")).StatusCode);
        // Can't log back in.
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(me.Email, me.Password), TestHelpers.Json)).StatusCode);
        // Gone from the other person's world.
        Assert.Empty(await friend.MatchesAsync());
        Assert.DoesNotContain(await friend.FeedAsync(), p => p.Id == me.Id);
        // And from the database.
        await factory.WithDbAsync(async db =>
        {
            Assert.False(await db.Users.AnyAsync(u => u.Id == me.Id));
            Assert.False(await db.Flaws.AnyAsync(f => f.UserId == me.Id));
            Assert.False(await db.Swipes.AnyAsync(s => s.SwiperId == me.Id || s.TargetId == me.Id));
            Assert.False(await db.Matches.AnyAsync(m => m.Id == matchId));
            Assert.False(await db.Messages.AnyAsync(m => m.MatchId == matchId));
        });
        Assert.Equal(photoCountBefore - 1, factory.Photos.Files.Count);
    }

    [Fact]
    public async Task Reports_about_a_deleted_user_are_kept_for_moderators()
    {
        var reporter = await factory.CreateVisibleUserAsync();
        var bad = await factory.CreateVisibleUserAsync();
        await reporter.Client.PostJsonAsync($"/api/users/{bad.Id}/report", new ReportRequest(ReportReason.Spam, null));
        await bad.Client.DeleteAsync("/api/me");
        Assert.True(await factory.WithDbAsync(db => db.Reports.AnyAsync(r => r.ReportedId == bad.Id)));
    }

    private static MultipartFormDataContent PhotoContent() => TestHelpers.Photo("image/jpeg");
}
