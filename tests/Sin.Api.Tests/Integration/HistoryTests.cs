using System.Net;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

/// <summary>History: who you matched with, when, and whether it ended.</summary>
public class HistoryTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static async Task<List<MatchHistoryDto>> HistoryAsync(TestUser u) =>
        await (await u.Client.GetAsync("/api/matches/history")).ReadAsync<List<MatchHistoryDto>>();

    private async Task<(TestUser A, TestUser B, Guid MatchId)> PairAsync(string a = "Ana", string b = "Ben")
    {
        var first = await factory.CreateVisibleUserAsync(a);
        var second = await factory.CreateVisibleUserAsync(b);
        return (first, second, await TestHelpers.MatchAsync(first, second));
    }

    [Fact]
    public async Task A_new_match_is_in_both_histories_as_still_going()
    {
        var (a, b, matchId) = await PairAsync();

        var mine = Assert.Single(await HistoryAsync(a));
        Assert.Equal("Ben", mine.OtherName);
        Assert.Equal(b.Id, mine.OtherUserId);
        Assert.Equal(matchId, mine.MatchId);
        Assert.Null(mine.EndedAt);
        Assert.False(mine.EndedByMe);
        Assert.Equal(DateTimeKind.Utc, mine.MatchedAt.Kind);
        Assert.InRange(mine.MatchedAt, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));

        var theirs = Assert.Single(await HistoryAsync(b));
        Assert.Equal("Ana", theirs.OtherName);
        Assert.Equal(matchId, theirs.MatchId);
        Assert.Equal(mine.MatchedAt, theirs.MatchedAt);
    }

    [Fact]
    public async Task Unmatching_keeps_the_match_in_both_histories_and_says_who_ended_it()
    {
        var (a, b, matchId) = await PairAsync();
        await a.Client.PostJsonAsync($"/api/matches/{matchId}/messages", new SendMessageRequest("it's not you, it's your socks"));
        var matchedAt = (await HistoryAsync(a)).Single().MatchedAt;

        Assert.Equal(HttpStatusCode.NoContent, (await a.Client.DeleteAsync($"/api/matches/{matchId}")).StatusCode);

        var mine = Assert.Single(await HistoryAsync(a));
        Assert.Equal("Ben", mine.OtherName);
        Assert.True(mine.EndedByMe);
        Assert.Null(mine.MatchId); // nothing left to open
        Assert.Null(mine.OtherPhotoUrl);
        Assert.Equal(matchedAt, mine.MatchedAt);
        Assert.NotNull(mine.EndedAt);
        Assert.Equal(DateTimeKind.Utc, mine.EndedAt.Value.Kind);
        Assert.InRange(mine.EndedAt.Value, matchedAt, DateTime.UtcNow.AddMinutes(1));

        var theirs = Assert.Single(await HistoryAsync(b));
        Assert.Equal("Ana", theirs.OtherName);
        Assert.False(theirs.EndedByMe);
        Assert.Equal(mine.EndedAt, theirs.EndedAt);

        // The match itself, and the conversation, really are gone.
        Assert.Empty(await a.MatchesAsync());
        Assert.Empty(await b.MatchesAsync());
        Assert.Equal(0, await factory.WithDbAsync(db => db.Messages.CountAsync(m => m.MatchId == matchId)));
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.DeleteAsync($"/api/matches/{matchId}")).StatusCode);
        Assert.Single(await HistoryAsync(b)); // a second attempt adds nothing
    }

    [Fact]
    public async Task Blocking_and_reporting_end_the_match_in_history_too()
    {
        var (a, b, _) = await PairAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await a.Client.PostAsync($"/api/users/{b.Id}/block", null)).StatusCode);
        Assert.True(Assert.Single(await HistoryAsync(a)).EndedByMe);
        var blocked = Assert.Single(await HistoryAsync(b));
        Assert.NotNull(blocked.EndedAt);
        Assert.False(blocked.EndedByMe);

        var (c, d, _) = await PairAsync("Cal", "Dee");
        var report = await c.Client.PostJsonAsync($"/api/users/{d.Id}/report", new ReportRequest(ReportReason.Spam, null));
        Assert.Equal(HttpStatusCode.NoContent, report.StatusCode);
        Assert.True(Assert.Single(await HistoryAsync(c)).EndedByMe);
        Assert.Equal("Cal", Assert.Single(await HistoryAsync(d)).OtherName);

        // Blocking someone you never matched with leaves no trace.
        var stranger = await factory.CreateVisibleUserAsync("Stranger");
        await c.Client.PostAsync($"/api/users/{stranger.Id}/block", null);
        Assert.Single(await HistoryAsync(c));
        Assert.Empty(await HistoryAsync(stranger));
    }

    [Fact]
    public async Task Current_matches_and_ended_ones_are_listed_newest_activity_first()
    {
        var me = await factory.CreateVisibleUserAsync("Me");
        var old = await factory.CreateVisibleUserAsync("Old");
        var kept = await factory.CreateVisibleUserAsync("Kept");
        var gone = await factory.CreateVisibleUserAsync("Gone");

        var oldMatch = await TestHelpers.MatchAsync(me, old);
        await TestHelpers.MatchAsync(me, kept);
        var goneMatch = await TestHelpers.MatchAsync(me, gone);
        // Spread the matches out in time; the unmatches below both happen "now".
        await factory.WithDbAsync(async db =>
        {
            await db.Matches.Where(m => m.Id == oldMatch).ExecuteUpdateAsync(s => s.SetProperty(m => m.CreatedAt, DateTime.UtcNow.AddDays(-30)));
            await db.Matches.Where(m => m.UserAId == kept.Id || m.UserBId == kept.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.CreatedAt, DateTime.UtcNow.AddDays(-2)));
            await db.Matches.Where(m => m.Id == goneMatch).ExecuteUpdateAsync(s => s.SetProperty(m => m.CreatedAt, DateTime.UtcNow.AddDays(-10)));
        });
        await me.Client.DeleteAsync($"/api/matches/{goneMatch}");
        await factory.WithDbAsync(db => db.PastMatches.Where(p => p.UserId == me.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.EndedAt, DateTime.UtcNow.AddDays(-5))));

        var history = await HistoryAsync(me);
        Assert.Equal(["Kept", "Gone", "Old"], history.Select(h => h.OtherName)); // 2 days, 5 days, 30 days ago
        Assert.Equal([false, true, false], history.Select(h => h.EndedAt is not null));
        Assert.Equal(history.Count, history.Select(h => h.Id).Distinct().Count());
    }

    [Fact]
    public async Task Deleting_an_account_takes_the_name_out_of_everyone_elses_history()
    {
        var leaver = await factory.CreateVisibleUserAsync("Leaver");
        var current = await factory.CreateVisibleUserAsync("Current");
        var past = await factory.CreateVisibleUserAsync("Past");
        await TestHelpers.MatchAsync(leaver, current);
        var pastMatch = await TestHelpers.MatchAsync(leaver, past);
        await past.Client.DeleteAsync($"/api/matches/{pastMatch}");
        Assert.Equal("Leaver", Assert.Single(await HistoryAsync(past)).OtherName);

        Assert.Equal(HttpStatusCode.NoContent, (await leaver.Client.DeleteAsync("/api/me")).StatusCode);

        // Still matched at the time: the match ends, with no name left behind.
        var wasCurrent = Assert.Single(await HistoryAsync(current));
        Assert.Null(wasCurrent.OtherName);
        Assert.Null(wasCurrent.OtherUserId);
        Assert.NotNull(wasCurrent.EndedAt);
        Assert.False(wasCurrent.EndedByMe);
        Assert.Empty(await current.MatchesAsync());

        // Already unmatched: the old line stays, minus the name.
        var wasPast = Assert.Single(await HistoryAsync(past));
        Assert.Null(wasPast.OtherName);
        Assert.Null(wasPast.OtherUserId);
        Assert.True(wasPast.EndedByMe);

        // Nothing about the deleted account is left in the table.
        var leftovers = await factory.WithDbAsync(db => db.PastMatches
            .CountAsync(p => p.UserId == leaver.Id || p.OtherUserId == leaver.Id || p.OtherName == "Leaver"));
        Assert.Equal(0, leftovers);
    }

    [Fact]
    public async Task History_is_private()
    {
        var (a, _, matchId) = await PairAsync();
        await a.Client.DeleteAsync($"/api/matches/{matchId}");
        var outsider = await factory.CreateVisibleUserAsync("Outsider");

        Assert.Empty(await HistoryAsync(outsider));
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/matches/history")).StatusCode);
    }

    [Fact]
    public async Task A_database_from_before_history_existed_gets_the_table_on_startup()
    {
        var (a, _, matchId) = await PairAsync();
        await factory.WithDbAsync(async db =>
        {
            Assert.Empty(SchemaUpgrade.CreateMissingTables(db)); // freshly created: nothing to do

            await db.Database.ExecuteSqlRawAsync("DROP TABLE \"PastMatches\""); // turn it into an "old" database
            Assert.Equal(["PastMatches"], SchemaUpgrade.CreateMissingTables(db));
            Assert.Empty(SchemaUpgrade.CreateMissingTables(db));
            Assert.Empty(SchemaUpgrade.AddMissingColumns(db));
        });

        // The rebuilt table works, and the data that was already there is untouched.
        Assert.Equal(matchId, Assert.Single(await HistoryAsync(a)).MatchId);
        await a.Client.DeleteAsync($"/api/matches/{matchId}");
        Assert.True(Assert.Single(await HistoryAsync(a)).EndedByMe);
    }
}
