using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public class MessageItem(MessageDto dto, bool isMine)
{
    public long Id => dto.Id;
    public string Text => dto.Text;
    public bool IsMine => isMine;
    public string Time => dto.SentAt.ToLocalTime().ToString("t");
    public LayoutOptions Align => isMine ? LayoutOptions.End : LayoutOptions.Start;
    public Color Bubble => isMine ? Color.FromArgb("#E5383B") : Color.FromArgb("#2A1A1E");
}

/// <summary>Simple chat that polls every few seconds. Swap for SignalR when you need real-time.</summary>
public partial class ChatViewModel(Session session, ApiClient api) : BaseViewModel(session), IQueryAttributable
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);
    private readonly HashSet<long> _seen = [];
    private MatchDto? _match;
    private long _lastId;
    private CancellationTokenSource? _polling;

    public ObservableCollection<MessageItem> Messages { get; } = [];

    [ObservableProperty] private string _title = "";
    [ObservableProperty] private string _draft = "";

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("match", out var m) && m is MatchDto match)
        {
            _match = match;
            Title = match.OtherName;
        }
    }

    public void StartPolling()
    {
        StopPolling();
        _polling = new CancellationTokenSource();
        _ = PollAsync(_polling.Token);
    }

    public void StopPolling()
    {
        _polling?.Cancel();
        _polling = null;
    }

    private async Task PollAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await FetchNewAsync();
            try { await Task.Delay(PollInterval, ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task FetchNewAsync()
    {
        if (_match is null) return;
        try
        {
            foreach (var m in await api.GetMessagesAsync(_match.MatchId, _lastId)) Add(m);
        }
        catch
        {
            // Transient network errors while polling are ignored; next tick retries.
        }
    }

    private void Add(MessageDto m)
    {
        if (!_seen.Add(m.Id)) return;
        _lastId = Math.Max(_lastId, m.Id);
        Messages.Add(new MessageItem(m, m.SenderId == Session.UserId));
    }

    [RelayCommand]
    private async Task Send()
    {
        var text = Draft.Trim();
        if (_match is null || text.Length == 0) return;
        Draft = "";
        var ok = await TryAsync(async () => Add(await api.SendMessageAsync(_match.MatchId, text)), showBusy: false);
        if (!ok) Draft = text;
    }

    [RelayCommand]
    private async Task Unmatch()
    {
        if (_match is null) return;
        if (!await Shell.Current.DisplayAlert("Unmatch?", $"Turns out {_match.OtherName}'s flaws were too much?", "Unmatch", "Cancel"))
            return;
        if (await TryAsync(() => api.UnmatchAsync(_match.MatchId)))
            await Shell.Current.GoToAsync("..");
    }
}
