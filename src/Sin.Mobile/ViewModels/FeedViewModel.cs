using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public partial class FeedViewModel(Session session, ApiClient api) : BaseViewModel(session)
{
    private readonly Queue<ProfileDto> _queue = new();
    private Guid _loadedForUser;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCurrent))]
    private ProfileDto? _current;

    [ObservableProperty] private bool _isEmpty;

    public bool HasCurrent => Current is not null;

    /// <summary>Called when the tab appears. Reloads if a different user logged in.</summary>
    public async Task EnsureLoadedAsync()
    {
        if (_loadedForUser != Session.UserId)
        {
            _queue.Clear();
            Current = null;
            _loadedForUser = Session.UserId;
        }
        if (Current is null) await RefillAsync();
    }

    [RelayCommand]
    private Task Refresh() => RefillAsync();

    private async Task RefillAsync()
    {
        await TryAsync(async () =>
        {
            var seen = _queue.Select(p => p.Id).Append(Current?.Id ?? Guid.Empty).ToHashSet();
            foreach (var p in await api.GetFeedAsync())
                if (!seen.Contains(p.Id)) _queue.Enqueue(p);
            if (Current is null) Advance();
        });
        IsEmpty = Current is null;
    }

    private void Advance()
    {
        Current = _queue.TryDequeue(out var next) ? next : null;
        IsEmpty = Current is null && !IsBusy;
    }

    /// <summary>Swipe on the current card. Advances immediately; the network call follows.</summary>
    public async Task SwipeAsync(bool canLiveWithIt)
    {
        var target = Current;
        if (target is null) return;
        Advance();

        await TryAsync(async () =>
        {
            var result = await api.SwipeAsync(new SwipeRequest(target.Id, canLiveWithIt));
            if (result.IsMatch)
                await Alert("🚩 It's a match 🚩",
                    $"You and {target.DisplayName} saw the worst of each other and stayed anyway. Say something.");
        }, showBusy: false);

        if (_queue.Count < 3) await RefillAsync();
    }
}
