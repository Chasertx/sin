using System.Net;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class ChatTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(TestUser A, TestUser B, Guid MatchId)> PairAsync()
    {
        var a = await factory.CreateVisibleUserAsync("A");
        var b = await factory.CreateVisibleUserAsync("B");
        return (a, b, await TestHelpers.MatchAsync(a, b));
    }

    private static string Url(Guid matchId, long? after = null) =>
        after is null ? $"/api/matches/{matchId}/messages" : $"/api/matches/{matchId}/messages?after={after}";

    [Fact]
    public async Task Both_people_see_messages_in_order()
    {
        var (a, b, id) = await PairAsync();
        var m1 = await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest("  so about the socks  "))).ReadAsync<MessageDto>();
        var m2 = await (await b.Client.PostJsonAsync(Url(id), new SendMessageRequest("they pass the test"))).ReadAsync<MessageDto>();

        Assert.Equal("so about the socks", m1.Text); // trimmed
        Assert.Equal(a.Id, m1.SenderId);
        Assert.True(m2.Id > m1.Id);

        foreach (var reader in new[] { a, b })
        {
            var msgs = await (await reader.Client.GetAsync(Url(id))).ReadAsync<List<MessageDto>>();
            Assert.Equal([m1.Id, m2.Id], msgs.Select(m => m.Id));
        }
    }

    [Fact]
    public async Task After_parameter_returns_only_newer_messages()
    {
        var (a, _, id) = await PairAsync();
        var first = await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest("one"))).ReadAsync<MessageDto>();
        await a.Client.PostJsonAsync(Url(id), new SendMessageRequest("two"));

        var newer = await (await a.Client.GetAsync(Url(id, first.Id))).ReadAsync<List<MessageDto>>();
        Assert.Equal("two", Assert.Single(newer).Text);
    }

    [Fact]
    public async Task Timestamps_are_utc()
    {
        var (a, _, id) = await PairAsync();
        var msg = await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest("hi"))).ReadAsync<MessageDto>();
        var listed = (await (await a.Client.GetAsync(Url(id))).ReadAsync<List<MessageDto>>()).Single();
        Assert.Equal(DateTimeKind.Utc, listed.SentAt.Kind);
        Assert.InRange(listed.SentAt, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
        Assert.Equal(msg.Id, listed.Id);
    }

    [Fact]
    public async Task Matches_list_shows_the_latest_message_and_most_recent_chat_first()
    {
        var me = await factory.CreateVisibleUserAsync("Me");
        var x = await factory.CreateVisibleUserAsync("X");
        var y = await factory.CreateVisibleUserAsync("Y");
        var mx = await TestHelpers.MatchAsync(me, x);
        var my = await TestHelpers.MatchAsync(me, y);

        await me.Client.PostJsonAsync(Url(my), new SendMessageRequest("hey Y"));
        await me.Client.PostJsonAsync(Url(mx), new SendMessageRequest("hey X"));
        await x.Client.PostJsonAsync(Url(mx), new SendMessageRequest("latest from X"));

        var matches = await me.MatchesAsync();
        Assert.Equal(["X", "Y"], matches.Select(m => m.OtherName));
        Assert.Equal("latest from X", matches[0].LastMessage);
        Assert.Equal("hey Y", matches[1].LastMessage);
    }

    [Fact]
    public async Task Outsiders_cannot_read_or_post()
    {
        var (_, _, id) = await PairAsync();
        var outsider = await factory.CreateVisibleUserAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Client.GetAsync(Url(id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Client.PostJsonAsync(Url(id), new SendMessageRequest("hi"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Client.DeleteAsync($"/api/matches/{id}")).StatusCode);
    }

    [Theory]
    [InlineData("", "1-1000")]
    [InlineData("   ", "1-1000")]
    [InlineData("go kill yourself", "crosses the line")]
    public async Task Message_validation(string text, string expected)
    {
        var (a, _, id) = await PairAsync();
        Assert.Contains(expected, await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest(text))).ErrorAsync());
    }

    [Fact]
    public async Task Message_max_length()
    {
        var (a, _, id) = await PairAsync();
        await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest(new string('x', Limits.MessageMaxLength)))).ReadAsync<MessageDto>();
        await (await a.Client.PostJsonAsync(Url(id), new SendMessageRequest(new string('x', Limits.MessageMaxLength + 1)))).ErrorAsync();
    }

    [Fact]
    public async Task Unmatch_removes_the_match_and_its_messages_for_both()
    {
        var (a, b, id) = await PairAsync();
        await a.Client.PostJsonAsync(Url(id), new SendMessageRequest("bye"));

        Assert.Equal(HttpStatusCode.NoContent, (await b.Client.DeleteAsync($"/api/matches/{id}")).StatusCode);
        Assert.Empty(await a.MatchesAsync());
        Assert.Empty(await b.MatchesAsync());
        Assert.Equal(0, await factory.WithDbAsync(db => db.Messages.CountAsync(m => m.MatchId == id)));
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.GetAsync(Url(id))).StatusCode);
    }
}
