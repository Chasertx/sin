using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sin.Shared;

namespace Sin.Mobile.Services;

public class ApiException(string message, HttpStatusCode status) : Exception(message)
{
    public HttpStatusCode Status { get; } = status;
}

/// <summary>Typed wrapper around the Sin API.</summary>
public class ApiClient(Session session)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly HttpClient _http = new()
    {
        BaseAddress = new Uri(AppConfig.ApiBaseUrl),
        Timeout = TimeSpan.FromSeconds(20),
    };

    // Auth
    public Task<AuthResponse> RegisterAsync(RegisterRequest r) => SendAsync<AuthResponse>(HttpMethod.Post, "api/auth/register", r);
    public Task<AuthResponse> LoginAsync(LoginRequest r) => SendAsync<AuthResponse>(HttpMethod.Post, "api/auth/login", r);
    public Task<List<string>> GetSsoProvidersAsync() => SendAsync<List<string>>(HttpMethod.Get, "api/auth/providers");
    public Uri SsoStartUrl(string provider) => new(_http.BaseAddress!, $"api/auth/sso/{provider}");

    // My profile
    public Task<ProfileDto> GetMeAsync() => SendAsync<ProfileDto>(HttpMethod.Get, "api/me");
    public Task<ProfileDto> UpdateMeAsync(UpdateProfileRequest r) => SendAsync<ProfileDto>(HttpMethod.Put, "api/me", r);
    public Task<FlawDto> AddFlawAsync(CreateFlawRequest r) => SendAsync<FlawDto>(HttpMethod.Post, "api/me/flaws", r);
    public Task DeleteFlawAsync(Guid id) => SendAsync(HttpMethod.Delete, $"api/me/flaws/{id}");

    public async Task<string> UploadPhotoAsync(Stream photo, string fileName, string contentType)
    {
        using var content = new MultipartFormDataContent();
        var file = new StreamContent(photo);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(file, "file", fileName);
        using var res = await SendRawAsync(HttpMethod.Post, "api/me/photo", content);
        var body = await res.Content.ReadFromJsonAsync<PhotoUploadResponse>(Json);
        return body!.PhotoUrl;
    }

    // Feed
    public Task<List<ProfileDto>> GetFeedAsync() => SendAsync<List<ProfileDto>>(HttpMethod.Get, "api/feed");
    public Task<SwipeResult> SwipeAsync(SwipeRequest r) => SendAsync<SwipeResult>(HttpMethod.Post, "api/swipes", r);

    // Matches & chat
    public Task<List<MatchDto>> GetMatchesAsync() => SendAsync<List<MatchDto>>(HttpMethod.Get, "api/matches");
    public Task<List<MessageDto>> GetMessagesAsync(Guid matchId, long after) =>
        SendAsync<List<MessageDto>>(HttpMethod.Get, $"api/matches/{matchId}/messages?after={after}");
    public Task<MessageDto> SendMessageAsync(Guid matchId, string text) =>
        SendAsync<MessageDto>(HttpMethod.Post, $"api/matches/{matchId}/messages", new SendMessageRequest(text));
    public Task UnmatchAsync(Guid matchId) => SendAsync(HttpMethod.Delete, $"api/matches/{matchId}");

    // ---- plumbing ----
    private async Task<T> SendAsync<T>(HttpMethod method, string url, object? body = null)
    {
        using var res = await SendRawAsync(method, url, ToJson(body));
        return (await res.Content.ReadFromJsonAsync<T>(Json))!;
    }

    private async Task SendAsync(HttpMethod method, string url, object? body = null)
    {
        using var _ = await SendRawAsync(method, url, ToJson(body));
    }

    private static HttpContent? ToJson(object? body) =>
        body is null ? null : JsonContent.Create(body, body.GetType(), options: Json);

    private async Task<HttpResponseMessage> SendRawAsync(HttpMethod method, string url, HttpContent? content)
    {
        using var req = new HttpRequestMessage(method, url) { Content = content };
        if (session.Token is { Length: > 0 } token)
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var res = await _http.SendAsync(req);
        if (res.IsSuccessStatusCode) return res;

        var message = $"Something went wrong ({(int)res.StatusCode}).";
        try
        {
            var err = await res.Content.ReadFromJsonAsync<ErrorResponse>(Json);
            if (!string.IsNullOrWhiteSpace(err?.Error)) message = err.Error;
        }
        catch { /* body wasn't our error shape */ }

        var status = res.StatusCode;
        res.Dispose();
        throw new ApiException(message, status);
    }
}
