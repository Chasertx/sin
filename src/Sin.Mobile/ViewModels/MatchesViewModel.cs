using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public partial class MatchesViewModel(Session session, ApiClient api) : BaseViewModel(session)
{
    public ObservableCollection<MatchDto> Matches { get; } = [];

    [ObservableProperty] private bool _isEmpty;
    [ObservableProperty] private bool _isRefreshing;

    [RelayCommand]
    public async Task Load()
    {
        await TryAsync(async () =>
        {
            var matches = await api.GetMatchesAsync();
            Matches.Clear();
            foreach (var m in matches) Matches.Add(m);
        }, showBusy: false);
        IsEmpty = Matches.Count == 0;
        IsRefreshing = false;
    }

    public Task OpenAsync(MatchDto match) =>
        Shell.Current.GoToAsync("chat", new Dictionary<string, object> { ["match"] = match });
}
