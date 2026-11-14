using Sin.Api.Services;

namespace Sin.Api.Tests.Unit;

public class ClaudeModeratorTests
{
    [Fact]
    public void Allow_verdict_parses_as_allowed()
    {
        var result = ClaudeModerator.ParseVerdict("""{"verdict":"allow","category":"none","reason":"A man holding a fish."}""");
        Assert.Equal(ModerationVerdict.Allowed, result?.Verdict);
    }

    [Theory]
    [InlineData("sexual")]
    [InlineData("gore")]
    public void Block_verdict_keeps_its_category_and_reason(string category)
    {
        var result = ClaudeModerator.ParseVerdict($$"""{"verdict":"block","category":"{{category}}","reason":"Seen it."}""");
        Assert.Equal(ModerationResult.Blocked(category, "Seen it."), result);
        Assert.False(result!.InvolvesMinors);
    }

    [Fact]
    public void Minors_category_is_flagged_for_human_review()
    {
        Assert.True(ClaudeModerator.ParseVerdict("""{"verdict":"block","category":"minors","reason":"x"}""")!.InvolvesMinors);
    }

    [Theory]
    [InlineData("")]
    [InlineData("I think this is fine.")]
    [InlineData("""{"verdict":"maybe","category":"none","reason":""}""")]
    [InlineData("""{"category":"none"}""")]
    [InlineData("""["allow"]""")]
    [InlineData("""{"verdict":"allow","category":"none","reason":"cut off""")]
    public void Anything_else_is_not_a_verdict(string reply)
    {
        Assert.Null(ClaudeModerator.ParseVerdict(reply));
    }

    [Fact]
    public async Task With_no_key_configured_everything_passes()
    {
        var none = new NoModerator();
        Assert.Equal(ModerationVerdict.Allowed, (await none.CheckPhotoAsync([1, 2, 3])).Verdict);
        Assert.Equal(ModerationVerdict.Allowed, (await none.CheckTextAsync("confession", "anything")).Verdict);
    }
}
