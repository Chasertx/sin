using System.Net;
using Sin.Api.Tests.Infrastructure;

namespace Sin.Api.Tests.Integration;

/// <summary>Both app stores need a public privacy policy URL; the app links to these pages too.</summary>
public class LegalPagesTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("/privacy.html", "Privacy Policy", "Delete account")]
    [InlineData("/terms.html", "Community Rules", "no tolerance")]
    [InlineData("/child-safety.html", "Child Safety Standards", "zero tolerance")]
    public async Task Legal_pages_are_public(string path, string title, string mustMention)
    {
        var res = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("text/html", res.Content.Headers.ContentType?.MediaType);
        var html = await res.Content.ReadAsStringAsync();
        Assert.Contains(title, html);
        Assert.Contains(mustMention, html);
    }
}
