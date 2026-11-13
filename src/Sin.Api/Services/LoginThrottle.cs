using System.Collections.Concurrent;

namespace Sin.Api.Services;

/// <summary>
/// Per-account brute-force protection (complements the per-IP rate limit): after
/// <see cref="MaxFailures"/> wrong passwords within <see cref="Window"/>, that email is locked
/// for the rest of the window. Applies to unknown emails too, so it reveals nothing.
/// In-memory: fine for one instance; move to Redis/Postgres if the API is scaled out.
/// </summary>
public class LoginThrottle(IConfiguration config, TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, (int Failures, DateTimeOffset WindowStart)> _state = new();

    public int MaxFailures { get; } = config.GetValue("Security:LoginLockout:MaxFailures", 5);
    public TimeSpan Window { get; } = TimeSpan.FromMinutes(config.GetValue("Security:LoginLockout:WindowMinutes", 15));

    /// <returns>How long the account is still locked, or null if it may try.</returns>
    public TimeSpan? LockedFor(string email)
    {
        if (!_state.TryGetValue(Key(email), out var s)) return null;
        var elapsed = clock.GetUtcNow() - s.WindowStart;
        if (elapsed >= Window)
        {
            _state.TryRemove(Key(email), out _);
            return null;
        }
        return s.Failures >= MaxFailures ? Window - elapsed : null;
    }

    public void RecordFailure(string email)
    {
        var now = clock.GetUtcNow();
        _state.AddOrUpdate(Key(email),
            _ => (1, now),
            (_, s) => now - s.WindowStart >= Window ? (1, now) : (s.Failures + 1, s.WindowStart));
        if (_state.Count > 100_000) Prune(now);
    }

    public void Reset(string email) => _state.TryRemove(Key(email), out _);

    private void Prune(DateTimeOffset now)
    {
        foreach (var (k, v) in _state)
            if (now - v.WindowStart >= Window) _state.TryRemove(k, out _);
    }

    private static string Key(string email) => email.Trim().ToLowerInvariant();
}
