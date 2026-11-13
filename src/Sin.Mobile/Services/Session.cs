using Sin.Shared;

namespace Sin.Mobile.Services;

/// <summary>Holds the logged-in user's token. Persisted in SecureStorage (Keychain / Keystore).</summary>
public class Session
{
    private const string TokenKey = "sin_token";
    private const string UserIdKey = "sin_user_id";
    private const string NameKey = "sin_name";

    public string? Token { get; private set; }
    public Guid UserId { get; private set; }
    public string? DisplayName { get; private set; }
    public bool IsLoggedIn => !string.IsNullOrEmpty(Token);

    public async Task LoadAsync()
    {
        Token = await GetAsync(TokenKey);
        UserId = Guid.TryParse(await GetAsync(UserIdKey), out var id) ? id : Guid.Empty;
        DisplayName = await GetAsync(NameKey);
    }

    public async Task SaveAsync(AuthResponse auth)
    {
        Token = auth.Token;
        UserId = auth.UserId;
        DisplayName = auth.DisplayName;
        await SetAsync(TokenKey, auth.Token);
        await SetAsync(UserIdKey, auth.UserId.ToString());
        await SetAsync(NameKey, auth.DisplayName);
    }

    public void Clear()
    {
        Token = null;
        UserId = Guid.Empty;
        DisplayName = null;
        foreach (var key in new[] { TokenKey, UserIdKey, NameKey })
        {
            try { SecureStorage.Default.Remove(key); } catch { /* not available */ }
            Preferences.Default.Remove(key);
        }
    }

    // SecureStorage can be unavailable (e.g. iOS simulator without keychain entitlement); fall back to Preferences.
    private static async Task<string?> GetAsync(string key)
    {
        try { return await SecureStorage.Default.GetAsync(key) ?? Preferences.Default.Get<string?>(key, null); }
        catch { return Preferences.Default.Get<string?>(key, null); }
    }

    private static async Task SetAsync(string key, string value)
    {
        try { await SecureStorage.Default.SetAsync(key, value); }
        catch { Preferences.Default.Set(key, value); }
    }
}
