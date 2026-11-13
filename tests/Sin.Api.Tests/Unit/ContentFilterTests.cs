using Sin.Api.Services;

namespace Sin.Api.Tests.Unit;

public class ContentFilterTests
{
    private static readonly ContentFilter Filter = new(["# comment line", "", "kys", "kill yourself", "slut", "  spaced term  "]);

    [Theory]
    [InlineData("just kys")]
    [InlineData("KYS")]
    [InlineData("you should kill yourself")]
    [InlineData("you should kill    yourself")] // extra whitespace
    [InlineData("k1ll y0urself")] // leetspeak
    [InlineData("$lut")]
    [InlineData("kys!")] // punctuation after
    [InlineData("this has a spaced term in it")] // trimmed list entries
    public void Blocks_listed_terms(string text) => Assert.NotNull(Filter.Check(text));

    [Theory]
    [InlineData("skyscraper")] // contains "kys"? no, but substrings shouldn't match
    [InlineData("Keys to my heart")]
    [InlineData("I kill houseplants")]
    [InlineData("comment line")] // comment lines aren't terms
    [InlineData("")]
    [InlineData(null)]
    public void Allows_clean_text(string? text) => Assert.Null(Filter.Check(text));

    [Fact]
    public void Empty_term_list_allows_everything() => Assert.Null(new ContentFilter([]).Check("kys"));

    [Fact]
    public void Missing_file_gives_permissive_filter() =>
        Assert.Null(ContentFilter.FromFile(Path.Combine(Path.GetTempPath(), "does-not-exist.txt")).Check("kys"));

    [Fact]
    public void Shipped_term_list_is_loaded_and_blocks_threats()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "moderation-terms.txt");
        Assert.True(File.Exists(path), "moderation-terms.txt should be copied to the output folder");
        var filter = ContentFilter.FromFile(path);
        Assert.NotNull(filter.Check("go kill yourself"));
        Assert.Null(filter.Check("I chew ice loudly"));
    }

    [Theory]
    [InlineData("K1LL", "kill")]
    [InlineData("$3nd", "send")]
    [InlineData("h@te", "hate")]
    public void Normalize_undoes_character_swaps(string input, string expected) =>
        Assert.Equal(expected, ContentFilter.Normalize(input));
}
