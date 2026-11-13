using System.Net.Http.Headers;

namespace Sin.Api.Services;

/// <summary>Where profile photos live. Local disk for dev; Supabase Storage when hosted.</summary>
public interface IPhotoStore
{
    Task SaveAsync(string name, Stream content, string contentType);
    Task DeleteAsync(string name);
    string Url(string name, HttpRequest request);
}

/// <summary>Saves to wwwroot/uploads. Fine locally; free hosts wipe their disk on restart.</summary>
public class LocalPhotoStore(IWebHostEnvironment env) : IPhotoStore
{
    private string Dir => Path.Combine(env.WebRootPath, "uploads");

    public async Task SaveAsync(string name, Stream content, string contentType)
    {
        Directory.CreateDirectory(Dir);
        await using var fs = File.Create(Path.Combine(Dir, name));
        await content.CopyToAsync(fs);
    }

    public Task DeleteAsync(string name)
    {
        File.Delete(Path.Combine(Dir, name));
        return Task.CompletedTask;
    }

    public string Url(string name, HttpRequest request) => $"{request.Scheme}://{request.Host}/uploads/{name}";
}

/// <summary>
/// Supabase Storage via its REST API. Needs a *public* bucket (default name "photos").
/// Config: Supabase:Url (https://xxxx.supabase.co), Supabase:ServiceKey (service_role secret), Supabase:Bucket.
/// </summary>
public class SupabasePhotoStore : IPhotoStore
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly string _bucket;

    public SupabasePhotoStore(HttpClient http, IConfiguration config)
    {
        _baseUrl = config["Supabase:Url"]!.TrimEnd('/');
        _bucket = config["Supabase:Bucket"] is { Length: > 0 } b ? b : "photos";
        var key = config["Supabase:ServiceKey"]!;
        _http = http;
        _http.DefaultRequestHeaders.Add("apikey", key);
        // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys
        // aren't JWTs; Supabase's gateway accepts them via the apikey header alone.
        if (key.StartsWith("eyJ"))
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
    }

    public async Task SaveAsync(string name, Stream content, string contentType)
    {
        using var body = new StreamContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/storage/v1/object/{_bucket}/{name}") { Content = body };
        req.Headers.Add("x-upsert", "true");
        using var res = await _http.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Supabase upload failed ({(int)res.StatusCode}): {await res.Content.ReadAsStringAsync()}");
    }

    public async Task DeleteAsync(string name)
    {
        using var res = await _http.DeleteAsync($"{_baseUrl}/storage/v1/object/{_bucket}/{name}");
        // Best effort: a missing old photo shouldn't block uploading a new one.
    }

    public string Url(string name, HttpRequest request) => $"{_baseUrl}/storage/v1/object/public/{_bucket}/{name}";
}
