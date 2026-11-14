using Sin.Api.Services;

namespace Sin.Api.Tests.Unit;

public class NegativityGuardTests
{
    [Theory]
    [InlineData("Honestly I'm a perfectionist")]
    [InlineData("I LOVE TO TRAVEL")]
    [InlineData("i work hard play hard")]
    [InlineData("I care too much about people")]
    [InlineData("I’m a catch")] // curly apostrophe
    [InlineData("Serial entrepreneur, sorry")]
    [InlineData("I'm 6 ft and fluent in French")]
    [InlineData("I'm basically perfect and everyone loves me.")]
    [InlineData("Honestly I have no flaws")]
    public void Rejects_humblebrags(string text)
    {
        var error = NegativityGuard.Check(text);
        Assert.NotNull(error);
        Assert.Contains("compliment", error);
    }

    [Theory]
    [InlineData("I eat cereal for dinner five nights a week")]
    [InlineData("I hold grudges against restaurants")]
    [InlineData("My car is a second closet")]
    [InlineData("I'm far from perfect and it shows")]
    [InlineData("I'm greatly overdue on my taxes")]
    public void Allows_genuine_flaws(string text) => Assert.Null(NegativityGuard.Check(text));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Allows_empty_input(string? text) => Assert.Null(NegativityGuard.Check(text));

    [Fact]
    public void Error_names_the_offending_phrase() =>
        Assert.Contains("\"perfectionist\"", NegativityGuard.Check("total perfectionist")!);
}
